import { createContext, useContext } from "react";

/**
 * Uygulama içi gezinme — beş dünya, iki sürükleyici deneyim (TASARIM.md §2).
 *
 * Üye çubuğu: Ana · Akademi · Etkinlikler · Topluluk · Ben. Asistan ve
 * 3D HUB çubukta değil; Ana'dan girilen tam ekran deneyimler. Yönetim
 * görünümünün kendi çubuğu var (Panel · Etkinlikler · [Perde] · Yönetim ·
 * Topluluk).
 *
 * Her gidiş bir ROTA'dır ve tarayıcı geçmişine yazılır: telefonun ve
 * tarayıcının geri tuşu uygulamanın içinde geri gider, uygulamadan çıkmaz.
 */
export type Dunya = "ana" | "akademi" | "etkinlik" | "topluluk" | "ben";
export type Gorunum = Dunya | "yonetim" | "asistan" | "sohbet";

/** Çubuktaki bir sekme: üyede beş dünya, yönetimde Panel/Etkinlikler/Yönetim/Topluluk. */
export type Sekme = Dunya | "yonetim";

/** Ben dünyasının alt sayfaları. */
export type BenBolumu = "oduller" | "sponsorlar" | "siralama" | "gecmis" | "kimlik" | "profil" | "veri";
/** Yönetim görünümünde "Yönetim" sekmesinin bölümleri (yonetim/Yonetim.tsx). */
export type YonetimBolumu = "ozet" | "gorevler" | "sponsorlar" | "notlar" | "moderasyon" | "kullanicilar" | "seviyeler" | "kullanimlar" | "denetim";

/** Akademi'de bir ders: kodu varsa kodla, yoksa adla tanınır; üniversiteyle birlikte. */
export type DersAnahtari = { kod: string | null; ad: string; kurum?: string | null };

export type Rota = {
  g: Gorunum;
  ben?: BenBolumu;
  ders?: DersAnahtari;
  soru?: string;
  yonetim?: YonetimBolumu;
};

/** Bir alt görünüm hangi sekmenin altında: gösterge o sekmede kalır. */
export const UST_SEKME: Record<Gorunum, Sekme> = {
  ana: "ana",
  asistan: "ana",
  akademi: "akademi",
  etkinlik: "etkinlik",
  topluluk: "topluluk",
  sohbet: "topluluk",
  ben: "ben",
  yonetim: "yonetim",
};

/** git() eski adları da kabul eder: "odul" → Ben (yönetimde Yönetim), "notlar" → Akademi. */
export type GitHedefi = Gorunum | "odul" | "notlar";
export type GitSecenegi = {
  bolum?: BenBolumu;
  /** Ana'daki kutuya yazılan soru; Asistan açılınca kendiliğinden sorulur. */
  soru?: string;
  yonetim?: YonetimBolumu;
  ders?: DersAnahtari;
};

/** Hedefi rotaya çevirir (saf; testler/gezinme.test.mts). */
export function rotaKur(hedef: GitHedefi, secenek: GitSecenegi = {}, yonetimde = false): Rota {
  if (hedef === "odul") {
    return yonetimde ? { g: "yonetim", yonetim: secenek.yonetim ?? "ozet" } : { g: "ben", ben: secenek.bolum };
  }
  if (hedef === "notlar") return { g: "akademi", ders: secenek.ders };
  switch (hedef) {
    case "ben": return { g: "ben", ben: secenek.bolum };
    case "akademi": return { g: "akademi", ders: secenek.ders };
    case "asistan": return { g: "asistan", soru: secenek.soru };
    case "yonetim": return { g: "yonetim", yonetim: secenek.yonetim ?? "ozet" };
    default: return { g: hedef };
  }
}

/** Aynı ekran mı (sahne yeniden kurulmalı mı)? Soru ve yönetim bölümü ekranı değiştirmez. */
export function rotaAnahtari(r: Rota) {
  return [r.g, r.ben ?? "", r.ders ? `${r.ders.kurum ?? ""}|${r.ders.kod ?? ""}|${r.ders.ad}` : ""].join("/");
}

export type Gezinme = {
  git: (hedef: GitHedefi, secenek?: GitSecenegi) => void;
  /** Bir önceki ekrana; geçmiş yoksa bulunulan dünyanın girişine. */
  geri: () => void;
  /** Etkinlik QR'si / kısa kod tarayıcısını açar. */
  tara: () => void;
  /** 3B YAZVEB HUB görünümüne geçer (tercih hatırlanır). */
  hubAc: () => void;
};

export const GezinmeBaglami = createContext<Gezinme>({ git: () => {}, geri: () => {}, tara: () => {}, hubAc: () => {} });
export const useGezinme = () => useContext(GezinmeBaglami);

/**
 * Puan ya da ödül değişti (tarama, ödül kullanımı). Hangi ekran açıksa
 * kendi verisini tazeler; ekranlar birbirini tanımak zorunda kalmaz.
 */
export const ODUL_DEGISTI = "yazveb:odul-degisti";
export const odulDegisti = () => window.dispatchEvent(new Event(ODUL_DEGISTI));
