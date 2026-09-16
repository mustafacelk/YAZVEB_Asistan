// Ödül sistemi — saf biçimlendirme ve cihaz yardımcıları (ağ yok).
import type { Kilit, Seviye } from "./odul";


const sayiBicimi = new Intl.NumberFormat("tr-TR");
export const sayi = (n: number) => sayiBicimi.format(n);

export const tarih = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });

export const tarihSaat = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "Bir sonraki hedef" cümlesi — ilerleme hissinin kalbi. */
export function hedefCumlesi(k: (Kilit & { sponsor: string }) | null): string | null {
  if (!k) return null;
  if (k.eksik_xp > 0 && k.eksik_etkinlik > 0) {
    return `${k.sponsor} kilidine ${sayi(k.eksik_xp)} XP ve ${k.eksik_etkinlik} etkinlik kaldı.`;
  }
  if (k.eksik_xp > 0) return `${k.sponsor} kilidine ${sayi(k.eksik_xp)} XP kaldı.`;
  if (k.eksik_etkinlik > 0) return `${k.sponsor} kilidine ${k.eksik_etkinlik} etkinlik kaldı.`;
  return null;
}

/** 0..1 arası seviye ilerlemesi. */
export function seviyeIlerlemesi(xp: number, s: Seviye): number {
  if (!s.sonraki) return 1;
  const aralik = s.sonraki.esik - s.esik;
  return aralik <= 0 ? 1 : Math.max(0, Math.min(1, (xp - s.esik) / aralik));
}

/** Konum şartlı görevler için; izin yoksa null. */
export function konumAl(zamanAsimi = 8000): Promise<{ enlem: number; boylam: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((coz) => {
    navigator.geolocation.getCurrentPosition(
      (k) => coz({ enlem: k.coords.latitude, boylam: k.coords.longitude }),
      () => coz(null),
      { enableHighAccuracy: true, timeout: zamanAsimi, maximumAge: 30000 },
    );
  });
}

/** Dokunsal geri bildirim (destekleyen telefonlarda). */
export function titret(desen: number | number[]) {
  try {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) navigator.vibrate?.(desen);
  } catch {
    /* desteklenmiyor */
  }
}
