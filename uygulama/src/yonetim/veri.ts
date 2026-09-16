// Yönetim paneli RPC'leri. Yetki kontrolü veritabanında: bu dosyadaki
// fonksiyonlar yetkisiz kullanıcı için hata döner, arayüz yalnızca gösterir.
import { supabase } from "../veri/supabase";
import { OdulHatasi } from "../veri/odul";

async function cagir<T>(fonksiyon: string, parametre?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fonksiyon, parametre ?? {});
  if (error) {
    const bizim = ["42501", "22023", "23505", "22003", "P0001", "23514"].includes(error.code ?? "");
    throw new OdulHatasi(
      error.code === "23514" ? "Bir alan geçersiz (uzunluk, biçim ya da tarih aralığı)."
        : bizim && error.message ? error.message
        : "İşlem tamamlanamadı: " + (error.code === "22P02" ? "sayı ya da tarih biçimi hatalı." : "sunucu hatası."),
    );
  }
  return data as T;
}

export type YGorev = {
  id: number; etkinlik_id: number | null; etkinlik: string | null; baslik: string; aciklama: string | null;
  tur: string; token: string; kisa_kod: string; puan: number; baslangic: string; bitis: string;
  kisi_basi_limit: number; toplam_limit: number | null; kullanim_sayisi: number; aktif: boolean;
  iptal: string | null; enlem: number | null; boylam: number | null; yaricap_m: number | null;
  baskan_kilidi: boolean; duzenlenebilir: boolean;
};

export type YOdulKalemi = {
  id?: string; baslik: string; tur: string; ikon: string; aciklama: string | null;
  toplam: number | null; kalan: number | null; agirlik: number;
};

export type YKampanya = {
  id: string; ad: string; token: string; kisa_kod: string; baslangic: string; bitis: string;
  aktif: boolean; iptal: string | null; kisi_basi_limit: number; surpriz: boolean; gecerlilik_gun: number;
  baskan_kilidi: boolean; duzenlenebilir: boolean; kazanim: number; kullanim: number; oduller: YOdulKalemi[];
};

export type YSponsor = {
  id: string; ad: string; aciklama: string | null; logo: string | null; website: string | null; adres: string | null;
  gerekli_xp: number; gerekli_seviye_id: number | null; gerekli_etkinlik: number; aktif: boolean; siralama: number;
  pin_tanimli: boolean; baskan_kilidi: boolean; duzenlenebilir: boolean; kampanyalar: YKampanya[];
};

export type YOzet = {
  toplam_kullanici: number; aktif_kullanici: number; etkinlik_katilimi: number;
  tarama: number; tarama_qr: number; tarama_kod: number; dagitilan_puan: number;
  en_cok_gorev: { baslik: string; sayi: number } | null;
  en_cok_acilan_sponsor: { ad: string; sayi: number } | null;
  en_cok_kullanilan_odul: { baslik: string; sponsor: string; sayi: number } | null;
  stok_kalan: number; tukenen_kalem: number;
  sponsorlar: { id: string; ad: string; goruntuleme: number; tarama: number; kazanim: number; kullanim: number }[];
};

export type YKullanici = {
  id: string; kullanici_adi: string; ad_soyad: string | null; rol: string; xp: number;
  etkinlik: number; seri: number; seviye: string; odul: number;
};

export type YSeviye = { id?: number; ad: string; esik: number; ikon: string; aciklama: string | null };
export type YAyarlar = { seri_acik: boolean; seri_bonuslari: Record<string, number>; liderlik_acik: boolean };

export type YKazanim = {
  id: string; kullanici: string; sponsor: string; baslik: string; kod: string; zaman: string;
  son_kullanma: string; kullanildi: string | null; durum: string;
};
export type YDenetim = { zaman: string; yapan: string | null; islem: string; hedef: string | null; ayrinti: Record<string, unknown> };

export const yonetim = {
  ozet: () => cagir<YOzet>("odul_yonetim_ozet"),
  gorevler: () => cagir<YGorev[]>("odul_yonetim_gorevler"),
  gorevKaydet: (p: Record<string, unknown>) => cagir<{ id: number; token: string; kisa_kod: string }>("odul_gorev_kaydet", { p }),
  gorevIptal: (id: number, yenile: boolean) => cagir<{ id: number; token: string; kisa_kod: string }>("odul_gorev_iptal", { p_id: id, p_yenile: yenile }),
  sponsorlar: () => cagir<YSponsor[]>("odul_yonetim_sponsorlar"),
  sponsorKaydet: (p: Record<string, unknown>) => cagir<{ id: string }>("odul_sponsor_kaydet", { p }),
  kampanyaKaydet: (p: Record<string, unknown>) => cagir<{ id: string; token: string; kisa_kod: string }>("odul_kampanya_kaydet", { p }),
  kampanyaIptal: (id: string) => cagir<void>("odul_kampanya_iptal", { p_id: id }),
  kullanicilar: (ara?: string) => cagir<YKullanici[]>("odul_yonetim_kullanicilar", { p_ara: ara || null }),
  puanAyarla: (kullanici: string, miktar: number, aciklama: string) =>
    cagir<{ xp: number }>("odul_puan_ayarla", { p_kullanici: kullanici, p_miktar: miktar, p_aciklama: aciklama }),
  seviyeler: () => cagir<{ seviyeler: YSeviye[]; ayarlar: YAyarlar }>("odul_yonetim_seviyeler"),
  seviyelerKaydet: (liste: YSeviye[]) => cagir<void>("odul_seviyeler_kaydet", { p: liste }),
  ayarlarKaydet: (p: Partial<YAyarlar>) => cagir<void>("odul_ayarlar_kaydet", { p }),
  kazanimlar: () => cagir<YKazanim[]>("odul_yonetim_kazanimlar"),
  denetim: () => cagir<YDenetim[]>("odul_yonetim_denetim"),
};

/** datetime-local değeri ↔ ISO */
export function yerelTarih(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function isoTarih(yerel: string): string | null {
  return yerel ? new Date(yerel).toISOString() : null;
}

/**
 * Logo: seçilen görsel cihazda 256 px WebP'ye küçültülür. Sunucu yalnızca
 * raster veri adresi kabul eder (≤ 90 KB); SVG ve harici adres kabul edilmez.
 */
export async function logoHazirla(dosya: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(dosya.type)) throw new OdulHatasi("Logo PNG, JPEG ya da WebP olmalı.");
  if (dosya.size > 8 * 1024 * 1024) throw new OdulHatasi("Logo dosyası çok büyük (en fazla 8 MB).");
  const bitmap = await createImageBitmap(dosya);
  const kenar = 256;
  const oran = Math.min(kenar / bitmap.width, kenar / bitmap.height, 1);
  const tuval = document.createElement("canvas");
  tuval.width = Math.round(bitmap.width * oran);
  tuval.height = Math.round(bitmap.height * oran);
  tuval.getContext("2d")!.drawImage(bitmap, 0, 0, tuval.width, tuval.height);
  bitmap.close();
  for (const kalite of [0.9, 0.8, 0.65, 0.5]) {
    const adres = tuval.toDataURL("image/webp", kalite);
    // Tarayıcı WebP üretemezse PNG döner; o da kabul edilir.
    if (adres.length <= 88000) return adres;
  }
  throw new OdulHatasi("Logo sıkıştırılamadı; daha sade bir görsel dene.");
}
