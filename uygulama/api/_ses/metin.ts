// ═══════════════════════════════════════════════════════════════════
// Seslendirme öncesi metin hazırlığı
// ═══════════════════════════════════════════════════════════════════
// Ayrı dosya: sunucu başlatmadan içe aktarılıp test edilebilsin diye.
// index.ts içinde dursaydı, onu import eden her test Deno.serve'i de
// çalıştırır ve askıda kalırdı.
// ═══════════════════════════════════════════════════════════════════

/**
 * Okunuşu bozulan kelimeler.
 *
 * Sentezleyici BÜYÜK HARFLE yazılmış kısaltmaları harf harf okur: "YAZVEB"
 * yerine "ye-a-ze-ve-e-be" duyulur. Okunabilir olanlar sözcük biçimine
 * çevrilir. Gerçekten harf harf okunması gerekenler (KVKK, GSB, XAI) bilerek
 * listede DEĞİL — onlarda harf harf okumak doğru davranış.
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

/** Ekranda iyi duran işaretler seste kötü durur; hepsi ayıklanır. */
function temizle(metin: string): string {
  return (metin ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " bağlantı ")
    .replace(/[*_#>|]+/g, " ")
    .replace(/^\s*[-•·]\s*/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/@/g, " et ")
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
  let t = nefesVer(temizle(metin));
  for (const [kalip, yerine] of OKUNUS) t = t.replace(kalip, yerine);
  return t;
}
