// ═══════════════════════════════════════════════════════════════════
// YAZVEB HUB — istemci veri katmanı
// ═══════════════════════════════════════════════════════════════════
// Yalnızca SORAR ve GÖSTERİR. Coin, fiyat, envanter, çark sonucu
// veritabanındaki hub_* fonksiyonlarında (veritabani/07_hub.sql).
// ═══════════════════════════════════════════════════════════════════

import { supabase } from "../veri/supabase";
import { OdulHatasi } from "../veri/odul";

export type KiyafetSlotu = "ust" | "alt" | "ayakkabi" | "sapka" | "gozluk" | "canta";
export type OdaSlotu = "mobilya" | "zemin" | "duvar";

export type Avatar = {
  ten: number;
  sac: number;
  sac_renk: number;
  yuz: number;
  giyili: Partial<Record<KiyafetSlotu, string>>;
};

export type OdaEsyasi = { esya: string; x: number; z: number; yon: number };

export type Oyuncu = {
  id: string;
  kullanici_adi: string;
  ad: string;
  rol: string;
  avatar: Avatar;
  oda: OdaEsyasi[];
  kuruldu: boolean;
  ben?: boolean;
};

export type Gorev = { kod: string; baslik: string; odul: number; hedef: number; ilerleme: number; alindi: boolean };
export type CarkDilimi = { sira: number; ad: string; tur: string; olasilik: number };

export type HubProfil = {
  coin: number;
  ben: Oyuncu;
  envanter: Record<string, number>;
  gorevler: Gorev[];
  etkinlik_coin: { id: number; baslik: string; coin: number }[];
  cark: { hazir: boolean; sonraki: string; haftanin_esyasi: string | null; dilimler: CarkDilimi[] };
  yeni_hediye: number;
  bugun_ziyaret: number;
};

export type KatalogEsyasi = {
  id: string;
  ad: string;
  tur: "kiyafet" | "oda";
  slot: KiyafetSlotu | OdaSlotu;
  fiyat: number;
  nadirlik: "siradan" | "nadir" | "efsane";
  satista: boolean;
};

export type Bina = {
  oyuncu: number;
  bolumler: { ad: string; esik: number; acik: boolean }[];
  odalar: Oyuncu[];
};

export type OdaZiyareti =
  | { durum: "bulunamadi" }
  | {
      durum: "tamam";
      oyuncu: Oyuncu;
      bugun_ziyaret: number;
      hediyeler: { icerik: string; tur: string; kimden: string; zaman: string }[];
    };

export type Gelenler = {
  hediyeler: { tur: string; icerik: string; mesaj: string | null; kimden: string; kimden_id: string; zaman: string; yeni: boolean }[];
  ziyaretciler: { kim: string; id: string; zaman: string }[];
};

async function cagir<T>(fonksiyon: string, parametre?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fonksiyon, parametre ?? {});
  if (error) {
    // 22023 / 22003: veritabanındaki kendi, gösterilebilir cümlelerimiz.
    if (["22023", "22003", "42501"].includes(error.code ?? "") && error.message) throw new OdulHatasi(error.message);
    if (error.code === "PGRST202") throw new OdulHatasi("YAZVEB HUB henüz kurulmamış (07_hub.sql).");
    throw new OdulHatasi("Sunucuya ulaşamadık. Bağlantını kontrol edip tekrar dene.", true);
  }
  return data as T;
}

export const hub = {
  profil: () => cagir<HubProfil>("hub_profil"),
  katalog: () => cagir<KatalogEsyasi[]>("hub_katalog"),
  satinAl: (esya: string) =>
    cagir<{ durum: "tamam" | "zaten_var" | "yetersiz" | "satista_degil"; coin?: number; eksik?: number }>("hub_satin_al", { p_esya: esya }),
  avatarKaydet: (a: Avatar) => cagir<{ durum: "tamam" }>("hub_avatar_kaydet", { p: a }),
  odaKaydet: (oda: OdaEsyasi[]) => cagir<{ durum: "tamam" }>("hub_oda_kaydet", { p: oda }),
  bina: (sayfa = 0) => cagir<Bina>("hub_bina", { p_sayfa: sayfa }),
  oda: (kullanici: string) => cagir<OdaZiyareti>("hub_oda", { p_kullanici: kullanici }),
  hediye: (alici: string, tur: "emoji" | "esya", icerik: string, mesaj?: string) =>
    cagir<{ durum: "tamam" | "gecersiz" | "sinir" | "yok" }>("hub_hediye",
      { p_alici: alici, p_tur: tur, p_icerik: icerik, p_mesaj: mesaj ?? null }),
  gelenler: () => cagir<Gelenler>("hub_gelenler"),
  gorevAl: (kod: string) =>
    cagir<{ durum: "tamam" | "tamamlanmadi" | "zaten_alindi" | "gecersiz"; coin?: number; odul?: number }>("hub_gorev_al", { p_kod: kod }),
  etkinlikCoinAl: () => cagir<{ durum: "tamam" | "yok"; coin: number; kazanilan: number }>("hub_etkinlik_coin_al"),
  carkCevir: () =>
    cagir<{ durum: "tamam" | "bekle"; dilim?: number; ad?: string; coin?: number; esya?: string | null; bakiye?: number; sonraki: string }>("hub_cark_cevir"),
};

/** HUB görünümü tercihi: açıksa uygulama doğrudan HUB'da açılır. */
const TERCIH = "yazveb:hub-acik";
export function hubTercihi(): boolean {
  try { return localStorage.getItem(TERCIH) === "1"; } catch { return false; }
}
export function hubTercihiYaz(acik: boolean) {
  try { if (acik) localStorage.setItem(TERCIH, "1"); else localStorage.removeItem(TERCIH); } catch { /* gizli sekme */ }
}
