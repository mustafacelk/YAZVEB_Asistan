/**
 * Ekip modülünün tipleri ve saf gösterim yardımcıları. Ağa ve Supabase
 * istemcisine dokunmaz: Ana'nın "Bugün" listesi ve testler buradan okur
 * (testler/ekip.test.mts). Çağrılar veri/ekip.ts'te.
 */

export type EkipKodu = "cekirdek" | "etkinlik" | "tasarim" | "icerik" | "egitim" | "dis";
export type IsDurumu = "sirada" | "yapiliyor" | "onayda" | "bitti" | "kacti";
export type UstlenmeDurumu = "ustlendi" | "teslim" | "onaylandi" | "birakti" | "olmadi";

export type Kisi = { id: string; kullanici_adi: string; ad: string };
export type RolOzeti = { kod: string; ad: string; ekip: EkipKodu; lider: boolean };
export type Rol = RolOzeti & { cekirdek: boolean; kontenjan: number; saat: string };
export type Ekip = { kod: EkipKodu; ad: string };
export type SinavHaftasi = { ad: string; baslangic: string; bitis: string };

export type PanoIsi = {
  id: number;
  baslik: string;
  ekip: EkipKodu;
  sahibi: Kisi;
  teslim: string;
  durum: IsDurumu;
  notu: string | null;
  ertelendi: number;
  gecikti: boolean;
  kacti_kayit: boolean;
  bitti_zaman: string | null;
  olusturuldu: string;
};

export type KadroUyesi = Kisi & {
  rol: string;
  durum: "deneme" | "kesin";
  eklendi: string;
  kacti: number;
  acik: number;
  geciken: number;
};

export type Pano = {
  bugun: string;
  ben: { id: string; tam_yetki: boolean; yonettikleri: EkipKodu[]; rol: RolOzeti | null };
  ayarlar: { kacti_esigi: number; aylik_acik_is: number; donem_baslangic: string };
  sinav: SinavHaftasi[];
  ekipler: Ekip[];
  roller: Rol[];
  kadro: KadroUyesi[];
  isler: PanoIsi[];
};

export type AcikIs = {
  id: number;
  baslik: string;
  aciklama: string | null;
  ekip: EkipKodu;
  ekip_adi: string;
  sure_saat: 1 | 2 | 3;
  xp: number;
  tarih: string;
  saat: string | null;
  saha: boolean;
  kontenjan: number;
  durum: "acik" | "kapandi" | "iptal";
  dolu: number;
  etkinlik: { id: number; baslik: string; baslangic: string } | null;
  benim: UstlenmeDurumu | null;
};

export type BenimUstlenmem = {
  is_id: number;
  baslik: string;
  ekip_adi?: string;
  tarih: string;
  saat: string | null;
  sure_saat: number;
  durum: UstlenmeDurumu;
  xp: number;
  is_durumu?: "acik" | "kapandi" | "iptal";
};

export type Havuz = {
  sinav: string | null;
  isler: AcikIs[];
  benim: BenimUstlenmem[];
  tamamlanan: number;
};

export type Ustlenen = Kisi & { durum: UstlenmeDurumu; xp: number; ustlenildi: string };
export type YonetimAcikIsi = AcikIs & { ustlenenler: Ustlenen[]; etkinlik_id: number | null };
export type HavuzYonetimi = {
  sinav: string | null;
  yonettikleri: EkipKodu[];
  isler: YonetimAcikIsi[];
  ay: Record<EkipKodu, number>;
  hedef: number;
  adaylar: (Kisi & { tamamlanan: number; son: string })[];
};

export type EkipOzeti = {
  kadroda: boolean;
  tam_yetki: boolean;
  rol: RolOzeti | null;
  ustlenmeler: BenimUstlenmem[];
  isler: PanoIsi[];
};

export type AcikIsTaslagi = {
  id?: number;
  baslik: string;
  aciklama?: string;
  ekip: EkipKodu;
  sure_saat: number;
  tarih: string;
  saat?: string;
  etkinlik_id?: number | null;
  saha?: boolean;
  kontenjan?: number;
};

export type IsTaslagi = {
  id?: number;
  baslik: string;
  ekip: EkipKodu;
  sahibi: string;
  teslim: string;
  notu?: string;
};

// ── Gösterim yardımcıları (saf) ─────────────────────────────────────

export const DURUM_ADI: Record<IsDurumu, string> = {
  sirada: "Sırada",
  yapiliyor: "Yapılıyor",
  onayda: "Onayda",
  bitti: "Bitti",
  kacti: "Kaçtı",
};

/** Panoda gösterim sırası: önce dikkat isteyen. */
export const DURUM_SIRASI: IsDurumu[] = ["yapiliyor", "sirada", "onayda", "bitti", "kacti"];

/** "2026-10-12" → yerel gün (saat dilimi kaymadan). */
export function gunNesnesi(gun: string): Date {
  const [y, a, g] = gun.slice(0, 10).split("-").map(Number);
  return new Date(y, a - 1, g);
}

/** İki "YYYY-AA-GG" arasındaki gün farkı (b − a). */
export function gunFarki(a: string, b: string): number {
  return Math.round((gunNesnesi(b).getTime() - gunNesnesi(a).getTime()) / 86_400_000);
}

export function gunEkle(gun: string, n: number): string {
  const d = gunNesnesi(gun);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Teslim tarihinin insan dilinde karşılığı ve aciliyeti. */
export function teslimEtiketi(teslim: string, bugun: string): { metin: string; ton: "gecikti" | "yakin" | "normal" } {
  const fark = gunFarki(bugun, teslim);
  if (fark < 0) return { metin: `${-fark} gün gecikti`, ton: "gecikti" };
  if (fark === 0) return { metin: "Bugün", ton: "yakin" };
  if (fark === 1) return { metin: "Yarın", ton: "yakin" };
  if (fark <= 3) return { metin: `${fark} gün kaldı`, ton: "yakin" };
  return {
    metin: gunNesnesi(teslim).toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" }),
    ton: "normal",
  };
}

/** Gün bir sınav haftasının içindeyse o haftanın adı (vize/final). */
export function sinavHaftasi(gun: string, sinav: SinavHaftasi[]): string | null {
  const s = sinav.find((x) => gun >= x.baslangic.slice(0, 10) && gun <= x.bitis.slice(0, 10));
  return s ? s.ad : null;
}

export type PanoFiltresi = { kim: "hepsi" | "benim"; ekip: EkipKodu | "hepsi"; bitenler: boolean };

/**
 * Panoyu gösterime hazırlar: süzer, ekip ekip gruplar; her grupta önce
 * geciken, sonra teslim tarihine göre. Biten ve kaçan işler istenmedikçe gizli.
 */
export function panoyuDuzenle(p: Pano, f: PanoFiltresi): { ekip: Ekip; isler: PanoIsi[] }[] {
  const sec = p.isler.filter((i) =>
    (f.kim === "hepsi" || i.sahibi.id === p.ben.id)
    && (f.ekip === "hepsi" || i.ekip === f.ekip)
    && (f.bitenler || (i.durum !== "bitti" && i.durum !== "kacti")));
  return p.ekipler
    .map((e) => ({
      ekip: e,
      isler: sec.filter((i) => i.ekip === e.kod).sort((a, b) =>
        Number(b.gecikti) - Number(a.gecikti)
        || a.teslim.localeCompare(b.teslim)
        || DURUM_SIRASI.indexOf(a.durum) - DURUM_SIRASI.indexOf(b.durum)
        || a.id - b.id),
    }))
    .filter((g) => g.isler.length > 0);
}

/** Ekip başına özet: açık, geciken, bu hafta biten. */
export function ekipOzetleri(p: Pano): Record<string, { acik: number; geciken: number; biten: number }> {
  const sonuc: Record<string, { acik: number; geciken: number; biten: number }> = {};
  const haftaBasi = gunEkle(p.bugun, -6);
  for (const e of p.ekipler) sonuc[e.kod] = { acik: 0, geciken: 0, biten: 0 };
  for (const i of p.isler) {
    const s = sonuc[i.ekip];
    if (!s) continue;
    if (i.durum === "sirada" || i.durum === "yapiliyor" || i.durum === "onayda") s.acik++;
    if (i.gecikti) s.geciken++;
    if (i.durum === "bitti" && i.bitti_zaman && i.bitti_zaman.slice(0, 10) >= haftaBasi) s.biten++;
  }
  return sonuc;
}

/** Açık işin tarih ve saat satırı: "Perşembe 13:30 · 1 saat". */
export function acikIsZamani(a: { tarih: string; saat: string | null; sure_saat: number }, bugun: string): string {
  const fark = gunFarki(bugun, a.tarih);
  const gun = fark === 0 ? "Bugün" : fark === 1 ? "Yarın"
    : gunNesnesi(a.tarih).toLocaleDateString("tr-TR", fark < 7 ? { weekday: "long" } : { day: "numeric", month: "long" });
  return `${gun}${a.saat ? " " + a.saat.slice(0, 5) : ""} · ${a.sure_saat} saat`;
}

/** Bugün (İstanbul, cihaz saatiyle) "YYYY-AA-GG". */
export function bugunGunu(simdi = new Date()): string {
  return `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, "0")}-${String(simdi.getDate()).padStart(2, "0")}`;
}
