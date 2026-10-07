import { supabase } from "./supabase";
import { OdulHatasi } from "./odul";
import type { AcikIsTaslagi, EkipOzeti, Havuz, HavuzYonetimi, IsDurumu, IsTaslagi, Kisi, Pano } from "./ekip_bicim";

export * from "./ekip_bicim";

/**
 * Ekip: görevli kadro, ortak pano ve gönüllü havuzu.
 * Kurallar veritabanında (veritabani/10_ekip.sql); burası yalnızca çağırır.
 * Tipler ve saf yardımcılar ekip_bicim.ts'te.
 */

async function cagir<T>(fonksiyon: string, parametre?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fonksiyon, parametre ?? {});
  if (error) {
    if (["42501", "22023"].includes(error.code ?? "") && error.message) throw new OdulHatasi(error.message);
    if (error.code === "PGRST202") throw new OdulHatasi("Ekip modülü henüz kurulmamış (10_ekip.sql).");
    throw new OdulHatasi("Sunucuya ulaşamadık. Bağlantını kontrol edip tekrar dene.", true);
  }
  return data as T;
}

export const ekip = {
  ozet: () => cagir<EkipOzeti>("ekip_ozet"),
  havuz: (etkinlik?: number) => cagir<Havuz>("ekip_havuz", { p: etkinlik ? { etkinlik } : {} }),
  ustlen: (id: number) => cagir<{ durum: "tamam" | "zaten" | "dolu" | "kapali" | "gecti" }>("ekip_ustlen", { p_id: id }),
  birak: (id: number) => cagir<{ durum: "tamam" | "yok" }>("ekip_birak", { p_id: id }),
  yaptim: (id: number) => cagir<{ durum: "tamam" | "yok" }>("ekip_yaptim", { p_id: id }),

  pano: () => cagir<Pano>("ekip_pano"),
  isKaydet: (t: IsTaslagi) => cagir<{ durum: "tamam"; id: number }>("ekip_is_kaydet", { p: t }),
  isDurum: (id: number, durum: IsDurumu, duzeltme = false) =>
    cagir<{ durum: "tamam"; kacti: number; esik: number; gorusme: boolean }>("ekip_is_durum",
      { p_id: id, p_durum: durum, p_duzeltme: duzeltme }),
  isErtele: (id: number, teslim: string, not?: string) =>
    cagir<{ durum: "tamam" }>("ekip_is_ertele", { p_id: id, p_teslim: teslim, p_not: not || null }),
  isSil: (id: number) => cagir<{ durum: "tamam" | "yok" }>("ekip_is_sil", { p_id: id }),

  kadroKaydet: (kullanici: string, rol: string, durum: "deneme" | "kesin") =>
    cagir<{ durum: "tamam" }>("ekip_kadro_kaydet", { p: { kullanici, rol, durum } }),
  kadroCikar: (kullanici: string) => cagir<{ durum: "tamam" | "yok" }>("ekip_kadro_cikar", { p_kullanici: kullanici }),
  kisiAra: (ara: string) => cagir<(Kisi & { kadroda: boolean; gonullu: number })[]>("ekip_kisi_ara", { p_ara: ara }),

  havuzYonetim: () => cagir<HavuzYonetimi>("ekip_havuz_yonetim"),
  acikIsKaydet: (t: AcikIsTaslagi) => cagir<{ durum: "tamam"; id: number }>("ekip_acik_is_kaydet", { p: t }),
  acikIsKapat: (id: number, durum: "acik" | "kapandi" | "iptal") =>
    cagir<{ durum: "tamam" | "yok" }>("ekip_acik_is_kapat", { p_id: id, p_durum: durum }),
  karar: (id: number, kullanici: string, karar: "onayla" | "olmadi") =>
    cagir<{ durum: "tamam" | "yok"; xp: number }>("ekip_karar", { p_id: id, p_kullanici: kullanici, p_karar: karar }),
};
