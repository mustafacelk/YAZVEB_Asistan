// ═══════════════════════════════════════════════════════════════════
// Seslendirme — Vercel sunucusuz fonksiyonu
// ═══════════════════════════════════════════════════════════════════
// Metni alır, MP3 döndürür. Ses Microsoft'un neural Türkçe seslerinden
// gelir (bkz. _ses/edge_ses.ts); API anahtarı gerekmez, ücretsizdir.
//
// KİM ÇAĞIRABİLİR
// ───────────────
// Yalnızca giriş yapmış üyeler. İstek, kullanıcının Supabase oturum
// jetonunu taşımak zorunda. Açık bırakılsaydı endpoint internete bedava
// bir seslendirme servisi olarak sunulmuş olurdu.
//
// Jeton doğrulaması ağ çağrısı gerektirir; sonuç jetonun süresi dolana
// kadar bellekte tutulur, böylece sıcak örnekte her istek için tekrar
// sorulmaz.
// ═══════════════════════════════════════════════════════════════════

import { seslendir, type SesAyari } from "./_ses/edge_ses.js";
import { seseHazirla } from "./_ses/metin.js";

// Her sesin kendi temposu var. Tek bir global hız verilince Ahmet aceleci,
// Emel uyuşuk çıkıyor; profil sesin kendi tabanına göre ayarlanır.
const SESLER: Record<string, SesAyari> = {
  ahmet: { ses: "tr-TR-AhmetNeural", hiz: "+3%", perde: "-2Hz", seviye: "+0%" },
  emel: { ses: "tr-TR-EmelNeural", hiz: "+2%", perde: "-1Hz", seviye: "+0%" },
};
const VARSAYILAN_SES = "ahmet";
const EN_UZUN_METIN = 1200;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANAHTAR = process.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Doğrulanmış jetonlar: jeton → geçerlilik bitişi (ms). */
const dogrulanmis = new Map<string, number>();

function jetonPayload(jeton: string): { exp?: number; iss?: string } | null {
  try {
    const govde = jeton.split(".")[1];
    if (!govde) return null;
    return JSON.parse(Buffer.from(govde, "base64url").toString());
  } catch {
    return null;
  }
}

/**
 * Jeton bu projeye ait ve geçerli mi?
 *
 * Önce imzasız kontroller yapılır (ucuz): biçim, süre, veren. Bunlar
 * geçerse imza bir kez ağ üzerinden doğrulanır ve sonuç önbelleğe alınır.
 * Tek başına payload'a bakmak yeterli olmazdı — imzasız bir jeton elle
 * uydurulabilir.
 */
async function uyeMi(jeton: string): Promise<boolean> {
  if (!jeton || !SUPABASE_URL) return false;

  const simdi = Date.now();
  const bitis = dogrulanmis.get(jeton);
  if (bitis && bitis > simdi) return true;

  const yuk = jetonPayload(jeton);
  if (!yuk?.exp || yuk.exp * 1000 <= simdi) return false;
  if (!yuk.iss || !yuk.iss.startsWith(SUPABASE_URL)) return false;

  try {
    const yanit = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jeton}`, apikey: SUPABASE_ANAHTAR },
    });
    if (!yanit.ok) return false;
  } catch {
    return false;
  }

  // Bellek sınırsız büyümesin; sıcak örnekte birkaç yüz jeton fazlasıyla yeter.
  if (dogrulanmis.size > 500) dogrulanmis.clear();
  dogrulanmis.set(jeton, Math.min(yuk.exp * 1000, simdi + 3600_000));
  return true;
}

/**
 * Tarayıcıya "başka adresten çağrılabilir" izni verir.
 *
 * Sitede istek zaten aynı adrese gittiği için bu başlıklar oraya
 * dokunmaz. Gerekli oldukları yer telefon uygulaması: orada sayfa
 * cihazın içinden açıldığı için istek dışarıdan geliyor sayılır ve
 * izin verilmezse tarayıcı cevabı okutmaz.
 *
 * Kapı açık bırakılmış olmuyor — istek yine de geçerli bir oturum
 * jetonu taşımak zorunda; jeton olmadan gelen hiçbir çağrı ses almaz.
 */
function kapiyiAc(yanit: any) {
  yanit.setHeader("Access-Control-Allow-Origin", "*");
  yanit.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  yanit.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  yanit.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(istek: any, yanit: any) {
  kapiyiAc(yanit);
  if (istek.method === "OPTIONS") return yanit.status(204).end();
  if (istek.method !== "POST") {
    return yanit.status(405).json({ hata: "yalnızca POST" });
  }

  const baslik: string = istek.headers?.authorization ?? "";
  const jeton = baslik.startsWith("Bearer ") ? baslik.slice(7) : "";
  if (!(await uyeMi(jeton))) {
    return yanit.status(401).json({ hata: "giriş gerekli" });
  }

  const govde = typeof istek.body === "string" ? safeJson(istek.body) : istek.body;
  const hazir = seseHazirla(String(govde?.metin ?? "")).slice(0, EN_UZUN_METIN);
  if (!hazir) return yanit.status(400).json({ hata: "boş metin" });

  const sesAdi =
    typeof govde?.ses === "string" && SESLER[govde.ses] ? govde.ses : VARSAYILAN_SES;

  try {
    const ses = await seslendir(hazir, SESLER[sesAdi]);
    yanit.setHeader("Content-Type", "audio/mpeg");
    // Aynı cevap iki kez seslendirilmesin diye tarayıcı önbelleğine bırakılır.
    yanit.setHeader("Cache-Control", "private, max-age=86400");
    return yanit.status(200).send(ses);
  } catch (hata) {
    console.error("[seslendir]", String(hata).slice(0, 300));
    // Ses gelmezse uygulama susar ama çökmez; cevap metni zaten ekranda.
    return yanit.status(502).json({ hata: "seslendirilemedi" });
  }
}

function safeJson(m: string) {
  try { return JSON.parse(m); } catch { return {}; }
}
