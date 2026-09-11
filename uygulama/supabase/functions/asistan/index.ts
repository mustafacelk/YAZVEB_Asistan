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
// KİM ÇAĞIRABİLİR
// ───────────────
// Supabase bu fonksiyonu çağıran isteğin JWT'sini kendisi doğrular.
// Yani yalnızca uygulamaya giriş yapmış topluluk üyeleri asistanı
// kullanabilir; internetteki rastgele biri kotayı tüketemez.
//
// NEDEN VEKTÖR ARAMASI YOK
// ────────────────────────
// Kurumsal hafızanın tamamı ~4.800 jeton — modelin tek istemine rahat
// sığıyor. Parçalayıp en yakın beşini aramak bu ölçekte hem fazladan bir ağ
// çağrısı (gömme) hem de isabet kaybı riski. Hepsini vermek daha hızlı,
// daha basit ve daha doğru.
// ═══════════════════════════════════════════════════════════════════

import {
  HATA_CEVABI,
  KURUMSAL_HAFIZA,
  SISTEM_TALIMATI,
} from "./bilgi.ts";

const MODEL = Deno.env.get("YAZVEB_MODEL") ?? "gemini-3.5-flash-lite";
const ANAHTAR = Deno.env.get("GOOGLE_API_KEY") ?? "";

// Ölçüm (33 çağrı): model ya ~1,2 saniyede dönüyor ya da ~20 saniye takılıyor.
// Arada değer yok. Takılan isteği beklemek yerine yanına ikincisini atıp ilk
// döneni almak, kuyruk gecikmesini saniyelerce kısaltıyor.
const IKINCI_ATIS_MS = 3000;
const SON_BEKLEME_MS = 12000;
const DENEME = 3;

const EN_FAZLA_JETON = 170;   // cevap sesli okunuyor; uzun cevap hem kötü duyuluyor hem geç geliyor
const GECMIS_TUR = 6;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mesaj = { rol: "user" | "assistant"; icerik: string };

function yanit(govde: unknown, durum = 200) {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Modeli sorar; takılırsa beklemek yerine ikinci bir istek atar. */
async function modeliSor(istem: string): Promise<string> {
  const adres =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const govde = JSON.stringify({
    contents: [{ parts: [{ text: istem }] }],
    generationConfig: { maxOutputTokens: EN_FAZLA_JETON },
  });

  const cagir = () =>
    fetch(adres, {
      method: "POST",
      headers: { "x-goog-api-key": ANAHTAR, "Content-Type": "application/json" },
      body: govde,
    })
      .then((y) => (y.ok ? y.json() : y.text().then((t) => {
        throw new Error(`${y.status} ${t.slice(0, 120)}`);
      })))
      .then((v) => {
        const metin = v?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof metin !== "string" || !metin.trim()) throw new Error("boş cevap");
        return metin.trim();
      });

  const ucanlar: Promise<string>[] = [];
  let sonHata: unknown = null;

  for (let atis = 0; atis < DENEME; atis++) {
    ucanlar.push(cagir());
    const sonuncu = atis === DENEME - 1;
    const bekleme = sonuncu ? SON_BEKLEME_MS : IKINCI_ATIS_MS;

    // Uçan isteklerden biri dönerse onu al; hiçbiri dönmezse süre dolunca
    // yeni bir istek daha at. Takılan istek iptal EDİLMEZ (API desteklemiyor),
    // kendi hâline bırakılır.
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

function istemKur(soru: string, gecmis: Mesaj[]): string {
  const son = gecmis.slice(-GECMIS_TUR);
  const konusma = son.length
    ? son
      .map((m) => `${m.rol === "user" ? "Kullanıcı" : "Asistan"}: ${m.icerik}`)
      .join("\n")
    : "(ilk mesaj)";

  const bugun = new Date().toLocaleDateString("tr-TR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Europe/Istanbul",
  });

  return `${SISTEM_TALIMATI}

════════ KURUMSAL HAFIZA ════════
${KURUMSAL_HAFIZA}

════════ ARAÇ NOTLARI ════════
Bugünün tarihi: ${bugun}

════════ SON KONUŞMA ════════
${konusma}

════════ SORU ════════
${soru}`;
}

Deno.serve(async (istek) => {
  if (istek.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (istek.method !== "POST") return yanit({ hata: "yalnızca POST" }, 405);

  if (!ANAHTAR) {
    console.error("GOOGLE_API_KEY tanımlı değil");
    return yanit({ cevap: HATA_CEVABI, kaynak: "yapılandırma" });
  }

  let soru = "";
  let gecmis: Mesaj[] = [];
  try {
    const govde = await istek.json();
    soru = String(govde?.soru ?? "").trim();
    if (Array.isArray(govde?.gecmis)) gecmis = govde.gecmis.slice(-GECMIS_TUR);
  } catch {
    return yanit({ hata: "bozuk istek" }, 400);
  }

  if (!soru) return yanit({ hata: "boş soru" }, 400);
  if (soru.length > 1000) soru = soru.slice(0, 1000);

  const basla = Date.now();
  try {
    const cevap = await modeliSor(istemKur(soru, gecmis));
    return yanit({ cevap, kaynak: "kurumsal hafıza", sure_ms: Date.now() - basla });
  } catch (hata) {
    console.error("[asistan]", String(hata).slice(0, 200));
    return yanit({ cevap: HATA_CEVABI, kaynak: "hata", sure_ms: Date.now() - basla });
  }
});
