import { createContext, useContext } from "react";

/**
 * Uygulama içi gezinme.
 *
 * Gezinme çubuğunda dört sekme ve ortada tarama var. Asistan ile sohbet
 * sekme değil, bir sekmenin içinden açılan görünümler: Asistan Ana'nın,
 * Sohbet Topluluk'un altında. Çubuk en fazla beş öğe taşır; altıncı öğe
 * hem seçimi zorlaştırır hem de taramayı parmaktan uzaklaştırır.
 */
export type Sekme = "ana" | "etkinlik" | "odul" | "topluluk";
export type Gorunum = Sekme | "asistan" | "sohbet";
export type OdulBolumu = "sponsorlar" | "oduller" | "siralama";

/** Alt görünüm hangi sekmenin altında: gösterge o sekmede kalır. */
export const UST_SEKME: Record<Gorunum, Sekme> = {
  ana: "ana",
  asistan: "ana",
  etkinlik: "etkinlik",
  odul: "odul",
  topluluk: "topluluk",
  sohbet: "topluluk",
};

export type Gezinme = {
  git: (hedef: Gorunum, secenek?: { bolum?: OdulBolumu }) => void;
  /** Etkinlik QR'si / kısa kod tarayıcısını açar. */
  tara: () => void;
};

export const GezinmeBaglami = createContext<Gezinme>({ git: () => {}, tara: () => {} });
export const useGezinme = () => useContext(GezinmeBaglami);

/**
 * Puan ya da ödül değişti (tarama, ödül kullanımı). Hangi ekran açıksa
 * kendi verisini tazeler; ekranlar birbirini tanımak zorunda kalmaz.
 */
export const ODUL_DEGISTI = "yazveb:odul-degisti";
export const odulDegisti = () => window.dispatchEvent(new Event(ODUL_DEGISTI));
