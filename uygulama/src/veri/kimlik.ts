import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { OdulHatasi } from "./odul";
import type { Sinif } from "./pano_bicim";

/**
 * Öğrenci doğrulama (üniversite e-postasıyla). Kod e-postaya gider;
 * istemci onu hiç görmez (veritabani/08_kimlik.sql, functions/dogrula).
 */

export type KimlikDurumu = {
  dogrulandi: boolean;
  suresi_doldu: boolean;
  tur: "ogrenci" | "kurum" | null;
  kurum_alani: string | null;
  eposta_alani: string | null;
  universite: string | null;
  bolum: string | null;
  sinif: Sinif | null;
  gecerli_bitis: string | null;
  bekleyen?: { eposta_alani: string; kalan_sn: number } | null;
};

export type KodGonderimi = {
  durum: "tamam" | "gecersiz" | "bekle" | "sinir" | "genel_sinir" | "kullanimda" | "zaten"
    | "yapilandirilmamis" | "gonderilemedi" | "kimliksiz" | "hata";
  saniye?: number;
  dakika?: number;
  universite?: string;
  tur?: "ogrenci" | "kurum";
};

export type KodOnayi = { durum: "tamam" | "yok" | "sure" | "hatali" | "deneme" | "kullanimda"; kalan?: number } & Partial<KimlikDurumu>;

async function cagir<T>(fonksiyon: string, parametre?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fonksiyon, parametre ?? {});
  if (error) {
    if (["42501", "22023"].includes(error.code ?? "") && error.message) throw new OdulHatasi(error.message);
    if (error.code === "PGRST202") throw new OdulHatasi("Öğrenci doğrulama henüz kurulmamış (08_kimlik.sql).");
    throw new OdulHatasi("Sunucuya ulaşamadık. Bağlantını kontrol edip tekrar dene.", true);
  }
  return data as T;
}

export const kimlik = {
  durum: () => cagir<KimlikDurumu>("kimlik_durum"),
  bilgiKaydet: (bolum: string, sinif: Sinif | "") =>
    cagir<KimlikDurumu>("kimlik_bilgi_kaydet", { p_bolum: bolum || null, p_sinif: sinif || null }),
  kodOnayla: (kod: string) => cagir<KodOnayi>("kimlik_kod_onayla", { p_kod: kod }),
  dogrulamaSil: () => cagir<KimlikDurumu>("kimlik_dogrulama_sil"),
  /** Edge Function üzerinden: kod üniversite e-postasına gider. */
  kodGonder: async (eposta: string): Promise<KodGonderimi> => {
    const { data, error } = await supabase.functions.invoke("dogrula", { body: { eposta } });
    if (!error) return data as KodGonderimi;
    // 4xx/5xx: fonksiyon yine de {durum} döner; onu oku.
    if (error instanceof FunctionsHttpError) {
      try {
        const govde = await error.context.json();
        if (govde && typeof govde.durum === "string") return govde as KodGonderimi;
      } catch { /* gövde JSON değil */ }
    }
    return { durum: "hata" };
  },
};

/** Kod gönderiminin sonucunu bir insana söylenecek cümleye çevirir. */
export function gonderimMesaji(g: KodGonderimi): string | null {
  switch (g.durum) {
    case "tamam": return null;
    case "gecersiz": return "Bu bir üniversite e-postası gibi görünmüyor. .edu.tr ile biten öğrenci adresini yaz (ör. numaran@ogr.selcuk.edu.tr).";
    case "bekle": return `Yeni kod için ${g.saniye ?? 60} saniye bekle.`;
    case "sinir": return "Bugün çok kod istendi. Yarın tekrar dene ya da gelen kutundaki son kodu kullan.";
    case "genel_sinir": return "Bugünkü doğrulama kapasitesi doldu. Yarın tekrar dene.";
    case "kullanimda": return "Bu e-posta başka bir hesapta doğrulanmış. Sana ait değilse YAZVEB yönetimine yaz.";
    case "zaten": return "Bu adresle zaten doğrulanmışsın.";
    case "yapilandirilmamis": return "E-posta gönderimi henüz kurulmadı. Yönetim kurduğunda buradan doğrulayabileceksin.";
    case "gonderilemedi": return "E-posta gönderilemedi. Adresi kontrol edip birazdan tekrar dene.";
    case "kimliksiz": return "Oturumun yenilenmeli. Çıkış yapıp tekrar gir.";
    default: return "Sunucuya ulaşamadık. Bağlantını kontrol edip tekrar dene.";
  }
}

export function onayMesaji(o: KodOnayi): string | null {
  switch (o.durum) {
    case "tamam": return null;
    case "hatali": return `Kod yanlış. ${o.kalan ?? 0} hakkın kaldı.`;
    case "deneme": return "Çok fazla yanlış deneme. Yeni bir kod iste.";
    case "sure": return "Kodun süresi doldu. Yeni bir kod iste.";
    case "yok": return "Bekleyen bir kod yok. Önce kod iste.";
    case "kullanimda": return "Bu e-posta bu arada başka bir hesapta doğrulandı.";
    default: return "Doğrulanamadı.";
  }
}
