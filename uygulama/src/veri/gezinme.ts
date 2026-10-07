import { createContext, useContext } from "react";

/**
 * Uygulama içi gezinme — dünyalar ve iki sürükleyici deneyim (TASARIM.md §2).
 *
 * Üye çubuğu: Ana · Akademi · Etkinlikler · Ödüller · Ben. Topluluk
 * (genel sohbet, üyeler) Ana'dan ve masaüstü şeridinden açılır. Asistan ve
 * 3D HUB çubukta değil; Ana'dan girilen tam ekran deneyimler. Yönetim
 * görünümünün kendi çubuğu var (Panel · Etkinlikler · [Perde] · Yönetim ·
 * Topluluk).
 *
 * Her gidiş bir ROTA'dır ve tarayıcı geçmişine yazılır: telefonun ve
 * tarayıcının geri tuşu uygulamanın içinde geri gider, uygulamadan çıkmaz.
 */
export type Dunya = "ana" | "akademi" | "etkinlik" | "odul" | "topluluk" | "ben";
/** "ekip": görevli kadronun ortak panosu (pano · gönüllü havuzu · kadro). */
export type Gorunum = Dunya | "yonetim" | "asistan" | "sohbet" | "ekip";

/** Çubuktaki bir sekme: üyede dünyalar, yönetimde Panel/Etkinlikler/Yönetim/Topluluk. */
export type Sekme = Dunya | "yonetim";

/** Ben dünyasının alt sayfaları. */
export type BenBolumu = "kimlik" | "profil" | "veri";
/** Ödüller dünyasının alt sayfaları. Sponsorlar alt sayfa değil: dünyanın kendisi. */
export type OdulBolumu = "cuzdan" | "siralama" | "gecmis";
/** Yönetim görünümünde "Yönetim" sekmesinin bölümleri (yonetim/Yonetim.tsx). */
export type YonetimBolumu = "ozet" | "gorevler" | "sponsorlar" | "notlar" | "moderasyon" | "kullanicilar" | "seviyeler" | "kullanimlar" | "denetim";

/** Akademi'de bir ders: kodu varsa kodla, yoksa adla tanınır; üniversiteyle birlikte. */
export type DersAnahtari = { kod: string | null; ad: string; kurum?: string | null };

export type Rota = {
  g: Gorunum;
  ben?: BenBolumu;
  odul?: OdulBolumu;
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
  odul: "odul",
  topluluk: "topluluk",
  sohbet: "topluluk",
  ben: "ben",
  yonetim: "yonetim",
  ekip: "ben",
};

/**
 * Göstergenin durduğu sekme. Görünümün sekmesi çubukta yoksa (üyede
 * Topluluk) gösterge gizlenir: `null`. Ekip panosu üyede Ben'in, yönetim
 * görünümünde Yönetim'in altındadır.
 */
export function seciliSekme(g: Gorunum, cubuk: readonly Sekme[]): Sekme | null {
  const s = g === "ekip" && cubuk.includes("yonetim") ? "yonetim" : UST_SEKME[g];
  return cubuk.includes(s) ? s : null;
}

/** git() eski adı da kabul eder: "notlar" → Akademi. "odul" yönetimde Yönetim'e gider. */
export type GitHedefi = Gorunum | "notlar";
export type GitSecenegi = {
  bolum?: BenBolumu;
  odul?: OdulBolumu;
  /** Ana'daki kutuya yazılan soru; Asistan açılınca kendiliğinden sorulur. */
  soru?: string;
  yonetim?: YonetimBolumu;
  ders?: DersAnahtari;
};

/** Hedefi rotaya çevirir (saf; testler/gezinme.test.mts). */
export function rotaKur(hedef: GitHedefi, secenek: GitSecenegi = {}, yonetimde = false): Rota {
  if (hedef === "notlar") return { g: "akademi", ders: secenek.ders };
  switch (hedef) {
    case "odul":
      // Yönetim görünümünde ödül işleri (görev QR'si, sponsor, kampanya) Yönetim'de.
      return yonetimde ? { g: "yonetim", yonetim: secenek.yonetim ?? "ozet" } : { g: "odul", odul: secenek.odul };
    case "ben": return { g: "ben", ben: secenek.bolum };
    case "akademi": return { g: "akademi", ders: secenek.ders };
    case "asistan": return { g: "asistan", soru: secenek.soru };
    case "yonetim": return { g: "yonetim", yonetim: secenek.yonetim ?? "ozet" };
    default: return { g: hedef };
  }
}

/** Aynı ekran mı (sahne yeniden kurulmalı mı)? Soru ve yönetim bölümü ekranı değiştirmez. */
export function rotaAnahtari(r: Rota) {
  return [r.g, r.ben ?? r.odul ?? "", r.ders ? `${r.ders.kurum ?? ""}|${r.ders.kod ?? ""}|${r.ders.ad}` : ""].join("/");
}

/** Geçmiş yoksa (ilk açılış, yenileme) "geri" dünyanın girişine götürür. */
export function ustRota(r: Rota): Rota {
  if (r.g === "ben" && r.ben) return { g: "ben" };
  if (r.g === "odul" && r.odul) return { g: "odul" };
  if (r.g === "akademi" && r.ders) return { g: "akademi" };
  if (r.g === "sohbet") return { g: "topluluk" };
  if (r.g === "ekip") return { g: "ben" };
  return { g: "ana" };
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
