// Seslendirme metni testleri:  npm run test:ses
//
// Sentezleyiciye giden metin, bir insanın yüksek sesle okuyacağı biçimde
// olmalı: kısaltmalar söylendiği gibi, sayılar sözcükle, saatler saat gibi.

import { sayiyiYaz, seseHazirla, sirayiYaz } from "../api/_ses/metin.ts";
import { geminiAyari, geminiSeslendir, pcmdenWav } from "../api/_ses/gemini_ses.ts";
import { gecImzasi } from "../api/_ses/gec_imza.ts";

let hata = 0;
let adet = 0;
function esit(ad: string, gercek: string, beklenen: string) {
  adet++;
  const tamam = gercek === beklenen;
  if (!tamam) hata++;
  console.log(tamam ? "✓" : "✗", ad, tamam ? "" : `\n    beklenen: ${beklenen}\n    gelen:    ${gercek}`);
}
function icerir(ad: string, gercek: string, parca: string) {
  adet++;
  const tamam = gercek.includes(parca);
  if (!tamam) hata++;
  console.log(tamam ? "✓" : "✗", ad, tamam ? "" : `\n    aranan: ${parca}\n    gelen:  ${gercek}`);
}
function icermez(ad: string, gercek: string, parca: string) {
  adet++;
  const tamam = !gercek.includes(parca);
  if (!tamam) hata++;
  console.log(tamam ? "✓" : "✗", ad, tamam ? "" : `\n    olmamalı: ${parca}\n    gelen:    ${gercek}`);
}

// ── Sayılar ───────────────────────────────────────────────────────
esit("0", sayiyiYaz(0), "sıfır");
esit("7", sayiyiYaz(7), "yedi");
esit("10", sayiyiYaz(10), "on");
esit("21", sayiyiYaz(21), "yirmi bir");
esit("100 ('bir yüz' değil)", sayiyiYaz(100), "yüz");
esit("250", sayiyiYaz(250), "iki yüz elli");
esit("1000 ('bir bin' değil)", sayiyiYaz(1000), "bin");
esit("1050", sayiyiYaz(1050), "bin elli");
esit("2026", sayiyiYaz(2026), "iki bin yirmi altı");
esit("400.000", sayiyiYaz(400000), "dört yüz bin");
esit("1.000.000 ('bir milyon')", sayiyiYaz(1_000_000), "bir milyon");
esit("2.001.019", sayiyiYaz(2_001_019), "iki milyon bin on dokuz");
esit("sıra 1", sirayiYaz(1), "birinci");
esit("sıra 3", sirayiYaz(3), "üçüncü");
esit("sıra 21", sirayiYaz(21), "yirmi birinci");
esit("sıra 40", sirayiYaz(40), "kırkıncı");

// ── Cümle içinde sayılar ──────────────────────────────────────────
icerir("binlik ayraç", seseHazirla("1.050 XP'n var."), "bin elli iks pi");
icerir("saat + ek", seseHazirla("Seminer 14.00'te başlıyor."), "on dörtte başlıyor");
icerir("saat iki nokta", seseHazirla("Saat 09:30 gibi gel."), "dokuz otuz");
icerir("yıl + ek", seseHazirla("2026'da kuruldu."), "iki bin yirmi altıda");
icerir("yüzde", seseHazirla("%20 indirim"), "yüzde yirmi indirim");
icerir("yüzde + ek", seseHazirla("%20'lik indirim"), "yüzde yirmilik indirim");
icerir("ondalık", seseHazirla("Ortalama 2,5 saat."), "iki virgül beş");
icerir("tarih", seseHazirla("Son tarih 20.09.2026."), "yirmi eylül iki bin yirmi altı");
icerir("sıra sayısı", seseHazirla("3. sınıf öğrencisiyim."), "üçüncü sınıf");
icerir("artı işareti okunmaz", seseHazirla("+100 XP kazandın."), "yüz iks pi kazandın");
icerir("harfe yapışık rakam korunur", seseHazirla("Python 3 ile v2 sürümü."), "v2");
icerir("sayı sonrası nokta cümle sonu", seseHazirla("Üye sayımız 400. Sen de gel."), "dört yüz. Sen");

// ── Kısaltmalar ───────────────────────────────────────────────────
icerir("CV", seseHazirla("CV'ni hazırla."), "si vi'ni");
icerir("QR", seseHazirla("QR kodu okut."), "kü ar kodu");
icerir("AI", seseHazirla("AI alanında çalış."), "ey ay alanında");
icerir("LLM", seseHazirla("LLM nedir?"), "el el em");
icerir("ChatGPT", seseHazirla("ChatGPT kullanıyor musun?"), "çet ci pi ti");
icerir("YAZVEB sözcük gibi", seseHazirla("YAZVEB etkinliği"), "Yazveb etkinliği");
icerir("seviye adı", seseHazirla("CREATOR seviyesindesin."), "kriyeytır seviyesindesin");
icerir("KVKK Türkçe harflerle kalır", seseHazirla("KVKK kapsamında"), "KVKK");
icermez("küçük harfli 'it' dokunulmaz", seseHazirla("GitHub hesabı"), "ay ti");

// ── Unvanlar ve noktalı kısaltmalar ───────────────────────────────
icerir("Doç. Dr.", seseHazirla("Danışmanımız Doç. Dr. Aynur Yonar."), "Doçent Doktor Aynur Yonar");
icerir("Prof. Dr.", seseHazirla("Dekan Prof. Dr. Mustafa Şahin."), "Profesör Doktor Mustafa Şahin");
icerir("vb.", seseHazirla("Seminer, atölye vb. etkinlikler"), "ve benzeri etkinlikler");
icerir("örn.", seseHazirla("örn. İstatistik Günü"), "örneğin İstatistik Günü");
icerir("Öğr. Gör.", seseHazirla("Öğr. Gör. Ali Kaya ders veriyor."), "Öğretim Görevlisi Ali Kaya");

// ── Adresler ve işaretler ─────────────────────────────────────────
icerir("Instagram hesabı", seseHazirla("@yapayzekaveribilimitop.su hesabına yaz."), "yapay zeka veri bilimi top nokta es u");
icermez("hesap adında 'et' kalmaz", seseHazirla("@yapayzekaveribilimitop.su"), " et ");
icerir("resmî site", seseHazirla("selcuk.edu.tr adresine bak."), "selcuk nokta edu nokta te re");
icerir("bağlantı okunmaz", seseHazirla("https://ornek.com/uzun/yol bak"), "bağlantı bak");
icerir("ayraç noktası duraklamaya", seseHazirla("Başladı · 14.00"), "Başladı, on dört");
icerir("ve işareti", seseHazirla("Yapay Zeka & Veri Bilimi"), "Yapay Zeka ve Veri Bilimi");
icermez("yıldız ve diyez okunmaz", seseHazirla("**Önemli** # başlık"), "*");
icerir("cümle sonuna nokta", seseHazirla("Merhaba"), "Merhaba.");

// ── Uçtan uca: asistanın tipik cevabı ─────────────────────────────
esit("tipik etkinlik cevabı",
  seseHazirla("En yakın etkinlik 20 Eylül Cumartesi 14.00'te, Fen Fakültesi'nde. QR'yi okutursan +100 XP kazanırsın."),
  "En yakın etkinlik yirmi Eylül Cumartesi on dörtte, Fen Fakültesi'nde. kü ar'yi okutursan yüz iks pi kazanırsın.");

// ── İsteğe bağlı Gemini sesi (ağa çıkmadan, sahte cevapla) ─────────
const dogru = (ad: string, kosul: boolean) => { adet++; if (!kosul) hata++; console.log(kosul ? "✓" : "✗", ad); };

dogru("varsayılan: Gemini kapalı", geminiAyari({ GOOGLE_API_KEY: "x" }) === null);
dogru("anahtar yoksa kapalı", geminiAyari({ SES_SAGLAYICI: "gemini" }) === null);
{
  const a = geminiAyari({ SES_SAGLAYICI: "gemini", GOOGLE_API_KEY: "x", GEMINI_SES: "../evil?x=1" });
  dogru("açık; adrese girecek ses adı süzülür", a !== null && a.ses === "Achird" && a.model === "gemini-3.1-flash-tts-preview");
}
{
  const wav = pcmdenWav(Buffer.alloc(48000), 24000);
  dogru("WAV başlığı: RIFF/WAVE, 24 kHz, 16 bit mono",
    wav.toString("ascii", 0, 4) === "RIFF" && wav.toString("ascii", 8, 12) === "WAVE" &&
    wav.readUInt32LE(24) === 24000 && wav.readUInt16LE(34) === 16 && wav.readUInt16LE(22) === 1 &&
    wav.readUInt32LE(40) === 48000 && wav.length === 48044);
}
{
  const gercekFetch = globalThis.fetch;
  const ayar = { anahtar: "anahtar-deneme", model: "gemini-3.1-flash-tts-preview", ses: "Achird" };
  let giden: { adres: string; baslik: Record<string, string>; govde: string } | null = null;

  globalThis.fetch = (async (adres: string, s: RequestInit) => {
    giden = { adres, baslik: s.headers as Record<string, string>, govde: String(s.body) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: {
      mimeType: "audio/L16;codec=pcm;rate=24000", data: Buffer.alloc(4800).toString("base64") } }] } }] }), { status: 200 });
  }) as typeof fetch;
  const s = await geminiSeslendir("Merhaba.", ayar, 1000);
  dogru("PCM cevabı WAV'a çevrilir", s.tur === "audio/wav" && s.ses.length === 4844);
  dogru("anahtar adreste değil başlıkta", !!giden && !giden!.adres.includes("anahtar-deneme") && giden!.baslik["x-goog-api-key"] === "anahtar-deneme");
  dogru("ton yönergesi ve ses adı gider", !!giden && giden!.govde.includes("samimi") && giden!.govde.includes("Achird"));

  globalThis.fetch = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
  let dustu = false;
  try { await geminiSeslendir("Merhaba.", ayar, 1000); } catch { dustu = true; }
  dogru("kota dolunca (429) hata fırlatır → Microsoft sesine düşülür", dustu);

  globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })) as unknown as typeof fetch;
  dustu = false;
  try { await geminiSeslendir("Merhaba.", ayar, 1000); } catch { dustu = true; }
  dogru("boş cevapta hata fırlatır (sessiz kalınmaz)", dustu);
  globalThis.fetch = gercekFetch;
}

// ── Edge okuma servisi imzası (v2) ─────────────────────────────────
// Başvuru değerleri edge-tts 7.3.1 (Python) generate_sec_ms_gec_v2 çıktısı.
// 2026-10'da eski imza 403 almaya başlamıştı; algoritma bozulursa ses yine susar.
{
  const BASVURU: [number, string][] = [
    [0, "52BC7A17B50DFEC9-28C4394775C8751CD2F6859C030C06DB1489ACAB3B3A7651831FC26895177ED6"],
    [1700000000, "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2"],
    [1791900000.7, "5F546AEBA6D1BF75-CB47F061F310028902E5F18F2301717FD3A7439129E80730643BC73362B7134F"],
    [1760000123, "BAF4076F572BFE4E-2D6FBE5C0E24F56622EB94F37395F2D153C6C0C451DAAE2249A459BB3AFAD62C"],
    [2000000000, "2D62557F1142BC5D-FD9C30C68FF194A5EE6B45FEFC5E2BA1D1239F88A90569AB55CFFFAA7799F40E"],
  ];
  for (const [t, beklenen] of BASVURU) dogru(`v2 imza edge-tts ile aynı (${t})`, gecImzasi(t) === beklenen);
  dogru("aynı 5 dakikalık dilimde imza değişmez", gecImzasi(1791900000) === gecImzasi(1791900000 + 200));
  dogru("imza biçimi <16 hex>-<64 hex>", /^[0-9A-F]{16}-[0-9A-F]{64}$/.test(gecImzasi()));
}

console.log(`\n${adet - hata}/${adet} geçti`);
process.exit(hata ? 1 : 0);
