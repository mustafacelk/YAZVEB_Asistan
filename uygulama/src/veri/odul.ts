// ═══════════════════════════════════════════════════════════════════
// YAZVEB Community Rewards — istemci veri katmanı
// ═══════════════════════════════════════════════════════════════════
// Bu dosya yalnızca SORAR ve GÖSTERİR. Puan, kilit, stok, ödül kararlarının
// hepsi veritabanındaki odul_* fonksiyonlarında (bkz. veritabani/05_oduller.sql).
// Buradaki hiçbir değer sunucuya "doğru" diye geri gönderilmez.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from "./supabase";

// ── Tipler ─────────────────────────────────────────────────────────

export type Seviye = {
  id?: number;
  sira: number;
  ad: string;
  esik: number;
  ikon: string;
  aciklama?: string | null;
  sonraki: { ad: string; esik: number } | null;
};

export type Kilit = {
  acik: boolean;
  gerekli_xp: number;
  gerekli_seviye: string | null;
  gerekli_etkinlik: number;
  eksik_xp: number;
  eksik_etkinlik: number;
};

export type PuanIslemi = { miktar: number; tur: "gorev" | "seri_bonusu" | "yonetici"; aciklama: string; zaman: string };

export type Profil = {
  xp: number;
  etkinlik_sayisi: number;
  seri: number;
  gizli: boolean;
  seviye: Seviye;
  seviyeler: { ad: string; esik: number; ikon: string }[];
  sonraki_kilit: (Kilit & { sponsor: string; id: string }) | null;
  acik_sponsor: number;
  toplam_sponsor: number;
  aktif_odul: number;
  islemler: PuanIslemi[];
  ayarlar: { seri_acik: boolean; seri_bonuslari: Record<string, number>; liderlik_acik: boolean };
  yetkili: boolean;
  baskan: boolean;
};

export type KampanyaDurumu =
  | { durum: "yok" }
  | { durum: "yakinda"; id: string; ad: string; baslangic: string }
  | { durum: "bitti"; id: string; ad: string; bitis: string }
  | {
      durum: "aktif" | "az" | "son" | "tukendi";
      id: string;
      ad: string;
      bitis: string;
      surpriz: boolean;
      sinirsiz: boolean;
      kalan: number | null;
      toplam: number | null;
      hak: number;
      alinan: number;
      oduller: { baslik: string; ikon: string; tur: string; kalan: number | null; toplam: number | null }[] | null;
    };

export type Sponsor = {
  id: string;
  ad: string;
  aciklama: string | null;
  logo: string | null;
  website: string | null;
  adres: string | null;
  kilit: Kilit;
  kampanya: KampanyaDurumu;
};

export type KazanimOzeti = {
  id: string;
  sponsor: string;
  baslik: string;
  tur: string;
  ikon: string;
  aciklama: string | null;
  zaman: string;
  son_kullanma: string;
  kullanildi: string | null;
  durum: "aktif" | "kullanildi" | "suresi_doldu" | "iptal";
};

export type GorevSonucu =
  | {
      durum: "tamam";
      baslik: string;
      puan: number;
      bonus: number;
      seri: number;
      xp: number;
      xp_once: number;
      seviye: Seviye;
      seviye_atladi: boolean;
      yeni_kilitler: string[];
      sonraki_kilit: (Kilit & { sponsor: string }) | null;
    }
  | { durum: Exclude<GorevDurumu, "tamam">; baslik?: string; baslangic?: string };

export type GorevDurumu =
  | "tamam" | "zaten_alindi" | "gecersiz" | "suresi_doldu" | "baslamadi" | "tukendi"
  | "konum_gerekli" | "konum_uzak" | "sinir" | "kimliksiz" | "sponsor_qr";

export type SponsorSonucu =
  | {
      durum: "tamam";
      kazanim: { id: string; sponsor: string; baslik: string; tur: string; ikon: string;
                 aciklama: string | null; kod: string; zaman: string; son_kullanma: string };
    }
  | { durum: "kilitli"; kilit: Kilit }
  | { durum: "zaten_alindi" | "gecersiz" | "yanlis_sponsor" | "suresi_doldu" | "baslamadi"
            | "tukendi" | "sinir" | "kimliksiz" | "gorev_qr"; baslangic?: string };

export type GosterSonucu = {
  durum: "aktif" | "kullanildi" | "suresi_doldu" | "iptal" | "bulunamadi";
  id: string;
  kod: string;
  sponsor: string;
  baslik: string;
  ikon: string;
  tur: string;
  aciklama: string | null;
  zaman: string;
  son_kullanma: string;
  kullanildi: string | null;
  dogrulama: string;
  pencere_bitis: string;
  sunucu_zamani: string;
};

export type KullanSonucu = {
  durum: "kullanildi" | "zaten_kullanildi" | "pin_hatali" | "pin_tanimsiz" | "sinir"
       | "suresi_doldu" | "iptal" | "bulunamadi" | "kimliksiz";
  zaman?: string;
  kalan_deneme?: number;
};

export type Liderlik =
  | { acik: false }
  | {
      acik: true;
      liste: { sira: number; ad: string; xp: number; seviye: string; seri: number; ben: boolean }[];
      ben: { xp: number; gizli: boolean; sira: number | null };
    };

// ── Çağrı ──────────────────────────────────────────────────────────

/** Sunucudan gelen hata metinleri yalnızca bizim yazdığımız mesajlarsa gösterilir. */
export class OdulHatasi extends Error {}

async function cagir<T>(fonksiyon: string, parametre?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fonksiyon, parametre ?? {});
  if (error) {
    // 42501 / 22023 / 23505: veritabanındaki kendi yazdığımız, kullanıcıya
    // gösterilebilir cümleler. Diğer hatalar (bağlantı, iç hata) genel mesaj.
    const bizim = ["42501", "22023", "23505", "22003", "P0001"].includes(error.code ?? "");
    throw new OdulHatasi(bizim && error.message ? error.message : "Sunucuya ulaşılamadı. Biraz sonra tekrar dene.");
  }
  return data as T;
}

export const odul = {
  profil: () => cagir<Profil>("odul_profil"),
  sponsorlar: () => cagir<Sponsor[]>("odul_sponsorlar"),
  sponsorDetay: (id: string) => cagir<Sponsor | null>("odul_sponsor_detay", { p_id: id }),
  gorevTamamla: (icerik: string, konum?: { enlem: number; boylam: number }) =>
    cagir<GorevSonucu>("odul_gorev_tamamla", {
      p_icerik: icerik,
      p_enlem: konum?.enlem ?? null,
      p_boylam: konum?.boylam ?? null,
    }),
  sponsorTara: (sponsorId: string, icerik: string) =>
    cagir<SponsorSonucu>("odul_sponsor_tara", { p_sponsor: sponsorId, p_icerik: icerik }),
  cuzdan: () => cagir<KazanimOzeti[]>("odul_cuzdan"),
  goster: (id: string) => cagir<GosterSonucu>("odul_goster", { p_id: id }),
  kullan: (id: string, pin: string) => cagir<KullanSonucu>("odul_kullan", { p_id: id, p_pin: pin }),
  liderlik: () => cagir<Liderlik>("odul_liderlik"),
  gizlilik: (gizli: boolean) => cagir<void>("odul_gizlilik", { p_gizli: gizli }),
};

// ── İnsan dili ─────────────────────────────────────────────────────

export const GOREV_MESAJI: Record<Exclude<GorevDurumu, "tamam">, string> = {
  zaten_alindi: "Bu görevin puanını zaten aldın.",
  gecersiz: "Bu kod geçerli değil. Harfleri kontrol et.",
  suresi_doldu: "Bu görevin süresi doldu.",
  baslamadi: "Bu görev henüz başlamadı.",
  tukendi: "Bu görevin kontenjanı doldu.",
  konum_gerekli: "Bu görev etkinlik alanında tamamlanabiliyor. Konum izni gerekiyor.",
  konum_uzak: "Etkinlik alanında değilsin gibi görünüyor.",
  sinir: "Çok fazla deneme yaptın. Birkaç dakika sonra tekrar dene.",
  kimliksiz: "Oturumun sona ermiş. Tekrar giriş yap.",
  sponsor_qr: "Bu bir sponsor QR'si. Sponsorlar bölümünden ilgili sponsoru açıp okut.",
};

export const SPONSOR_MESAJI: Record<Exclude<SponsorSonucu["durum"], "tamam" | "kilitli">, string> = {
  zaten_alindi: "Bu kampanyadaki hakkını kullandın.",
  gecersiz: "Bu kod geçerli değil.",
  yanlis_sponsor: "Bu QR başka bir sponsora ait.",
  suresi_doldu: "Bu kampanya sona erdi.",
  baslamadi: "Kampanya henüz başlamadı.",
  tukendi: "Ödüller tükendi. Bu kampanyayı kaçırdın.",
  sinir: "Çok fazla deneme yaptın. Birkaç dakika sonra tekrar dene.",
  kimliksiz: "Oturumun sona ermiş. Tekrar giriş yap.",
  gorev_qr: "Bu bir etkinlik QR'si. Ödüller ekranındaki QR TARA ile okut.",
};

export const KULLAN_MESAJI: Record<KullanSonucu["durum"], string> = {
  kullanildi: "Ödül kullanıldı.",
  zaten_kullanildi: "Bu ödül daha önce kullanılmış.",
  pin_hatali: "PIN hatalı.",
  pin_tanimsiz: "Bu sponsor için işletme PIN'i tanımlanmamış. Topluluk yönetimine haber ver.",
  sinir: "Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.",
  suresi_doldu: "Bu ödülün süresi dolmuş.",
  iptal: "Bu ödül iptal edilmiş.",
  bulunamadi: "Ödül bulunamadı.",
  kimliksiz: "Oturumun sona ermiş.",
};

// ── Biçimlendirme ──────────────────────────────────────────────────
// Saf fonksiyonlar ayrı dosyada: ağa dokunmadan test edilebilsinler.
export { hedefCumlesi, konumAl, sayi, seviyeIlerlemesi, tarih, tarihSaat, titret } from "./odul_bicim";
