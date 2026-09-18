// ═══════════════════════════════════════════════════════════════════
// Seslendirme öncesi metin hazırlığı
// ═══════════════════════════════════════════════════════════════════
// Ayrı dosya: sunucu başlatmadan içe aktarılıp test edilebilsin diye.
// index.ts içinde dursaydı, onu import eden her test Deno.serve'i de
// çalıştırır ve askıda kalırdı.
//
// NEDEN BU KADAR İŞ
// ─────────────────
// Sentezleyici ne görürse onu okur. Ekranda doğal duran pek çok şey seste
// bozulur: "CV" harf harf "ce ve", "14.00'te" "on dört nokta sıfır sıfır",
// "1.050 XP" "bir nokta sıfır elli iks pe". Doğal ses hissinin yarısı sesin
// kendisinden, yarısı ona verilen metinden gelir. Burada metin, bir insanın
// yüksek sesle okuyacağı biçime çevrilir.
// ═══════════════════════════════════════════════════════════════════

/**
 * Okunuşu bozulan kelimeler.
 *
 * Sentezleyici BÜYÜK HARFLE yazılmış kısaltmaları harf harf okur: "YAZVEB"
 * yerine "ye-a-ze-ve-e-be" duyulur. Okunabilir olanlar sözcük biçimine
 * çevrilir. Türkçe harf adlarıyla okunması doğru olanlar (KVKK, GSB, SKS)
 * bilerek listede DEĞİL — onlarda harf harf okumak doğru davranış.
 */
const OKUNUS: [RegExp, string][] = [
  [/\bYAZVEB\b/g, "Yazveb"],
  [/\bTÜBİTAK\b/g, "Tübitak"],
  [/\bTEKNOFEST\b/g, "Teknofest"],
  [/\bULAKBİM\b/g, "Ulakbim"],
  [/\bTRUBA\b/g, "Truba"],
  [/\bTÜİK\b/g, "Tüik"],
  [/\bSÜMEDER\b/g, "Sümeder"],
  [/\bMLOps\b/g, "Em El Ops"],
];

/**
 * Öğrencinin gündelik konuşmada İNGİLİZCE harf adlarıyla söylediği
 * kısaltmalar. Türkçe sentezleyici bunları "ce ve", "a ı" diye okur; kimse
 * öyle söylemez. Yalnızca BÜYÜK harfli yazımı yakalanır ("it" gibi gündelik
 * kelimeler etkilenmesin). Kesme işaretli ek korunur: "CV'ni" → "si vi'ni".
 */
const INGILIZCE_KISALTMA: Record<string, string> = {
  CV: "si vi",
  AI: "ey ay",
  API: "ey pi ay",
  GPT: "ci pi ti",
  LLM: "el el em",
  NLP: "en el pi",
  ML: "em el",
  GPU: "ci pi yu",
  CPU: "si pi yu",
  UI: "yu ay",
  UX: "yu eks",
  IT: "ay ti",
  SQL: "es ku el",
  XP: "iks pi",
  QR: "kü ar",
  RAG: "rag",
  PIN: "pin",
  PDF: "pe de ef",
  MIT: "em ay ti",
  HR: "eyç ar",
};

/** Marka ve teknoloji adları: Türkçe sentezleyici için okunuş yazımı. */
const MARKA: [RegExp, string][] = [
  [/\bChatGPT\b/g, "çet ci pi ti"],
  [/\bLinkedIn\b/gi, "linkıdin"],
  [/\bGitHub\b/gi, "githab"],
  [/\bPython\b/g, "paytın"],
  [/\bWhatsApp\b/gi, "vatsap"],
  [/\bKaggle\b/g, "kegıl"],
  [/\bHugging Face\b/g, "haging feys"],
  [/\bYouTube\b/gi, "yutub"],
  [/\bGoogle\b/g, "gugıl"],
  // Uygulamadaki seviye adları
  [/\bSTARTER\b/g, "starter"],
  [/\bEXPLORER\b/g, "eksplorır"],
  [/\bBUILDER\b/g, "bildır"],
  [/\bCREATOR\b/g, "kriyeytır"],
  [/\bCORE\b/g, "kor"],
  [/\bELITE\b/g, "elit"],
];

/** Noktalı kısaltmalar: "Doç. Dr." cümle sonu sanılıp bölünmesin. */
const NOKTALI: [RegExp, string][] = [
  [/\bProf\.\s*Dr\./g, "Profesör Doktor"],
  [/\bDoç\.\s*Dr\./g, "Doçent Doktor"],
  [/\bDr\.\s*Öğr\.\s*Üyesi\b/g, "Doktor Öğretim Üyesi"],
  [/\bArş\.\s*Gör\./g, "Araştırma Görevlisi"],
  // \b Türkçe harfleri sözcük saymaz: "Ö", "ö" ile başlayanlarda elle sınır.
  [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Öğr\.\s*Gör\./g, "Öğretim Görevlisi"],
  [/\bProf\./g, "Profesör"],
  [/\bDoç\./g, "Doçent"],
  [/\bDr\./g, "Doktor"],
  [/\bvb\./g, "ve benzeri"],
  [/\bvs\./g, "vesaire"],
  [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])[öÖ]rn\./g, "örneğin"],
  [/\bbkz\./gi, "bakınız"],
  [/\bNo\.\s*(?=\d)/g, "numara "],
];

/** Bilinen hesap ve adresler: harf yığını yerine okunur biçim. */
const ADRES: [RegExp, string][] = [
  [/@?yapayzekaveribilimitop\.su\b/gi, "Instagram'da yapay zeka veri bilimi top nokta es u"],
  [/\bselcuk\.edu\.tr\b/gi, "selcuk nokta edu nokta te re"],
];

// ── Sayılar ─────────────────────────────────────────────────────────

const BIRLER = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const ONLAR = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const BUYUK = ["", "bin", "milyon", "milyar"];

function ucHane(n: number): string {
  const y = Math.floor(n / 100);
  const o = Math.floor((n % 100) / 10);
  const b = n % 10;
  return [y === 0 ? "" : y === 1 ? "yüz" : `${BIRLER[y]} yüz`, ONLAR[o], BIRLER[b]]
    .filter(Boolean).join(" ");
}

/** 0 ≤ n < 10¹²: 1050 → "bin elli", 2026 → "iki bin yirmi altı". */
export function sayiyiYaz(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return String(n);
  n = Math.floor(n);
  if (n === 0) return "sıfır";
  const parcalar: string[] = [];
  let kademe = 0;
  while (n > 0) {
    const grup = n % 1000;
    if (grup) {
      // "bir bin" denmez, "bin" denir; "bir milyon" ise doğru.
      const soz = kademe === 1 && grup === 1 ? "" : ucHane(grup);
      parcalar.unshift([soz, BUYUK[kademe]].filter(Boolean).join(" "));
    }
    n = Math.floor(n / 1000);
    kademe++;
  }
  return parcalar.join(" ");
}

const SIRA_SONU: Record<string, string> = {
  bir: "birinci", iki: "ikinci", üç: "üçüncü", dört: "dördüncü", beş: "beşinci",
  altı: "altıncı", yedi: "yedinci", sekiz: "sekizinci", dokuz: "dokuzuncu",
  on: "onuncu", yirmi: "yirminci", otuz: "otuzuncu", kırk: "kırkıncı", elli: "ellinci",
  altmış: "altmışıncı", yetmiş: "yetmişinci", seksen: "sekseninci", doksan: "doksanıncı",
  yüz: "yüzüncü", bin: "bininci", milyon: "milyonuncu", milyar: "milyarıncı",
};

/** 3 → "üçüncü", 21 → "yirmi birinci". */
export function sirayiYaz(n: number): string {
  const soz = sayiyiYaz(n).split(" ");
  const son = soz.pop()!;
  return [...soz, SIRA_SONU[son] ?? son].join(" ");
}

const AYLAR = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos",
  "eylül", "ekim", "kasım", "aralık"];

/** "1.050" → 1050 (Türkçede nokta binlik ayraçtır). */
const tamSayi = (m: string) => Number(m.replace(/\./g, ""));

function sayilariOku(metin: string): string {
  let t = metin;
  // Sayıdan sonra gelen kesme işaretli ek sözcüğe yapışır: "14.00'te" → "on dörtte".
  const ek = "(?:['’]([a-zçğıöşü]+))?";
  const ekle = (soz: string, e?: string) => (e ? soz + e : soz);
  // Harfe yapışık rakam sayı değildir: "v2", "3D", "H2O" olduğu gibi kalır.
  const HARF = "A-Za-zÇĞİÖŞÜçğıöşü";

  // Tarih: 20.09.2026 veya 20/09/2026
  t = t.replace(new RegExp(`\\b(\\d{1,2})[./](\\d{1,2})[./](\\d{4})\\b${ek}`, "g"),
    (_, g, a, y, e) => {
      const ay = AYLAR[Number(a) - 1];
      if (!ay || Number(g) < 1 || Number(g) > 31) return _;
      return ekle(`${sayiyiYaz(Number(g))} ${ay} ${sayiyiYaz(Number(y))}`, e);
    });
  // Saat: 14.00, 14:30, 09.15 (dakika iki hane; "1.050" üç hane olduğu için karışmaz)
  t = t.replace(new RegExp(`\\b([01]?\\d|2[0-3])[.:]([0-5]\\d)\\b(?![.,]?\\d)${ek}`, "g"),
    (_, s, d, e) => ekle(Number(d) === 0 ? sayiyiYaz(Number(s)) : `${sayiyiYaz(Number(s))} ${sayiyiYaz(Number(d))}`, e));
  // Yüzde: %20, % 20, %2,5
  t = t.replace(new RegExp(`%\\s?(\\d+)(?:,(\\d+))?${ek}`, "g"),
    (_, a, k, e) => ekle(`yüzde ${sayiyiYaz(Number(a))}${k ? ` virgül ${k.split("").map((r: string) => sayiyiYaz(Number(r))).join(" ")}` : ""}`, e));
  // Sıra sayısı: "3. sınıf" (arkasından küçük harfle başlayan sözcük)
  t = t.replace(/\b(\d{1,3})\.\s+(?=[a-zçğıöşü])/g, (_, s) => `${sirayiYaz(Number(s))} `);
  // Ondalık: 2,5
  t = t.replace(new RegExp(`(?<![\\d${HARF}])(\\d{1,3}(?:\\.\\d{3})*|\\d+),(\\d+)(?![\\d${HARF}])${ek}`, "g"),
    (_, a, k, e) => ekle(`${sayiyiYaz(tamSayi(a))} virgül ${sayiyiYaz(Number(k))}`, e));
  // Binlik ayraçlı ve düz tam sayılar: 1.050, 400, 2026
  t = t.replace(new RegExp(`(?<![\\d.,${HARF}])([+]?)(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?![\\d${HARF}])${ek}`, "g"),
    (_, _arti, s, e) => ekle(sayiyiYaz(tamSayi(s)), e));
  return t;
}

// ── Kısaltmalar ─────────────────────────────────────────────────────

function kisaltmalariOku(metin: string): string {
  let t = metin;
  for (const [kalip, yerine] of NOKTALI) t = t.replace(kalip, yerine);
  for (const [kalip, yerine] of ADRES) t = t.replace(kalip, yerine);
  t = t.replace(/@/g, " et ");                  // bilinmeyen hesap: "et mustafa"
  for (const [kalip, yerine] of MARKA) t = t.replace(kalip, yerine);
  // Sözcük sınırı Türkçe harfleri tanımadığı için sınır elle kurulur.
  t = t.replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])([A-Z]{2,4})(?![A-Za-zÇĞİÖŞÜçğıöşü])/g,
    (tam, k: string) => INGILIZCE_KISALTMA[k] ?? tam);
  for (const [kalip, yerine] of OKUNUS) t = t.replace(kalip, yerine);
  return t;
}

/** Ekranda iyi duran işaretler seste kötü durur; hepsi ayıklanır. */
function temizle(metin: string): string {
  return (metin ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " bağlantı ")
    .replace(/[*_#>|]+/g, " ")
    .replace(/^\s*[-•·]\s*/gm, "")
    .replace(/\s*·\s*/g, ", ")                    // "Başladı · 14.00" → "Başladı, on dört"
    .replace(/\s*&\s*/g, " ve ")
    .replace(/×\s*(\d)/g, "$1 kat ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Nefes aralıkları.
 *
 * Sentezleyicinin elindeki tek prozodi kolu noktalamadır: virgül kısa, nokta
 * uzun duraklama üretir. Robotik tını çoğunlukla metnin tek nefeste yazılmış
 * olmasından gelir — nefes yerleri burada açıkça işaretlenir.
 */
function nefesVer(metin: string): string {
  let t = metin;
  t = t.replace(/\s+[-–—]\s+/g, ", ");           // tire seste "eksi" gibi okunur
  t = t.replace(/([.!?])\1+/g, "$1");
  // Cümle sonundan sonra boşluk. Ama nokta her zaman cümle sonu değildir:
  //   "...top.su"  hesap adı — bölünürse "top. su" diye okunur
  //   "14.30"      saat      — bölünürse "14. 30" diye okunur
  // Bu yüzden yalnızca BÜYÜK harf geliyorsa gerçek cümle sınırı sayılır.
  t = t.replace(/([.!?])(?=[A-ZÇĞİÖŞÜ])/g, "$1 ");
  // Türkçede bu bağlaçlar zaten cümlecik sınırıdır; virgül konunca tonlama
  // doğal olarak alçalıp yükselir.
  t = t.replace(/(?<![,;:.!?])\s+(ama|fakat|ancak|çünkü|yani|dolayısıyla)\s+/gi, ", $1 ");
  t = t.replace(/\n{2,}/g, ". ").replace(/\n/g, ", ");
  t = t.replace(/\s*,\s*,+/g, ", ").replace(/\s{2,}/g, " ").trim();
  if (t && !".!?".includes(t.at(-1)!)) t += ".";
  return t;
}

export function seseHazirla(metin: string): string {
  // Sıra önemli: noktalı kısaltmalar ve adresler, nokta "cümle sonu" ya da
  // "saat ayracı" sanılmadan ÖNCE çözülür; sayılar en son.
  let t = temizle(metin);
  t = kisaltmalariOku(t);
  t = nefesVer(t);
  t = sayilariOku(t);
  return t.replace(/\s{2,}/g, " ").trim();
}
