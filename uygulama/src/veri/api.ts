// ═══════════════════════════════════════════════════════════════════
// Site API adresi
// ═══════════════════════════════════════════════════════════════════
// Sitenin kendi sunucusuz fonksiyonları (`/api/...`) buradan çağrılır.
//
// NEDEN HER YERDE GÖRELİ ADRES KULLANILAMIYOR
// ───────────────────────────────────────────
// Telefon uygulaması ekranları internetten değil, kendi içine gömülü
// `dist/` klasöründen açıyor. Sayfanın adresi orada `capacitor://localhost`
// olduğu için "/api/seslendir" telefonun kendi içini işaret eder ve hiçbir
// şey bulunamaz — ses sitede çıkar, telefonda çıkmazdı.
//
// Sitede ise göreli adres tercih edilir: bugünkü vercel.app adresine de,
// yarın alınacak kendi alan adına da kendiliğinden uyar ve istek "aynı
// köken" sayıldığı için araya ek bir kontrol turu girmez.
// ═══════════════════════════════════════════════════════════════════

/** Telefon kabuğundan çıkılacak adres. Vercel'de VITE_SITE_URL ile değişir. */
const VARSAYILAN_SITE = "https://yazveb-asistan.vercel.app";

function kokBul(): string {
  const sayfaAdresi =
    typeof location !== "undefined" && /^https?:$/.test(location.protocol);
  if (sayfaAdresi) return "";                       // sitede: aynı köken
  const uzak = String(import.meta.env.VITE_SITE_URL ?? VARSAYILAN_SITE);
  return uzak.replace(/\/+$/, "");                  // sondaki çizgi adresi bozar
}

const koku = kokBul();

export function apiAdresi(yol: string): string {
  return koku + (yol.startsWith("/") ? yol : "/" + yol);
}
