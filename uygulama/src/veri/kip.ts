import { createContext, useContext } from "react";
import type { Rol } from "./supabase";

/**
 * Hangi arayüz açılacak?
 *
 *   uye      etkinlik, QR, puan, ödül — topluluğun çoğunluğu
 *   yonetim  etkinlik, QR görevi, sponsor, kampanya — başkan ve yöneticiler
 *   isletme  kasada ödül onayı — sponsor çalışanı; HESAP YOK, işletme PIN'i
 *
 * Girişte sorulmaz: herkes aynı girişi kullanır, arayüzü BAŞKANIN VERDİĞİ
 * ROL belirler. Burada saklanan tek şey yetkilinin kendi tercihidir
 * (Hesabım → Açılış görünümü) ve işletme ekranı seçimi (girişteki bağlantı).
 *
 * SEÇİM YETKİ VERMEZ
 * ──────────────────
 * Bu yalnızca hangi ekranların önce geleceğidir. "Yönetici" seçen üye
 * yönetici olmaz: rol veritabanında, her yönetim işlemi orada ayrıca
 * denetlenir. Seçim hesabın rolüyle uyuşmazsa üye görünümüne düşülür ve
 * nedeni söylenir.
 */
export type GirisKipi = "uye" | "yonetim" | "isletme";
export type Gorunum = "uye" | "yonetim";

const ANAHTAR = "yazveb:giris-kipi";

export function kipOku(): GirisKipi | null {
  try {
    const d = localStorage.getItem(ANAHTAR);
    return d === "uye" || d === "yonetim" || d === "isletme" ? d : null;
  } catch {
    return null;   // gizli sekme: her açılışta sorulur
  }
}

export function kipYaz(kip: GirisKipi | null) {
  try {
    if (kip) localStorage.setItem(ANAHTAR, kip);
    else localStorage.removeItem(ANAHTAR);
  } catch { /* gizli sekme */ }
}

/**
 * Seçilen giriş türü ile hesabın GERÇEK rolü uzlaştırılır.
 *
 * Seçim yoksa (eski oturum, gizli sekme) yetkili hesap yönetim görünümüyle
 * açılır: bu kişinin uygulamaya gelme sebebi çoğunlukla yönetmektir; üye
 * görünümüne tek dokunuşla geçer.
 */
export function etkinGorunum(secim: GirisKipi | null, rol: Rol | null): { gorunum: Gorunum; uyari: string | null } {
  const yetkili = rol === "yonetici" || rol === "baskan";
  if (secim === "yonetim" && !yetkili) {
    return {
      gorunum: "uye",
      uyari: "Bu hesabın yönetim yetkisi yok; üye görünümüyle açıldı. Yönetici yetkisini topluluk başkanı verir.",
    };
  }
  if (secim === "uye") return { gorunum: "uye", uyari: null };
  return { gorunum: yetkili ? "yonetim" : "uye", uyari: null };
}

export type KipBaglamDegeri = {
  kip: GirisKipi | null;
  /** null: giriş türü seçim ekranına dön. */
  sec: (kip: GirisKipi | null) => void;
};

export const KipBaglami = createContext<KipBaglamDegeri>({ kip: null, sec: () => {} });
export const useKip = () => useContext(KipBaglami);
