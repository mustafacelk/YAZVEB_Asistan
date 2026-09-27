import { createContext, useContext } from "react";

/**
 * Uygulama içi gezinme.
 *
 * Gezinme çubuğunda dört sekme ve ortada tarama var. Asistan ile sohbet
 * sekme değil, bir sekmenin içinden açılan görünümler: Asistan Ana'nın,
 * Sohbet Topluluk'un altında. Çubuk en fazla beş öğe taşır; altıncı öğe
 * hem seçimi zorlaştırır hem de taramayı parmaktan uzaklaştırır.
 *
 * Üye çubuğu: Ana · Etkinlikler · [QR] · Notlar · Ödüller. Topluluk (sohbet,
 * hesap, üyeler) Ana'nın başlığındaki profil düğmesinden açılır; yönetim
 * çubuğunda ise hâlâ bir sekmedir.
 */
export type Sekme = "ana" | "etkinlik" | "notlar" | "odul" | "topluluk";
export type Gorunum = Sekme | "asistan" | "sohbet";
export type OdulBolumu = "sponsorlar" | "oduller" | "siralama";
/** Yönetim görünümünde "Yönetim" sekmesinin bölümleri (yonetim/Yonetim.tsx). */
export type YonetimBolumu = "ozet" | "gorevler" | "sponsorlar" | "notlar" | "moderasyon" | "kullanicilar" | "seviyeler" | "kullanimlar" | "denetim";

/** Alt görünüm hangi sekmenin altında: gösterge o sekmede kalır. */
export const UST_SEKME: Record<Gorunum, Sekme> = {
  ana: "ana",
  asistan: "ana",
  etkinlik: "etkinlik",
  notlar: "notlar",
  odul: "odul",
  topluluk: "topluluk",
  sohbet: "topluluk",
};

export type Gezinme = {
  /** `soru`: Ana'daki kutuya yazılan soru; Asistan açılınca kendiliğinden sorulur. */
  git: (hedef: Gorunum, secenek?: { bolum?: OdulBolumu; soru?: string; yonetim?: YonetimBolumu }) => void;
  /** Etkinlik QR'si / kısa kod tarayıcısını açar. */
  tara: () => void;
  /** 3B YAZVEB HUB görünümüne geçer (tercih hatırlanır). */
  hubAc: () => void;
};

export const GezinmeBaglami = createContext<Gezinme>({ git: () => {}, tara: () => {}, hubAc: () => {} });
export const useGezinme = () => useContext(GezinmeBaglami);

/**
 * Puan ya da ödül değişti (tarama, ödül kullanımı). Hangi ekran açıksa
 * kendi verisini tazeler; ekranlar birbirini tanımak zorunda kalmaz.
 */
export const ODUL_DEGISTI = "yazveb:odul-degisti";
export const odulDegisti = () => window.dispatchEvent(new Event(ODUL_DEGISTI));
