// ═══════════════════════════════════════════════════════════════════
// Model yokken cevap — bilgi bankasından en uygun kayıt
// ═══════════════════════════════════════════════════════════════════
// Saf: Deno'ya da ağa da dokunmaz (testler/asistan.test.mts).
//
// NEDEN
// ─────
// 2026-10-13 günlüğü: anahtar ücretsiz katmanda; Google yoğunlukta
// ücretsiz istekleri ilk keser ve o anda BÜTÜN modeller HTTP 503 döner
// (yedek ve son çare dahil). Asistan o dakikalarda "getiremedim" demek
// yerine kurumsal hafızadaki en uygun kaydı kısaca okur. Kayıt bulunmazsa
// dürüstçe "servis yoğun" der.
// ═══════════════════════════════════════════════════════════════════

export type Kayit = { baslik: string; anahtarlar: string[]; metin: string };

/** Hiçbir kayıt uymazsa: ne olduğunu söyleyen, ne yapılacağını öneren cümle. */
export const YOGUN_CEVABI =
  "Yapay zekâ servisi şu an çok yoğun, cevabı getiremedim. Birkaç dakika sonra tekrar sorar mısın?";

/** Cevap okunacağı için en fazla bu kadar cümle. */
const EN_FAZLA_CUMLE = 3;
/** Bu puanın altındaki eşleşme tahmin sayılır, okunmaz. */
const ESIK = 3;

/** Küçük harf (Türkçe), noktalama boşluk, fazla boşluk tek. */
export function sadele(metin: string): string {
  return metin
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Türkçe eklerden kurtulmak için kaba kök: ilk beş harf. */
const kok = (k: string) => k.slice(0, 5);

/** Soru dolgusu: eşleşmeye katılmaz. */
const DOLGU = new Set([
  "nedir", "neler", "nasıl", "nasil", "hangi", "kimdir", "midir", "mıdır", "musun", "müsün",
  "benim", "bana", "sizin", "bizim", "bunu", "şunu", "şimdi", "acaba", "lütfen", "yazveb",
]);

/**
 * KURUMSAL_HAFIZA metnini kayıtlara ayırır. Kayıtlar "[TÜR] Başlık" satırıyla
 * başlar; arada gerçek boş satır ya da (dışa aktarımdan kalan) yazı olarak
 * "\n\n" olabilir, ikisi de kabul edilir.
 */
export function kayitlariAyristir(hafiza: string): Kayit[] {
  return hafiza
    .replace(/\\n/g, "\n")
    .split(/\n\s*\n(?=\[)/)
    .map((parca) => {
      const satirlar = parca.trim().split("\n");
      const baslik = (satirlar[0] ?? "").replace(/^\[[^\]]*\]\s*/, "").trim();
      const anahtarSatiri = satirlar.find((s) => /^ANAHTAR KELİMELER:/i.test(s)) ?? "";
      const anahtarlar = anahtarSatiri.replace(/^ANAHTAR KELİMELER:\s*/i, "")
        .split(",").map((a) => sadele(a)).filter(Boolean);
      const metin = satirlar.slice(1).filter((s) => s !== anahtarSatiri).join(" ").replace(/\s+/g, " ").trim();
      return { baslik, anahtarlar, metin };
    })
    .filter((k) => k.baslik && k.metin);
}

/** Bir kaydın soruya uygunluk puanı. */
export function puanla(soru: string, k: Kayit): number {
  const s = sadele(soru);
  const sozcukler = s.split(" ").filter((x) => x.length >= 3 && !DOLGU.has(x));
  let puan = 0;
  // Anahtar ifade sorunun içinde aynen geçiyorsa güçlü işaret (çok kelimeli daha güçlü).
  for (const a of k.anahtarlar) {
    if (a.length >= 3 && (` ${s} `).includes(` ${a}`)) puan += 2 + a.split(" ").length;
  }
  // Kök eşleşmesi: "katılırım" ~ "katılım", "etkinlikler" ~ "etkinlik".
  const kokler = new Set(
    [...k.anahtarlar.flatMap((a) => a.split(" ")), ...sadele(k.baslik).split(" ")]
      .filter((x) => x.length >= 4).map(kok),
  );
  for (const w of sozcukler) if (w.length >= 4 && kokler.has(kok(w))) puan += 1;
  return puan;
}

/** Metnin ilk birkaç cümlesi (sayıdaki nokta cümle sonu sayılmaz). */
export function ilkCumleler(metin: string, adet = EN_FAZLA_CUMLE): string {
  let sayac = 0;
  for (let i = 0; i < metin.length; i++) {
    // Cümle sonu: nokta/ünlem/soru ve ardından boşluk ya da metnin sonu.
    if (".!?".includes(metin[i]) && (i === metin.length - 1 || /\s/.test(metin[i + 1]))) {
      if (++sayac === adet) return metin.slice(0, i + 1).trim();
    }
  }
  return metin.trim();
}

/** Soruya en uygun kaydın kısa metni; yeterince uyan kayıt yoksa null. */
export function bankadanCevap(soru: string, kayitlar: Kayit[]): string | null {
  let en: Kayit | null = null;
  let enPuan = 0;
  for (const k of kayitlar) {
    const p = puanla(soru, k);
    if (p > enPuan) { en = k; enPuan = p; }
  }
  return en && enPuan >= ESIK ? ilkCumleler(en.metin) : null;
}
