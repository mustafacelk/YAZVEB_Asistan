// ═══════════════════════════════════════════════════════════════════
// Giriş alıntıları — her pencereye kendi sözleri
// ═══════════════════════════════════════════════════════════════════
// Üye "neden buradayım?", yönetici "neden yönetiyorum?", işletme "neden bu
// ortaklığın içindeyim?" sorusunun cevabını her girişte başka bir sözle görür.
//
// KAYNAK KURALI
// ─────────────
// Yalnızca sahibi belgelenmiş sözler. İnternette dolaşan ama kime ait olduğu
// tartışmalı olanlar (Drucker'a, Franklin'e, Churchill'e mal edilen birçok
// söz gibi) bilerek alınmadı: yanlış kişiye mal edilmiş bir söz, topluluğu
// tanıtan bir ekranda tanıtmanın tersini yapar. Türkçeleri anlamı koruyan
// kısa çevirilerdir. Yeni söz eklerken aynı kural geçerli.
// ═══════════════════════════════════════════════════════════════════

export type Alinti = { soz: string; kim: string; not?: string };
export type AlintiSeti = "uye" | "yonetim" | "isletme";

export const ALINTILAR: Record<AlintiSeti, readonly Alinti[]> = {
  // Merak, öğrenmek, birlikte üretmek — ve yapay zekânın kökleri.
  uye: [
    { soz: "Hayatta en hakiki mürşit ilimdir.", kim: "Mustafa Kemal Atatürk" },
    { soz: "Özel bir yeteneğim yok. Yalnızca tutkuyla meraklıyım.", kim: "Albert Einstein" },
    { soz: "Önemli olan, soru sormayı bırakmamaktır.", kim: "Albert Einstein" },
    { soz: "Makineler düşünebilir mi? Bu soruyu ele almayı öneriyorum.", kim: "Alan Turing", not: "1950" },
    { soz: "Geleceği öngörmenin en iyi yolu, onu icat etmektir.", kim: "Alan Kay" },
    { soz: "Hayatta hiçbir şeyden korkulmamalı; yalnızca anlaşılmalı.", kim: "Marie Curie" },
    { soz: "Tek başımıza çok az şey yapabiliriz; birlikte çok şey yapabiliriz.", kim: "Helen Keller" },
    { soz: "Kimse bir senfoniyi tek başına ıslıkla çalamaz; onu bir orkestra çalar.", kim: "Halford E. Luccock" },
    { soz: "Analitik Makine cebirsel örüntüler dokur; tıpkı Jakar tezgâhının çiçek ve yaprak dokuduğu gibi.", kim: "Ada Lovelace", not: "1843" },
    { soz: "Yapay zekâ yeni elektriktir.", kim: "Andrew Ng" },
  ],
  // Liderlik, emek, gençlere yol açmak.
  yonetim: [
    { soz: "Liderlik ve öğrenme birbirinden ayrılamaz.", kim: "John F. Kennedy" },
    { soz: "Eşyayı yönetirsin; insanlara ise liderlik edersin.", kim: "Grace Hopper" },
    { soz: "Lider, yolu bilen, o yolda yürüyen ve yolu gösteren kişidir.", kim: "John C. Maxwell" },
    { soz: "Harika işler çıkarmanın tek yolu, yaptığın işi sevmektir.", kim: "Steve Jobs", not: "2005" },
    { soz: "Yaratıcılık, bir şeyleri birbirine bağlamaktır.", kim: "Steve Jobs" },
    { soz: "Gençler! Cesaretimizi takviye ve idame eden sizlersiniz.", kim: "Mustafa Kemal Atatürk" },
    { soz: "Limandaki gemi güvendedir; ama gemiler bunun için yapılmadı.", kim: "John A. Shedd" },
  ],
  // Gençlere, eğitime, geleceğe yatırım; iyilikle kurulan ortaklık.
  isletme: [
    { soz: "Eğitim, dünyayı değiştirmek için kullanabileceğiniz en güçlü silahtır.", kim: "Nelson Mandela" },
    { soz: "Bir yıl sonrasını düşünüyorsan pirinç ek; on yıl sonrasını düşünüyorsan ağaç dik; yüz yıl sonrasını düşünüyorsan insan yetiştir.", kim: "Guanzi" },
    { soz: "Gelecek, ona bugünden hazırlananlarındır.", kim: "Malcolm X" },
    { soz: "Bütün ümidim gençliktedir.", kim: "Mustafa Kemal Atatürk" },
    { soz: "Başkaları için yaşanan bir hayat, yaşamaya değer tek hayattır.", kim: "Albert Einstein" },
    { soz: "Kimsenin dünyayı iyileştirmeye başlamak için bir an bile beklemesine gerek olmaması ne harika.", kim: "Anne Frank" },
    { soz: "Tek başımıza çok az şey yapabiliriz; birlikte çok şey yapabiliriz.", kim: "Helen Keller" },
  ],
};

const ANAHTAR = "yazveb:alinti:";

/** Bu açılışta seçilenler: sekme değişip ekran yeniden çizilince söz değişmesin. */
const secilen: Partial<Record<AlintiSeti, Alinti>> = {};

/**
 * Uygulamanın her açılışında sıradaki söz. Liste sırayla döner, yani art
 * arda iki girişte aynı söz çıkmaz; ilk açılış rastgele bir yerden başlar.
 */
export function girisAlintisi(set: AlintiSeti, rastgele: () => number = Math.random): Alinti {
  const onceki = secilen[set];
  if (onceki) return onceki;
  const liste = ALINTILAR[set];
  let sira: number;
  try {
    const son = localStorage.getItem(ANAHTAR + set);
    sira = son === null ? Math.floor(rastgele() * liste.length) : (Number(son) + 1) % liste.length;
    if (!Number.isInteger(sira) || sira < 0) sira = 0;
    localStorage.setItem(ANAHTAR + set, String(sira));
  } catch {
    sira = Math.floor(rastgele() * liste.length);   // gizli sekme: her açılışta rastgele
  }
  return (secilen[set] = liste[sira]);
}
