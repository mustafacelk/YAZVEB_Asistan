// ═══════════════════════════════════════════════════════════════════
// Site API adresi
// ═══════════════════════════════════════════════════════════════════
// Sitenin kendi sunucusuz fonksiyonları (`/api/...`) buradan çağrılır.
//
// NEDEN GÖRELİ ADRES YETMİYOR
// ───────────────────────────
// Telefon uygulaması ekranları internetten değil, kendi içine gömülü
// `dist/` klasöründen açıyor. Orada sayfanın adresi `capacitor://localhost`
// olduğu için "/api/seslendir" telefonun kendi içini işaret eder ve hiçbir
// şey bulunamaz. Bu yüzden adres her zaman tam yazılır.
//
// Sitede çalışırken bu adres sayfanın kendi adresiyle aynı olur; tarayıcı
// isteği "aynı köken" sayar, araya ek bir kontrol turu girmez.
// ═══════════════════════════════════════════════════════════════════

const VARSAYILAN_SITE = "https://yazveb-asistan.vercel.app";

/** Sondaki eğik çizgi iki kez yazılırsa adres bozulur. */
const koku = String(import.meta.env.VITE_SITE_URL ?? VARSAYILAN_SITE).replace(/\/+$/, "");

export function apiAdresi(yol: string): string {
  return koku + (yol.startsWith("/") ? yol : "/" + yol);
}
