// ═══════════════════════════════════════════════════════════════════
// Seslendirme — Vercel sunucusuz fonksiyonu
// ═══════════════════════════════════════════════════════════════════
// Metni alır, MP3 döndürür. Ses Microsoft'un neural Türkçe seslerinden
// gelir (bkz. _ses/edge_ses.ts); API anahtarı gerekmez, ücretsizdir.
//
// KİM, NE KADAR ÇAĞIRABİLİR
// ─────────────────────────
// Yalnızca giriş yapmış üyeler ve yalnızca kotaları kadar. Her istek,
// kullanıcının oturum jetonuyla veritabanındaki `kota_harca` fonksiyonuna
// sorulur; jeton geçersizse 401, kota dolmuşsa 429. Kota olmasaydı herhangi
// bir hesap bu ucu sınırsız bir seslendirme servisi gibi kullanabilir ve
// sitenin sunucu adresi karşı tarafta engellenebilirdi.
//
// Önceki sürüm doğrulanmış jetonları bellekte tutuyordu; kota her istekte
// sayılmak zorunda olduğu için o önbellek kaldırıldı (bir çağrı zaten
// ikisini birden yapıyor).
// ═══════════════════════════════════════════════════════════════════

import { seslendir, type SesAyari } from "./_ses/edge_ses.js";
import { seseHazirla } from "./_ses/metin.js";
import { geminiAyari, geminiSeslendir } from "./_ses/gemini_ses.js";
import {
  izinliKokenler,
  jwtBicimli,
  kokenIzinli,
  kotaHarca,
  olay,
  SES_SINIR,
  sesIstegiDogrula,
} from "./_guvenlik/ortak.js";

// Her sesin kendi temposu var. Tek bir global hız verilince Ahmet aceleci,
// Emel uyuşuk çıkıyor; profil sesin kendi tabanına göre ayarlanır.
const SESLER: Record<string, SesAyari> = {
  ahmet: { ses: "tr-TR-AhmetNeural", hiz: "+3%", perde: "-2Hz", seviye: "+0%" },
  emel: { ses: "tr-TR-EmelNeural", hiz: "+2%", perde: "-1Hz", seviye: "+0%" },
};
const VARSAYILAN_SES = "ahmet";
const SESLENDIRME_ZAMAN_ASIMI_MS = 15000;
// Gemini geç kalırsa beklemek yerine Microsoft sesine düşülür. İkisinin
// toplamı fonksiyonun 20 saniyelik süresini aşmamalı (vercel.json).
const GEMINI_ZAMAN_ASIMI_MS = 6000;
const YEDEK_ZAMAN_ASIMI_MS = 12000;
const GEMINI = geminiAyari(process.env);

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_ANAHTAR = process.env.VITE_SUPABASE_ANON_KEY ?? "";
const IZINLI = izinliKokenler();

type Istek = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type Yanit = {
  status: (kod: number) => Yanit;
  setHeader: (ad: string, deger: string) => void;
  json: (govde: unknown) => void;
  send: (govde: Buffer) => void;
  end: () => void;
};

const baslikOku = (istek: Istek, ad: string) => {
  const d = istek.headers[ad];
  return Array.isArray(d) ? d[0] : d;
};

function kapiyiAc(istek: Istek, yanit: Yanit) {
  const koken = baslikOku(istek, "origin");
  yanit.setHeader("Vary", "Origin");
  if (kokenIzinli(koken, IZINLI)) {
    yanit.setHeader("Access-Control-Allow-Origin", koken!);
    yanit.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    yanit.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    yanit.setHeader("Access-Control-Max-Age", "86400");
  }
}

function hata(yanit: Yanit, kod: number, mesaj: string) {
  yanit.setHeader("Cache-Control", "no-store");
  return yanit.status(kod).json({ hata: mesaj });
}

export default async function handler(istek: Istek, yanit: Yanit) {
  kapiyiAc(istek, yanit);
  yanit.setHeader("X-Content-Type-Options", "nosniff");

  if (istek.method === "OPTIONS") return yanit.status(204).end();
  if (istek.method !== "POST") return hata(yanit, 405, "yöntem desteklenmiyor");

  const koken = baslikOku(istek, "origin");
  if (koken && !kokenIzinli(koken, IZINLI)) {
    olay("koken_red", { uc: "seslendir" });
    return hata(yanit, 403, "izin verilmeyen köken");
  }

  if (!(baslikOku(istek, "content-type") ?? "").toLowerCase().includes("application/json")) {
    return hata(yanit, 415, "JSON bekleniyor");
  }
  if (Number(baslikOku(istek, "content-length") ?? "0") > SES_SINIR.govdeBayt) {
    olay("govde_buyuk", { uc: "seslendir" });
    return hata(yanit, 413, "istek çok büyük");
  }

  const yetki = baslikOku(istek, "authorization") ?? "";
  const jeton = yetki.startsWith("Bearer ") ? yetki.slice(7).trim() : "";
  if (!jwtBicimli(jeton)) {
    olay("yetkisiz", { uc: "seslendir", neden: "jeton yok" });
    return hata(yanit, 401, "giriş gerekli");
  }

  let govde: unknown = istek.body;
  if (typeof govde === "string") {
    try { govde = JSON.parse(govde); } catch { return hata(yanit, 400, "bozuk istek"); }
  }
  const dogrulama = sesIstegiDogrula(govde, Object.keys(SESLER));
  if (!dogrulama.tamam) {
    olay("gecersiz_girdi", { uc: "seslendir", neden: dogrulama.neden });
    return hata(yanit, 400, "geçersiz istek");
  }

  const kota = await kotaHarca("ses", jeton, SUPABASE_URL, SUPABASE_ANAHTAR);
  if (kota === "kimliksiz") {
    olay("yetkisiz", { uc: "seslendir", neden: "jeton geçersiz" });
    return hata(yanit, 401, "giriş gerekli");
  }
  if (kota === "sinir") {
    olay("kota", { uc: "seslendir" });
    yanit.setHeader("Retry-After", "60");
    return hata(yanit, 429, "çok fazla istek");
  }
  if (kota !== "tamam") {
    // Kota denetlenemiyorsa kapalı başarısız ol.
    olay("kota_denetimi_yok", { uc: "seslendir" });
    return hata(yanit, 503, "şu an kullanılamıyor");
  }

  const hazir = seseHazirla(dogrulama.deger.metin).slice(0, SES_SINIR.hazirMetin);
  if (!hazir) return hata(yanit, 400, "geçersiz istek");

  const ayar = SESLER[dogrulama.deger.ses ?? VARSAYILAN_SES];

  // İsteğe bağlı doğal ses: yalnızca açıkça etkinleştirildiyse.
  if (GEMINI) {
    try {
      const { ses, tur } = await geminiSeslendir(hazir, GEMINI, GEMINI_ZAMAN_ASIMI_MS);
      yanit.setHeader("Content-Type", tur);
      yanit.setHeader("Cache-Control", "private, max-age=86400");
      return yanit.status(200).send(ses);
    } catch (h) {
      // Kota dolmuş (429), model yanıt vermemiş ya da biçim değişmiş olabilir.
      // Kullanıcı sessiz kalmasın: Microsoft sesine düş.
      olay("gemini_ses_yedege_dustu", { neden: String(h).slice(0, 120) });
    }
  }

  try {
    const ses = await seslendir(hazir, ayar, GEMINI ? YEDEK_ZAMAN_ASIMI_MS : SESLENDIRME_ZAMAN_ASIMI_MS);
    yanit.setHeader("Content-Type", "audio/mpeg");
    // Aynı cevap iki kez seslendirilmesin diye tarayıcı önbelleğine bırakılır.
    yanit.setHeader("Cache-Control", "private, max-age=86400");
    return yanit.status(200).send(ses);
  } catch (h) {
    // Ayrıntı yalnızca sunucu günlüğüne.
    olay("seslendirme_hatasi", { neden: String(h).slice(0, 120) });
    return hata(yanit, 502, "seslendirilemedi");
  }
}
