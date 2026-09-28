import { supabase } from "./supabase";
import { OdulHatasi } from "./odul";
import type { KimlikDurumu } from "./kimlik";
import type { DersAnahtari } from "./gezinme";
import {
  dersleriGrupla, dersUyar, MIME,
  type DersOzeti, type DosyaTuru, type Kademe, type Kunye, type NotTuru, type PuanAyari, type SinavDurumu, type Sinif,
} from "./pano_bicim";

/**
 * Notlar (ilk Pano modülü). Kurallar veritabanında ve Storage'ın satır
 * kurallarında: doğrulanmamış üye notu listede görür ama dosyayı alamaz.
 * Bkz. veritabani/09_pano.sql.
 */

export type NotOzeti = {
  id: string;
  baslik: string;
  aciklama: string | null;
  ders_kodu: string | null;
  ders_adi: string;
  bolum: string;
  sinif: Sinif;
  kurum_alani: string;
  universite: string;
  yil: number;
  yariyil: string;
  tur: NotTuru;
  hoca: string | null;
  dosya_turu: DosyaTuru;
  boyut: number | null;
  yararli: number;
  acilma: number;
  yayinlandi: string;
  yazar: string | null;
  benim: boolean;
  oyum: boolean;
  actim: boolean;
};

export type BenimNotum = NotOzeti & {
  durum: "yayinda" | "gizli";
  onaylandi: string | null;
  onay_zamani: string | null;
  sinav_oncesi: boolean;
  xp: number;
  sikayet: boolean;
};

export type Sponsorlu = {
  id: string;
  kademe: Kademe;
  baslik: string;
  metin: string | null;
  baglanti: string | null;
  sponsor_id: string | null;
  sponsor: string | null;
  logo: string | null;
  baglam: "her_zaman" | "sinav_donemi";
};

export type NotListesi = {
  ben: KimlikDurumu;
  kurum: string | null;
  kurum_adi: string | null;
  sinav: SinavDurumu | null;
  liste: NotOzeti[];
  daha: boolean;
  sponsorlu: Sponsorlu[];
  bolumler: string[];
  ayar: PuanAyari;
};

export type NotFiltresi = {
  kurum?: "benim" | "tum" | string;
  bolum?: string;
  sinif?: Sinif | "";
  tur?: NotTuru | "";
  ara?: string;
  sira?: "yeni" | "faydali";
  sayfa?: number;
  /** Akademi'de bir dersin sayfası. */
  ders?: DersAnahtari;
};

export type DersFiltresi = {
  kurum?: "benim" | "tum" | string;
  bolum?: string;
  sinif?: Sinif | "";
  ara?: string;
  sira?: "yeni" | "cok";
};

export type DersListesi = Omit<NotListesi, "liste" | "daha"> & { dersler: DersOzeti[] };

export type Notlarim = { liste: BenimNotum[]; hafta: { kazanilan: number; tavan: number }; toplam: number };

export type SikayetNedeni = "telif" | "uygunsuz" | "spam" | "yanlis" | "diger";
export const SIKAYET_NEDENLERI: { deger: SikayetNedeni; ad: string }[] = [
  { deger: "telif", ad: "Telif hakkı (hocanın slaytı, kitap, başkasının notu)" },
  { deger: "uygunsuz", ad: "Uygunsuz ya da saldırgan içerik" },
  { deger: "spam", ad: "Spam, reklam ya da alakasız dosya" },
  { deger: "yanlis", ad: "Yanlış ders / bölüm ya da hatalı çözüm" },
  { deger: "diger", ad: "Başka bir sebep" },
];

async function cagir<T>(fonksiyon: string, parametre?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fonksiyon, parametre ?? {});
  if (error) {
    if (["42501", "22023"].includes(error.code ?? "") && error.message) throw new OdulHatasi(error.message);
    if (error.code === "PGRST202") throw new OdulHatasi("Notlar henüz kurulmamış (09_pano.sql).");
    throw new OdulHatasi("Sunucuya ulaşamadık. Bağlantını kontrol edip tekrar dene.", true);
  }
  return data as T;
}

/** Dosyanın SHA-256 özeti (aynı dosyanın ikinci kez paylaşılmasını engeller). */
async function ozet(dosya: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await dosya.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type PaylasimSonucu =
  | { durum: "tamam"; id: string; sinav_oncesi: boolean }
  | { durum: "dogrulama_gerekli" | "sinir" | "kopya" | "hata"; mesaj: string };

export type PanoOzeti = {
  dogrulandi: boolean;
  sinav: SinavDurumu | null;
  bolum: string | null;
  bolum_notlari: number | null;
  bu_hafta: number;
};

export const pano = {
  /** Ana ekran: sınav dönemi ve bölümündeki not sayısı (liste yüklemez). */
  ozet: () => cagir<PanoOzeti>("pano_ozet"),
  /**
   * Bir dersin notları ya da genel liste. Veritabanı ders filtresini henüz
   * bilmiyorsa (09 eski sürüm) istemci de süzer: sonuç her iki durumda aynı.
   */
  notlar: async (f: NotFiltresi = {}) => {
    const v = await cagir<NotListesi>("pano_notlar", { p: f });
    return f.ders ? { ...v, liste: v.liste.filter((n) => dersUyar(n, f.ders!)), sponsorlu: [] } : v;
  },

  /**
   * Akademi'nin ders listesi. 09_pano.sql güncellenmeden yeni istemci yayına
   * çıkarsa pano_dersler yoktur: ilk 150 not istemcide derslere toplanır.
   */
  dersler: async (f: DersFiltresi = {}): Promise<DersListesi> => {
    const { data, error } = await supabase.rpc("pano_dersler", { p: f });
    if (!error) return data as DersListesi;
    if (error.code !== "PGRST202") return cagir<DersListesi>("pano_dersler", { p: f });
    const sayfalar: NotListesi[] = [];
    for (let s = 0; s < 5; s++) {
      const v = await cagir<NotListesi>("pano_notlar", { p: { kurum: f.kurum, bolum: f.bolum, sinif: f.sinif, ara: f.ara, sayfa: s } });
      sayfalar.push(v);
      if (!v.daha) break;
    }
    const { ben, kurum, kurum_adi, sinav, sponsorlu, bolumler, ayar } = sayfalar[0];
    const dersler = dersleriGrupla(sayfalar.flatMap((v) => v.liste));
    return {
      ben, kurum, kurum_adi, sinav, sponsorlu, bolumler, ayar,
      dersler: f.sira === "cok" ? [...dersler].sort((a, b) => b.not - a.not) : dersler,
    };
  },
  notlarim: () => cagir<Notlarim>("pano_notlarim"),

  /** Künye → depoya yükleme → yayın. Yarıda kalırsa depodaki dosya temizlenir. */
  paylas: async (k: Kunye, dosya: File, turu: DosyaTuru): Promise<PaylasimSonucu> => {
    const hazir = await cagir<{ durum: string; id?: string; yol?: string; gunluk?: number }>("pano_not_hazirla", {
      p: {
        baslik: k.baslik.trim(), ders_adi: k.ders_adi.trim(), ders_kodu: k.ders_kodu.trim(), bolum: k.bolum.trim(),
        sinif: k.sinif, tur: k.tur, yil: k.yil, yariyil: k.yariyil, hoca: k.hoca.trim(), aciklama: k.aciklama.trim(),
        dosya_turu: turu, boyut: dosya.size, dosya_ozet: await ozet(dosya),
      },
    });
    if (hazir.durum === "dogrulama_gerekli") return { durum: "dogrulama_gerekli", mesaj: "Paylaşmak için öğrenciliğini doğrula." };
    if (hazir.durum === "sinir") return { durum: "sinir", mesaj: `Günde en fazla ${hazir.gunluk ?? 5} not paylaşılabilir. Yarın devam et.` };
    if (hazir.durum === "kopya") return { durum: "kopya", mesaj: "Bu dosya zaten paylaşılmış. Aynı notu ikinci kez yükleyemezsin." };
    if (hazir.durum !== "tamam" || !hazir.id || !hazir.yol) return { durum: "hata", mesaj: "Paylaşım başlatılamadı." };

    // storage-js dosyayı multipart yollar ve türü dosyanın kendisinden alır;
    // bazı Android tarayıcıları PDF'e boş tür verir. Doğrulanmış türle sarılır:
    // depo kaydındaki tür künyeyle eşleşmezse yayın reddedilir.
    const govde = dosya.type === MIME[turu] ? dosya : new Blob([dosya], { type: MIME[turu] });
    const { error } = await supabase.storage.from("notlar").upload(hazir.yol, govde, {
      contentType: MIME[turu], upsert: false, cacheControl: "3600",
    });
    if (error) return { durum: "hata", mesaj: "Dosya yüklenemedi. Bağlantını kontrol edip tekrar dene." };

    const yayin = await cagir<{ durum: string; sinav_oncesi?: boolean }>("pano_not_yayinla", { p_id: hazir.id });
    if (yayin.durum === "tamam") return { durum: "tamam", id: hazir.id, sinav_oncesi: !!yayin.sinav_oncesi };
    await supabase.storage.from("notlar").remove([hazir.yol]).catch(() => {});
    if (yayin.durum === "kopya") return { durum: "kopya", mesaj: "Bu dosya zaten paylaşılmış." };
    return { durum: "hata", mesaj: yayin.durum === "dosya_gecersiz" ? "Dosya türü ya da boyutu uygun değil." : "Not yayına alınamadı." };
  },

  /**
   * Notu aç: sunucu izin verirse dosya depodan indirilir ve cihazda
   * gösterilir (blob adresi; site güvenlik politikası dış görsel adresine
   * izin vermez, kullanıcının IP'si de üçüncü bir sunucuya gitmez).
   */
  ac: async (id: string): Promise<{ durum: "tamam"; adres: string; ad: string; turu: DosyaTuru } | { durum: "dogrulama_gerekli" | "sinir" | "yok" }> => {
    const r = await cagir<{ durum: string; yol?: string; dosya_turu?: DosyaTuru; ad?: string }>("pano_not_ac", { p_id: id });
    if (r.durum !== "tamam" || !r.yol) return { durum: (r.durum as "dogrulama_gerekli" | "sinir" | "yok") ?? "yok" };
    const { data, error } = await supabase.storage.from("notlar").download(r.yol);
    if (error || !data) throw new OdulHatasi("Dosya indirilemedi. Bağlantını kontrol edip tekrar dene.", true);
    const turu = r.dosya_turu ?? "pdf";
    const blob = data.type ? data : new Blob([data], { type: MIME[turu] });
    return { durum: "tamam", adres: URL.createObjectURL(blob), ad: r.ad ?? "not", turu };
  },

  oy: (id: string, yararli: boolean) =>
    cagir<{ durum: "tamam" | "dogrulama_gerekli" | "once_ac" | "kendi" | "yok"; yararli?: number; oyum?: boolean }>(
      "pano_not_oy", { p_id: id, p_yararli: yararli }),

  sil: async (id: string) => {
    const r = await cagir<{ durum: string; yol?: string | null }>("pano_not_sil", { p_id: id });
    if (r.yol) await supabase.storage.from("notlar").remove([r.yol]).catch(() => {});
    return r.durum === "tamam";
  },

  sikayet: (tur: "not" | "mesaj", hedef: string, neden: SikayetNedeni, aciklama?: string) =>
    cagir<{ durum: "tamam" | "zaten" | "kendi" | "yok" | "sinir"; gizlendi?: boolean }>(
      "pano_sikayet", { p_tur: tur, p_hedef: hedef, p_neden: neden, p_aciklama: aciklama?.trim() || null }),

  sponsorluTikla: (id: string) => cagir<null>("pano_sponsorlu_tikla", { p_id: id }).catch(() => null),
};

export function sikayetMesaji(durum: string): string {
  switch (durum) {
    case "tamam": return "Şikayetin alındı. Yeterli şikayet gelirse içerik incelemeye kadar gizlenir.";
    case "zaten": return "Bunu zaten şikayet etmiştin.";
    case "kendi": return "Kendi içeriğini şikayet edemezsin; kaldırabilirsin.";
    case "sinir": return "Bugün çok şikayet gönderdin. Yarın tekrar dene.";
    default: return "İçerik bulunamadı; kaldırılmış olabilir.";
  }
}
