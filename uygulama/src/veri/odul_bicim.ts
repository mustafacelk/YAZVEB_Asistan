// Ödül sistemi — saf biçimlendirme ve cihaz yardımcıları (ağ yok).
import type { Kilit, Profil, Seviye } from "./odul";


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

/**
 * "Bir sonraki adım" — XP'nin ne işe yaradığını tek cümlede söyler.
 *
 * Seviye çubuğu ile sponsor kilidi iki ayrı hedefti ve ekranda yan yana iki
 * farklı sayı olarak duruyordu ("BUILDER 500" ve "Coffee Lab'a 120 XP").
 * Hedefe yakınlık çabayı artırır (goal gradient); bu yüzden EN YAKIN somut
 * kazanç ana cümle olur, diğeri tek satırlık bağlam.
 */
export type SonrakiAdim = { ana: string; ikincil: string | null };

export function sonrakiAdim(
  p: Pick<Profil, "xp" | "etkinlik_sayisi" | "seviye" | "sonraki_kilit" | "toplam_sponsor">,
): SonrakiAdim {
  const sv = p.seviye.sonraki;
  const seviyeEksik = sv ? Math.max(0, sv.esik - p.xp) : null;
  const k = p.sonraki_kilit;
  const kilitli = k && (k.eksik_xp > 0 || k.eksik_etkinlik > 0) ? k : null;

  if (p.xp === 0 && p.etkinlik_sayisi === 0) {
    return {
      ana: "İlk etkinliğinde QR'yi okut; puanın oradan başlar.",
      ikincil: kilitli
        ? `${sayi(kilitli.gerekli_xp)} XP'de ${kilitli.sponsor} kilidi açılıyor.`
        : sv ? `${sayi(sv.esik)} XP'de ${sv.ad} seviyesi.` : null,
    };
  }

  if (kilitli) {
    if (kilitli.eksik_xp === 0) {
      return {
        ana: `${kilitli.sponsor} için ${kilitli.eksik_etkinlik} etkinliğe daha katıl.`,
        ikincil: sv && seviyeEksik ? `${sv.ad} seviyesine ${sayi(seviyeEksik)} XP.` : null,
      };
    }
    if (seviyeEksik === null || kilitli.eksik_xp <= seviyeEksik) {
      return {
        ana: hedefCumlesi(kilitli) ?? "",
        ikincil: sv && seviyeEksik !== null
          ? seviyeEksik === kilitli.eksik_xp
            ? `Aynı anda ${sv.ad} seviyesine çıkarsın.`
            : `${sv.ad} seviyesine ${sayi(seviyeEksik)} XP.`
          : null,
      };
    }
    return {
      ana: `${sv!.ad} seviyesine ${sayi(seviyeEksik)} XP kaldı.`,
      ikincil: `${kilitli.sponsor} kilidine ${sayi(kilitli.eksik_xp)} XP.`,
    };
  }

  return {
    ana: sv && seviyeEksik ? `${sv.ad} seviyesine ${sayi(seviyeEksik)} XP kaldı.` : "En üst seviyedesin.",
    ikincil: p.toplam_sponsor > 0 ? "Bütün sponsor kilitleri açık." : null,
  };
}

/**
 * Ödülün bitmesine az kaldıysa gerçek süre. Uzaksa hiçbir şey: kullanıcıyı
 * boş yere acele ettirmek yok, yalnızca kaçırmasın diye.
 */
export function sonKullanimEtiketi(iso: string, simdi = Date.now()): string | null {
  const gun = (new Date(iso).getTime() - simdi) / 86_400_000;
  if (gun <= 0 || gun > 3) return null;
  if (gun < 1) return "Son 24 saat";
  return `${Math.ceil(gun)} gün kaldı`;
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
