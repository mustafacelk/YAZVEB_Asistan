/**
 * Notlar ekranının saf yardımcıları: etiketler, künye denetimi, akışa
 * sponsorlu kart yerleştirme. Ağa ve React'e bağlı değil; testler/notlar.test.mts.
 */

export type Sinif = "hazirlik" | "1" | "2" | "3" | "4" | "5" | "6" | "yuksek_lisans" | "doktora";
export type NotTuru = "ders_notu" | "cikmis_cozum" | "ozet";
export type Yariyil = "guz" | "bahar" | "yaz";
export type DosyaTuru = "pdf" | "jpg" | "png" | "webp";
export type Kademe = "altin" | "gumus" | "bronz";

export const SINIFLAR: { deger: Sinif; ad: string }[] = [
  { deger: "hazirlik", ad: "Hazırlık" },
  { deger: "1", ad: "1. sınıf" },
  { deger: "2", ad: "2. sınıf" },
  { deger: "3", ad: "3. sınıf" },
  { deger: "4", ad: "4. sınıf" },
  { deger: "5", ad: "5. sınıf" },
  { deger: "6", ad: "6. sınıf" },
  { deger: "yuksek_lisans", ad: "Yüksek lisans" },
  { deger: "doktora", ad: "Doktora" },
];
export const sinifAdi = (s: string | null | undefined) => SINIFLAR.find((x) => x.deger === s)?.ad ?? "";

export const TURLER: { deger: NotTuru; ad: string; kisa: string }[] = [
  { deger: "ders_notu", ad: "Ders notu", kisa: "Not" },
  { deger: "cikmis_cozum", ad: "Çıkmış soru çözümü", kisa: "Çıkmış" },
  { deger: "ozet", ad: "Özet", kisa: "Özet" },
];
export const turAdi = (t: string) => TURLER.find((x) => x.deger === t)?.ad ?? "Not";

export const YARIYILLAR: { deger: Yariyil; ad: string }[] = [
  { deger: "guz", ad: "Güz" },
  { deger: "bahar", ad: "Bahar" },
  { deger: "yaz", ad: "Yaz okulu" },
];

/** 2026 güz → "2026-27 Güz"; bahar ve yaz, akademik yılın ikinci takvim yılına aittir. */
export function donemEtiketi(yil: number, yariyil: string) {
  const ad = YARIYILLAR.find((x) => x.deger === yariyil)?.ad ?? "";
  const bas = yariyil === "guz" ? yil : yil - 1;
  return `${bas}-${String(bas + 1).slice(2)} ${ad}`.trim();
}

/** Bugünün akademik dönemi: Eylül-Ocak güz, Şubat-Haziran bahar, Temmuz-Ağustos yaz. */
export function simdikiDonem(t = new Date()): { yil: number; yariyil: Yariyil } {
  const ay = t.getMonth() + 1;
  if (ay >= 9) return { yil: t.getFullYear(), yariyil: "guz" };
  if (ay === 1) return { yil: t.getFullYear() - 1, yariyil: "guz" };
  if (ay <= 6) return { yil: t.getFullYear(), yariyil: "bahar" };
  return { yil: t.getFullYear(), yariyil: "yaz" };
}

export function boyutEtiketi(bayt: number | null | undefined) {
  if (!bayt || bayt <= 0) return "";
  if (bayt < 1024 * 1024) return `${Math.max(1, Math.round(bayt / 1024))} KB`;
  return `${(bayt / 1048576).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}

/** Tarayıcının söylediği türe değil, uzantıya da bakar; ikisi çelişirse reddeder. */
export function dosyaTuru(ad: string, mime: string): DosyaTuru | null {
  const uzanti = ad.toLowerCase().split(".").pop() ?? "";
  const m = mime.toLowerCase();
  if ((uzanti === "pdf") && (m === "application/pdf" || m === "")) return "pdf";
  if ((uzanti === "jpg" || uzanti === "jpeg") && (m === "image/jpeg" || m === "")) return "jpg";
  if (uzanti === "png" && (m === "image/png" || m === "")) return "png";
  if (uzanti === "webp" && (m === "image/webp" || m === "")) return "webp";
  return null;
}
export const MIME: Record<DosyaTuru, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp",
};

export type Kunye = {
  baslik: string;
  ders_adi: string;
  ders_kodu: string;
  bolum: string;
  sinif: Sinif | "";
  tur: NotTuru;
  yil: number;
  yariyil: Yariyil;
  hoca: string;
  aciklama: string;
};

const GORUNMEZ = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/;

/** Veritabanıyla aynı kurallar; ilk sorunu söyler. Sorun yoksa null. */
export function kunyeHatasi(k: Kunye): string | null {
  const b = k.baslik.trim();
  if (b.length < 3 || b.length > 120) return "Başlık 3-120 karakter olmalı.";
  const d = k.ders_adi.trim();
  if (d.length < 2 || d.length > 100) return "Ders adını yaz.";
  const kod = k.ders_kodu.trim().toUpperCase().replace(/\s+/g, " ");
  if (kod && !/^[A-Z0-9][A-Z0-9 .-]{1,19}$/.test(kod)) return "Ders kodu harf ve rakamlardan oluşmalı (ör. BM 203).";
  const bolum = k.bolum.trim();
  if (bolum.length < 2 || bolum.length > 80) return "Bölümünü yaz.";
  if (!k.sinif) return "Sınıfını seç.";
  if (k.hoca.trim() && (k.hoca.trim().length < 2 || k.hoca.trim().length > 80)) return "Hoca adı 2-80 karakter olmalı.";
  if (k.aciklama.trim().length > 500) return "Açıklama en fazla 500 karakter.";
  if ([b, d, kod, bolum, k.hoca, k.aciklama].some((m) => GORUNMEZ.test(m))) return "Metinde desteklenmeyen karakter var.";
  if (!Number.isInteger(k.yil) || k.yil < 2000 || k.yil > 2100) return "Geçersiz yıl.";
  return null;
}

/**
 * Akış: sponsorlu kart en fazla her beş kartta bir. Sıra sunucudan gelir
 * (kademe, sonra günlük dönüşüm). Organik not yoksa en fazla bir sponsorlu
 * kart görünür: sayfa asla reklamdan ibaret olmaz.
 */
export type AkisOgesi<N, S> = { tur: "not"; not: N } | { tur: "sponsorlu"; sponsorlu: S };
export function akisKur<N, S>(notlar: N[], sponsorlu: S[]): AkisOgesi<N, S>[] {
  const akis: AkisOgesi<N, S>[] = [];
  let s = 0;
  if (notlar.length === 0) {
    if (sponsorlu.length) akis.push({ tur: "sponsorlu", sponsorlu: sponsorlu[0] });
    return akis;
  }
  notlar.forEach((n, i) => {
    if (i % 4 === 0 && s < sponsorlu.length) akis.push({ tur: "sponsorlu", sponsorlu: sponsorlu[s++] });
    akis.push({ tur: "not", not: n });
  });
  return akis;
}

export type SinavDurumu = { id: number; ad: string; baslangic: string; bitis: string; asama: "yaklasiyor" | "suruyor"; gun: number };

/** "Vize haftasına 10 gün" / "Vize haftası sürüyor". */
export function sinavMetni(s: SinavDurumu) {
  if (s.asama === "suruyor") return `${s.ad} haftası sürüyor`;
  if (s.gun <= 0) return `${s.ad} haftası bugün başlıyor`;
  if (s.gun === 1) return `${s.ad} haftası yarın başlıyor`;
  return `${s.ad} haftasına ${s.gun} gün`;
}

export type PuanAyari = {
  taban_xp: number; oy_xp: number; not_tavan: number; haftalik_tavan: number;
  sinav_carpani: number; onay_saat: number; sinav_oncesi_gun: number; azami_bayt: number;
};

/** Paylaşım penceresindeki tek cümlelik puan özeti; ayarlar değişince kendiliğinden değişir. */
export function puanOzeti(a: PuanAyari, sinavOncesi: boolean) {
  const taban = Math.round(a.taban_xp * (sinavOncesi ? Number(a.sinav_carpani) : 1));
  return `Onaylanınca +${taban} XP${sinavOncesi ? " (sınav öncesi)" : ""}, her "işime yaradı" +${a.oy_xp} XP. ` +
    `Not başına en çok ${a.not_tavan}, haftada en çok ${a.haftalik_tavan} XP.`;
}

/** Sık bölümler: yazarken öneri (serbest metin de kabul). */
export const BOLUM_ONERILERI = [
  "Bilgisayar Mühendisliği", "Yazılım Mühendisliği", "Yapay Zekâ ve Veri Mühendisliği", "Elektrik-Elektronik Mühendisliği",
  "Makine Mühendisliği", "İnşaat Mühendisliği", "Endüstri Mühendisliği", "Kimya Mühendisliği", "Harita Mühendisliği",
  "Jeoloji Mühendisliği", "Maden Mühendisliği", "Mimarlık", "Şehir ve Bölge Planlama", "İç Mimarlık",
  "Matematik", "Fizik", "Kimya", "Biyoloji", "İstatistik", "Moleküler Biyoloji ve Genetik",
  "Tıp", "Diş Hekimliği", "Eczacılık", "Hemşirelik", "Veteriner Hekimliği", "Fizyoterapi ve Rehabilitasyon",
  "Hukuk", "İktisat", "İşletme", "Maliye", "Siyaset Bilimi ve Kamu Yönetimi", "Uluslararası İlişkiler",
  "Psikoloji", "Sosyoloji", "Tarih", "Türk Dili ve Edebiyatı", "Felsefe", "Coğrafya",
  "İngiliz Dili ve Edebiyatı", "Bilgisayar ve Öğretim Teknolojileri Öğretmenliği", "Sınıf Öğretmenliği",
  "Matematik Öğretmenliği", "Rehberlik ve Psikolojik Danışmanlık", "İletişim", "Gazetecilik", "Radyo, Televizyon ve Sinema",
  "Ziraat Mühendisliği", "Gıda Mühendisliği", "Spor Bilimleri", "Güzel Sanatlar",
];

// ── Akademi: dersler ──────────────────────────────────────────────

/** Ders listesinde bir ders: notları toplanmış hâli (sunucu: pano_dersler). */
export type DersOzeti = {
  kod: string | null;
  ad: string;
  kurum: string;
  universite: string;
  bolum: string;
  sinif: Sinif;
  not: number;
  ders_notu: number;
  cikmis: number;
  ozet: number;
  yararli: number;
  son: string;
};

/**
 * Ders adını karşılaştırma için sadeleştirir (sunucudaki pano.ders_normal ile
 * aynı): i, ı, İ, I aynı harf; "OLASILIK" = "Olasılık" = "olasilik".
 */
export function dersNormal(ad: string) {
  return ad.trim().replace(/\s+/g, " ").replace(/[İI]/g, "i").toLowerCase().replace(/ı/g, "i");
}

/** Dersin kimliği: kodu varsa kodu (büyük harf), yoksa sadeleştirilmiş adı; üniversiteyle birlikte. */
export function dersKimligi(d: { kod: string | null; ad: string; kurum?: string | null }) {
  const k = d.kod?.trim().replace(/\s+/g, " ").toUpperCase();
  return `${d.kurum ?? ""}|${k ? "kod:" + k : "ad:" + dersNormal(d.ad)}`;
}

type NotBenzeri = {
  ders_kodu: string | null; ders_adi: string; kurum_alani: string; universite: string;
  bolum: string; sinif: Sinif; tur: NotTuru; yararli: number; yayinlandi: string;
};

/** Bu not bu derse mi ait? (Eski veritabanı ders filtresini bilmezse istemcide süzülür.) */
export function dersUyar(n: Pick<NotBenzeri, "ders_kodu" | "ders_adi" | "kurum_alani">, d: { kod: string | null; ad: string; kurum?: string | null }) {
  return dersKimligi({ kod: n.ders_kodu, ad: n.ders_adi, kurum: d.kurum ? n.kurum_alani : null })
    === dersKimligi({ ...d, kurum: d.kurum ?? null });
}

/** En sık yazım; eşitlikte tamamı büyük harf olmayan (sunucuyla aynı kural). */
function enSik(dizi: string[]): string {
  const say = new Map<string, number>();
  for (const x of dizi) say.set(x, (say.get(x) ?? 0) + 1);
  return [...say.entries()].sort((a, b) =>
    b[1] - a[1]
    || Number(a[0] === a[0].toUpperCase()) - Number(b[0] === b[0].toUpperCase())
    || (a[0] < b[0] ? -1 : 1))[0][0];
}

/**
 * Notları derslere toplar — sunucudaki pano_dersler ile aynı kural. Yalnızca
 * veritabanı henüz güncellenmemişse (fonksiyon yoksa) yedek olarak kullanılır.
 */
export function dersleriGrupla(notlar: NotBenzeri[]): DersOzeti[] {
  const gruplar = new Map<string, NotBenzeri[]>();
  for (const n of notlar) {
    const k = dersKimligi({ kod: n.ders_kodu, ad: n.ders_adi, kurum: n.kurum_alani });
    gruplar.set(k, [...(gruplar.get(k) ?? []), n]);
  }
  return [...gruplar.values()].map((g) => ({
    kod: g[0].ders_kodu,
    ad: enSik(g.map((n) => n.ders_adi)),
    kurum: g[0].kurum_alani,
    universite: g[0].universite,
    bolum: enSik(g.map((n) => n.bolum)),
    sinif: enSik(g.map((n) => n.sinif)) as Sinif,
    not: g.length,
    ders_notu: g.filter((n) => n.tur === "ders_notu").length,
    cikmis: g.filter((n) => n.tur === "cikmis_cozum").length,
    ozet: g.filter((n) => n.tur === "ozet").length,
    yararli: g.reduce((t, n) => t + n.yararli, 0),
    son: g.map((n) => n.yayinlandi).sort().pop() ?? "",
  })).sort((a, b) => b.son.localeCompare(a.son) || a.ad.localeCompare(b.ad, "tr"));
}

/** "12 not · 3 çıkmış" gibi kısa sayım. */
export function dersSayimi(d: Pick<DersOzeti, "not" | "cikmis" | "ozet">) {
  const parca = [`${d.not} not`];
  if (d.cikmis) parca.push(`${d.cikmis} çıkmış`);
  if (d.ozet) parca.push(`${d.ozet} özet`);
  return parca.join(" · ");
}
