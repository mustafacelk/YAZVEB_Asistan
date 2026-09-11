import {
  DOLGU,
  HIZLI_EN_FAZLA_KELIME,
  HIZLI_KALIPLAR,
} from "./sohbet_kaliplari";

/**
 * Gündelik sohbet cümleleri için sunucuya gitmeden cevap.
 *
 * "Merhaba", "nasılsın", "teşekkürler" için ağ çağrısı yapmanın anlamı yok:
 * cevap zaten sabit. Telefonda bu fark, cevabın anında gelmesi ile yarım
 * saniye beklemek arasındaki farktır.
 *
 * Kalıplar `bilgi_disa_aktar.py` tarafından zincir.py'den üretilir — yani
 * sesli asistan ile bu uygulama aynı cümleleri kullanır, ayrışmazlar.
 */

// Türkçe büyük/küçük harf tuzağı: "I".toLowerCase() "ı" değil "i" verir.
const SESSIZ = /[.,!?;:…"'()[\]{}–—-]/g;

export function sadelestir(metin: string): string {
  return (metin ?? "")
    .replace(/I/g, "ı")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(SESSIZ, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Gündelik sohbet cümlesiyse hazır cevabı, değilse null.
 *
 * Eşleşmenin cümlenin TAMAMINI kaplaması gerekir. Yalnızca "başında geçiyor"
 * denseydi "Merhaba, etkinlik ne zaman?" selamla karşılanır, asıl soru
 * cevapsız kalırdı — hızlı yolun en kolay düşülen tuzağı budur.
 */
export function hizliCevap(soru: string): string | null {
  const t = sadelestir(soru);
  if (!t || t.split(" ").length > HIZLI_EN_FAZLA_KELIME) return null;

  for (const { anahtarlar, cevaplar } of HIZLI_KALIPLAR) {
    for (const anahtar of anahtarlar) {
      let kalan: string | null = null;
      if (t === anahtar) kalan = "";
      else if (t.startsWith(anahtar + " ")) kalan = t.slice(anahtar.length + 1);
      else if (t.endsWith(" " + anahtar)) kalan = t.slice(0, -anahtar.length - 1);
      else continue;

      if (kalan === "" || kalan.split(" ").every((k) => DOLGU.has(k))) {
        return cevaplar[Math.floor(Math.random() * cevaplar.length)];
      }
    }
  }
  return null;
}
