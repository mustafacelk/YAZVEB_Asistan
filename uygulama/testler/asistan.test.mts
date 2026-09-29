// Asistan: model cevabı okuma, yedekli yarış, sesli soru, seslendirme parçaları.
//   npm run test:asistan
//
// Model sahte: gecikme ve hata istenen gibi üretilir. Soru şu: "cevabı
// getiremedim" dendiği durumlar (boş cevap, kota, takılma) artık cevaba
// dönüşüyor mu, ve bunu yaparken modele gereksiz yüklenilmiyor mu?

import {
  cevapMetni,
  cumledeKes,
  dusunmeAyari,
  ENGEL_CEVABI,
  ModelHatasi,
  sesIstegiDogrula,
  transkriptGovdesi,
  transkriptTemizle,
  yarisliSor,
  type Cagri,
} from "../supabase/functions/asistan/model.ts";
import { modelGovdesi } from "../supabase/functions/asistan/guvenlik.ts";
import { sesParcalari } from "../src/canli/parcala.ts";

let hata = 0;
let adet = 0;
function bekle(ad: string, kosul: boolean, ayrinti = "") {
  adet++;
  if (!kosul) hata++;
  console.log(kosul ? "✓" : "✗", ad, kosul ? "" : ayrinti);
}
const js = (x: unknown) => JSON.stringify(x);
const uyu = (ms: number) => new Promise((c) => setTimeout(c, ms));

// ── Cevap okuma ────────────────────────────────────────────────────
const yanitla = (parts: unknown[], finishReason = "STOP") => ({ candidates: [{ content: { parts }, finishReason }] });

bekle("parçalı metin birleşir", cevapMetni(yanitla([{ text: "Merhaba, " }, { text: "nasılsın?" }])) === "Merhaba, nasılsın?");
bekle("düşünce parçası atılır", cevapMetni(yanitla([{ text: "iç ses", thought: true }, { text: "Cevap." }])) === "Cevap.");
bekle("ilk parça yalnızca imza olsa da metin bulunur (eski hata)",
  cevapMetni(yanitla([{ thoughtSignature: "abc" }, { text: "Cevap burada." }])) === "Cevap burada.");
let firlatti = false;
try { cevapMetni(yanitla([{ text: "düşündüm", thought: true }], "MAX_TOKENS")); } catch (h) { firlatti = h instanceof ModelHatasi; }
bekle("bütçe düşünmeye gittiyse (metin yok) hata — yarış yeniden dener", firlatti);
bekle("jeton sınırında kesilen cevap son cümlede biter",
  cevapMetni(yanitla([{ text: "Etkinlik cuma günü. Saat on dörtte başlıyor. Yer olarak da amfi" }], "MAX_TOKENS")) === "Etkinlik cuma günü. Saat on dörtte başlıyor.");
bekle("güvenlik engeli hata değil, ret cümlesi", cevapMetni({ promptFeedback: { blockReason: "SAFETY" } }) === ENGEL_CEVABI);
bekle("güvenlik nedeniyle boş aday da ret cümlesi", cevapMetni(yanitla([], "SAFETY")) === ENGEL_CEVABI);
bekle("cümle sonu yoksa üç nokta", cumledeKes("Bu çok uzun bir cümle ve bitmedi,") === "Bu çok uzun bir cümle ve bitmedi…");
bekle("yarım etiket kesilir", !cumledeKes("Tamam. Bak [[git:etk").includes("[["));
bekle("saat noktası cümle sonu sayılmaz", cumledeKes("Başlangıç 14.30 ve bitiş on altı") === "Başlangıç 14.30 ve bitiş on altı…");

// ── Düşünme ayarı ──────────────────────────────────────────────────
bekle("Gemini 3.x: minimal düşünme", js(dusunmeAyari("gemini-3.5-flash-lite")) === js({ thinkingLevel: "minimal" }));
bekle("Gemini 2.5 Flash-Lite: düşünme kapalı", js(dusunmeAyari("gemini-2.5-flash-lite")) === js({ thinkingBudget: 0 }));
bekle("Gemini 2.0: ayar yok", dusunmeAyari("gemini-2.0-flash") === null);
const govde = modelGovdesi("T", { soru: "s", gecmis: [] }, 220, { thinkingLevel: "minimal" }, 512);
bekle("gövdeye düşünme ayarı ve payı girer",
  govde.generationConfig.maxOutputTokens === 732 && js((govde.generationConfig as { thinkingConfig?: unknown }).thinkingConfig) === js({ thinkingLevel: "minimal" }));
bekle("eski çağrı biçimi aynen çalışır", js(modelGovdesi("T", { soru: "s", gecmis: [] }, 100).generationConfig) === js({ maxOutputTokens: 100 }));

// ── Yedekli yarış ──────────────────────────────────────────────────
type Plan = Record<string, { ms: number; sonuc: string | number }[]>;
/** Model başına sıralı davranış: her çağrı listeden bir sonrakini alır. */
function sahte(plan: Plan) {
  const cagrilar: string[] = [];
  const sayac: Record<string, number> = {};
  const cagir: Cagri = async (model, dusunmeli) => {
    cagrilar.push(model + (dusunmeli ? "" : "(ayarsız)"));
    const i = sayac[model] = (sayac[model] ?? -1) + 1;
    const d = plan[model]?.[Math.min(i, plan[model].length - 1)] ?? { ms: 5, sonuc: 500 };
    await uyu(d.ms);
    if (typeof d.sonuc === "number") throw new ModelHatasi(`model HTTP ${d.sonuc}`, d.sonuc);
    return d.sonuc;
  };
  return { cagir, cagrilar };
}
const ayar = { birincil: "A", yedek: "B", ikinciAtisMs: 60, yedekAtisMs: 140, toplamMs: 400 };

{
  const s = sahte({ A: [{ ms: 5, sonuc: "a" }] });
  const c = await yarisliSor({ ...ayar, cagir: s.cagir });
  bekle("hızlı birincil: tek çağrı", c === "a" && js(s.cagrilar) === js(["A"]), js(s.cagrilar));
}
{
  const s = sahte({ A: [{ ms: 5, sonuc: 429 }], B: [{ ms: 5, sonuc: "b" }] });
  const t0 = Date.now();
  const c = await yarisliSor({ ...ayar, cagir: s.cagir });
  await uyu(120);   // ikinci atış zamanı geçsin: kota yiyen modele yeniden gidilmemeli
  bekle("kota (429): hemen yedeğe geçer, birincile yüklenmez",
    c === "b" && Date.now() - t0 < 250 && s.cagrilar.filter((m) => m === "A").length === 1, js(s.cagrilar));
}
{
  const s = sahte({ A: [{ ms: 1000, sonuc: "geç" }, { ms: 5, sonuc: "a2" }] });
  const c = await yarisliSor({ ...ayar, cagir: s.cagir });
  bekle("takılan birincil: ikinci atış kazanır", c === "a2", js(s.cagrilar));
}
{
  const s = sahte({ A: [{ ms: 1000, sonuc: "geç" }], B: [{ ms: 5, sonuc: "b" }] });
  const c = await yarisliSor({ ...ayar, cagir: s.cagir });
  bekle("birincil hep takılıyorsa yedek zamanında devreye girer", c === "b", js(s.cagrilar));
}
{
  const s = sahte({ A: [{ ms: 5, sonuc: 400 }, { ms: 5, sonuc: "a" }] });
  const ayarsizlar = new Set<string>();
  const c = await yarisliSor({ ...ayar, cagir: s.cagir, ayarsizlar });
  bekle("düşünme ayarını tanımayan model: ayarsız yeniden dener ve hatırlar",
    c === "a" && s.cagrilar[1] === "A(ayarsız)" && ayarsizlar.has("A"), js(s.cagrilar));
}
{
  const s = sahte({ A: [{ ms: 5, sonuc: 503 }, { ms: 5, sonuc: 503 }], B: [{ ms: 5, sonuc: 503 }] });
  let h: unknown = null;
  const t0 = Date.now();
  await yarisliSor({ ...ayar, cagir: s.cagir }).catch((e) => { h = e; });
  bekle("hepsi düşerse süreyi beklemeden hata", h instanceof ModelHatasi && Date.now() - t0 < 300, js(s.cagrilar));
}
{
  const s = sahte({ A: [{ ms: 5, sonuc: 500 }, { ms: 5, sonuc: "a2" }] });
  const c = await yarisliSor({ ...ayar, yedek: null, cagir: s.cagir });
  bekle("yedek yokken geçici hata: aynı modele bir kez daha", c === "a2", js(s.cagrilar));
}
{
  const s = sahte({ A: [{ ms: 2000, sonuc: "çok geç" }], B: [{ ms: 2000, sonuc: "çok geç" }] });
  let h: unknown = null;
  const t0 = Date.now();
  await yarisliSor({ ...ayar, cagir: s.cagir }).catch((e) => { h = e; });
  bekle("toplam süre aşılınca vazgeçer", !!h && Date.now() - t0 < 600);
}

// ── Sesli soru ─────────────────────────────────────────────────────
bekle("WAV kabul edilir", sesIstegiDogrula({ veri: "UklGRg==", tur: "audio/wav" }).tamam);
bekle("bilinmeyen tür reddedilir", !sesIstegiDogrula({ veri: "UklGRg==", tur: "text/html" }).tamam);
bekle("base64 olmayan veri reddedilir", !sesIstegiDogrula({ veri: "<script>", tur: "audio/wav" }).tamam);
bekle("çok uzun kayıt reddedilir", !sesIstegiDogrula({ veri: "A".repeat(900_004), tur: "audio/wav" }).tamam);
const tg = transkriptGovdesi({ veri: "UklGRg==", tur: "audio/wav" }, null);
bekle("kayıt satır içi veri olarak gider, talimat ayrı parça",
  js(tg.contents[0].parts[0]) === js({ inline_data: { mime_type: "audio/wav", data: "UklGRg==" } }) && "text" in tg.contents[0].parts[1]);
bekle("'BOŞ' → boş metin", transkriptTemizle("BOŞ") === "" && transkriptTemizle("Boş.") === "");
bekle("tırnak ve fazla boşluk temizlenir", transkriptTemizle('  "Etkinlikler  ne zaman?" ') === "Etkinlikler ne zaman?");

// ── Seslendirme parçaları ──────────────────────────────────────────
const uzun = "Merhaba! Bu hafta iki etkinlik var. Perşembe 14.30'da Doç. Dr. Ayşe Hanım'ın semineri, cuma günü de Python atölyesi. " +
  "İkisine de QR okutarak puan kazanabilirsin. Kilidini açtığın sponsorların ödüllerini Ödüller sekmesinde görürsün.";
const p = sesParcalari(uzun);
bekle("parçalar birleşince metin aynen çıkar (senkron için şart)", p.map((x) => x.metin).join("") === uzun, js(p));
bekle("ilk parça kısa: ses çabuk başlasın", p[0].metin.trim().length <= 120, js(p[0]));
bekle("en fazla üç parça (ses kotası)", p.length >= 2 && p.length <= 3, String(p.length));
bekle("'Doç. Dr.' ve '14.30' bölünmez", !p.some((x) => /Doç\.\s*$|Dr\.\s*$|14\.$/.test(x.metin.trim())), js(p.map((x) => x.metin)));
bekle("başlangıç konumları doğru", p.every((x) => uzun.slice(x.bas, x.bas + x.metin.length) === x.metin));
bekle("kısa metin tek parça", sesParcalari("Tamam, görüşürüz!").length === 1);
bekle("boş metin parça üretmez", sesParcalari("   ").length === 0);

console.log(`\n${adet - hata}/${adet} geçti`);
process.exit(hata ? 1 : 0);
