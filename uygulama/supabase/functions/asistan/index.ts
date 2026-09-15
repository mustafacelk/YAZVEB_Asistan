// ═══════════════════════════════════════════════════════════════════
// YAZVEB Asistanı — Supabase Edge Function
// ═══════════════════════════════════════════════════════════════════
//
// NEDEN SUNUCUDA
// ──────────────
// Model anahtarı uygulamanın içine KONULAMAZ. Mobil uygulama kullanıcının
// cihazında çalışır; paketten çıkarılan anahtar başkasının faturasına
// sınırsız istek atmak demektir. Anahtar burada, Supabase'in gizli
// değişkenlerinde durur ve cihaza hiç inmez.
//
// KİM ÇAĞIRABİLİR — VE NEDEN GEÇİT YETMİYORDU
// ───────────────────────────────────────────
// Önceki sürüm "Supabase geçidi JWT'yi doğrular" varsayımına güveniyordu.
// Yeni biçim anahtarlarda (sb_publishable_…) bu doğru değil: geçit, JS
// paketinde herkese açık duran publishable anahtarı da kabul ediyor.
// Denetimde doğrulandı — giriş yapmamış biri bu uca istek atıp ücretli
// modelden cevap alabiliyordu.
//
// Artık her istek, kullanıcının KENDİ oturum jetonuyla `kota_harca`
// fonksiyonunu çağırır. PostgREST jetonun imzasını doğrular; aynı çağrı
// kimliği ve kotayı birlikte denetler (bkz. veritabani/04_guvenlik.sql).
//
// NEDEN VEKTÖR ARAMASI YOK
// ────────────────────────
// Kurumsal hafızanın tamamı ~4.800 jeton — modelin tek istemine rahat
// sığıyor. Hepsini vermek daha hızlı, daha basit ve daha doğru.
// ═══════════════════════════════════════════════════════════════════

import { HATA_CEVABI, KURUMSAL_HAFIZA, SISTEM_TALIMATI } from "./bilgi.ts";
import {
  ciktiyiSuz,
  GUVENLIK_TALIMATI,
  istegiDogrula,
  kokenIzinli,
  modelGovdesi,
  SINIR,
  VARSAYILAN_KOKENLER,
} from "./guvenlik.ts";

const MODEL = Deno.env.get("YAZVEB_MODEL") ?? "gemini-3.5-flash-lite";
const ANAHTAR = Deno.env.get("GOOGLE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const KOKENLER = (Deno.env.get("IZINLI_KOKENLER") ?? "")
  .split(",").map((k) => k.trim()).filter(Boolean);
const IZINLI = KOKENLER.length ? KOKENLER : VARSAYILAN_KOKENLER;

// Ölçüm (33 çağrı): model ya ~1,2 saniyede dönüyor ya da ~20 saniye takılıyor.
// Takılan isteği beklemek yerine yanına ikincisini atıp ilk döneni almak,
// kuyruk gecikmesini saniyelerce kısaltıyor. Kotada TEK istek sayılır;
// kullanıcı başına en fazla 3 model çağrısı demektir, sınırlar buna göre.
const IKINCI_ATIS_MS = 3000;
const SON_BEKLEME_MS = 12000;
const DENEME = 3;
const MODEL_ZAMAN_ASIMI_MS = 20000;   // tek model çağrısı
const KOTA_ZAMAN_ASIMI_MS = 5000;

const EN_FAZLA_JETON = 170;

// Talimat bir kez kurulur. Tarih istek anında eklenir.
const SABIT_TALIMAT = `${SISTEM_TALIMATI}\n\n${GUVENLIK_TALIMATI}`;

type Olay = "yetkisiz" | "kota" | "kota_denetimi_yok" | "gecersiz_girdi" | "govde_buyuk" | "koken_red" | "cikti_suzuldu" | "model_hatasi";

/**
 * Güvenlik olayı günlüğü. Supabase fonksiyon günlüklerine yapılandırılmış
 * JSON olarak düşer. Jeton, soru metni veya IP YAZILMAZ.
 */
function olay(tur: Olay, ayrinti: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ olay: tur, zaman: new Date().toISOString(), ...ayrinti }));
}

function corsBasliklari(koken: string | null): Record<string, string> {
  const b: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (koken && kokenIzinli(koken, IZINLI)) b["Access-Control-Allow-Origin"] = koken;
  return b;
}

function yanit(govde: unknown, durum: number, koken: string | null) {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: {
      ...corsBasliklari(koken),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Zaman aşımlı fetch. Dış servis askıda kalırsa fonksiyon da kalmasın. */
function sureli(adres: string, secenek: RequestInit, ms: number) {
  return fetch(adres, { ...secenek, signal: AbortSignal.timeout(ms) });
}

/**
 * Kimlik + kota. Kullanıcının jetonuyla veritabanına sorulur.
 * 'tamam' | 'sinir' | 'kimliksiz' | 'hata'
 */
async function kotaHarca(jeton: string, apikey: string): Promise<string> {
  try {
    const y = await sureli(`${SUPABASE_URL}/rest/v1/rpc/kota_harca`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jeton}`,
        apikey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_tur: "asistan" }),
    }, KOTA_ZAMAN_ASIMI_MS);
    // Geçersiz / süresi dolmuş / uydurma jeton: PostgREST 401 döner.
    if (y.status === 401 || y.status === 403) return "kimliksiz";
    if (!y.ok) return "hata";
    const sonuc = await y.json();
    return typeof sonuc === "string" ? sonuc : "hata";
  } catch {
    return "hata";
  }
}

/** Gövdeyi okur ama sınırı aşan baytta keser: 1 GB'lık gövde belleğe alınmaz. */
async function govdeyiOku(istek: Request): Promise<string | null> {
  const bildirilen = Number(istek.headers.get("content-length") ?? "0");
  if (bildirilen > SINIR.govdeBayt) return null;
  if (!istek.body) return "";
  const okuyucu = istek.body.getReader();
  const parcalar: Uint8Array[] = [];
  let toplam = 0;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    toplam += value.byteLength;
    if (toplam > SINIR.govdeBayt) {
      await okuyucu.cancel();
      return null;
    }
    parcalar.push(value);
  }
  const birlesik = new Uint8Array(toplam);
  let konum = 0;
  for (const p of parcalar) { birlesik.set(p, konum); konum += p.byteLength; }
  return new TextDecoder().decode(birlesik);
}

/** Modeli sorar; takılırsa beklemek yerine ikinci bir istek atar. */
async function modeliSor(govde: unknown): Promise<string> {
  const adres =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const metin = JSON.stringify(govde);

  const cagir = () =>
    sureli(adres, {
      method: "POST",
      // Anahtar başlıkta; URL'de olsaydı ara sunucu günlüklerine düşebilirdi.
      headers: { "x-goog-api-key": ANAHTAR, "Content-Type": "application/json" },
      body: metin,
    }, MODEL_ZAMAN_ASIMI_MS)
      .then((y) => (y.ok ? y.json() : Promise.reject(new Error(`model HTTP ${y.status}`))))
      .then((v) => {
        const cevap = v?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof cevap !== "string" || !cevap.trim()) throw new Error("boş cevap");
        return cevap.trim();
      });

  const ucanlar: Promise<string>[] = [];
  let sonHata: unknown = null;

  for (let atis = 0; atis < DENEME; atis++) {
    ucanlar.push(cagir());
    const sonuncu = atis === DENEME - 1;
    const bekleme = sonuncu ? SON_BEKLEME_MS : IKINCI_ATIS_MS;

    const sonuc = await Promise.race([
      Promise.any(ucanlar).then((d) => ({ tur: "cevap" as const, d })).catch((h) => {
        sonHata = h;
        return { tur: "hata" as const };
      }),
      new Promise<{ tur: "sure" }>((c) => setTimeout(() => c({ tur: "sure" }), bekleme)),
    ]);

    if (sonuc.tur === "cevap") return sonuc.d;
    if (sonuc.tur === "hata" && sonuncu) break;
  }

  throw sonHata ?? new Error("model yanıt vermedi");
}

Deno.serve(async (istek) => {
  const koken = istek.headers.get("origin");

  if (istek.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsBasliklari(koken) });
  }
  if (istek.method !== "POST") return yanit({ hata: "yöntem desteklenmiyor" }, 405, koken);

  // Tarayıcıdan gelen ve izinli olmayan köken: CORS başlığı olmadan da
  // tarayıcı cevabı okutmazdı, ama isteğin modele kadar gidip maliyet
  // üretmesine de gerek yok. Kökensiz istekler (mobil kabuk, sunucu) geçer
  // — onları zaten jeton ve kota sınırlıyor.
  if (koken && !kokenIzinli(koken, IZINLI)) {
    olay("koken_red");
    return yanit({ hata: "izin verilmeyen köken" }, 403, koken);
  }

  if (!(istek.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return yanit({ hata: "JSON bekleniyor" }, 415, koken);
  }

  const baslik = istek.headers.get("authorization") ?? "";
  const jeton = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : "";
  const apikey = istek.headers.get("apikey") ?? "";
  // Kullanıcı jetonu üç parçalı bir JWT'dir. Publishable anahtar bu biçimde
  // değildir; ağa hiç çıkmadan reddedilir.
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jeton) || !apikey) {
    olay("yetkisiz", { neden: "jeton yok" });
    return yanit({ hata: "giriş gerekli" }, 401, koken);
  }

  const ham = await govdeyiOku(istek);
  if (ham === null) {
    olay("govde_buyuk");
    return yanit({ hata: "istek çok büyük" }, 413, koken);
  }

  let json: unknown;
  try {
    json = JSON.parse(ham);
  } catch {
    olay("gecersiz_girdi", { neden: "JSON bozuk" });
    return yanit({ hata: "bozuk istek" }, 400, koken);
  }

  const dogrulama = istegiDogrula(json);
  if (!dogrulama.tamam) {
    olay("gecersiz_girdi", { neden: dogrulama.neden });
    return yanit({ hata: "geçersiz istek" }, 400, koken);
  }

  // Kota, doğrulamadan SONRA: bozuk istek kullanıcının kotasını yemesin.
  const kota = await kotaHarca(jeton, apikey);
  if (kota === "kimliksiz") {
    olay("yetkisiz", { neden: "jeton geçersiz" });
    return yanit({ hata: "giriş gerekli" }, 401, koken);
  }
  if (kota === "sinir") {
    olay("kota");
    return new Response(JSON.stringify({ hata: "çok fazla istek" }), {
      status: 429,
      headers: {
        ...corsBasliklari(koken),
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "60",
      },
    });
  }
  if (kota !== "tamam") {
    // Kota sistemine ulaşılamıyorsa KAPALI başarısız ol: denetimsiz istek
    // modele gitmesin.
    olay("kota_denetimi_yok");
    return yanit({ cevap: HATA_CEVABI }, 503, koken);
  }

  if (!ANAHTAR) {
    console.error("[asistan] model anahtarı tanımlı değil");
    return yanit({ cevap: HATA_CEVABI }, 503, koken);
  }

  const bugun = new Date().toLocaleDateString("tr-TR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Europe/Istanbul",
  });
  const talimat =
    `${SABIT_TALIMAT}\n\n════════ KURUMSAL HAFIZA ════════\n${KURUMSAL_HAFIZA}\n\n` +
    `════════ ARAÇ NOTLARI ════════\nBugünün tarihi: ${bugun}`;

  try {
    const modelCevabi = await modeliSor(modelGovdesi(talimat, dogrulama.deger, EN_FAZLA_JETON));
    // Sızıntı süzgeci yalnızca davranış talimatına bakar. Kurumsal hafızadaki
    // bilgiyi aynen aktarmak meşru bir cevaptır.
    const suzulmus = ciktiyiSuz(modelCevabi, SABIT_TALIMAT);
    if (!suzulmus.guvenli) olay("cikti_suzuldu");
    return yanit({ cevap: suzulmus.metin }, 200, koken);
  } catch (hata) {
    // Ayrıntı yalnızca sunucu günlüğüne; istemciye genel cümle.
    olay("model_hatasi", { neden: String(hata).slice(0, 120) });
    return yanit({ cevap: HATA_CEVABI }, 200, koken);
  }
});
