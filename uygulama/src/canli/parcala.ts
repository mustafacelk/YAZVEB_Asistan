/**
 * Cevabı seslendirme parçalarına böler (saf; testler/asistan.test.mts).
 *
 * NEDEN
 * ─────
 * Uzun bir cevabın tamamını seslendirmek birkaç saniye sürüyor; o sürede
 * ne ses var ne (senkron gösterimde) metin. İlk cümle tek başına çok daha
 * çabuk hazır olur ve çalmaya başlar; kalanı o çalarken üretilir.
 * Masaüstü asistanındaki kopru.py → cumlelere_bol ile aynı fikir.
 *
 * KURALLAR
 * ────────
 * - Parçalar uç uca eklenince metnin KENDİSİ çıkar (boşluklar dahil):
 *   ekranda hangi harfe kadar okunduğu bu konumlarla hesaplanır.
 * - Yalnızca cümle sonunda bölünür. "Doç. Dr.", "14.30", "A. Kaya" bölünmez.
 * - En fazla üç parça: her parça bir seslendirme isteği, kotada ayrı sayılır.
 */
export type SesParcasi = { metin: string; bas: number };

const ILK_EN_AZ = 25;       // "Merhaba!" tek başına bir parça olmasın
const ILK_EN_COK = 140;     // ilk parça uzarsa sesin başlaması gecikir
const TEK_PARCA = 90;       // bundan kısa metin bölünmez
const IKINCI_TEK = 220;     // kalan bundan kısaysa tek parça

/** Noktası cümle sonu olmayan kısaltmalar (küçük harfle). */
const KISALTMA = new Set(["prof", "doç", "dr", "öğr", "gör", "arş", "yrd", "vb", "vs", "örn", "bkz", "no", "sn", "st", "mah", "cad", "sok"]);

/** Cümle sonlarının bittiği konumlar (sonraki cümlenin başladığı indeks). */
function cumleSinirlari(t: string): number[] {
  const sinirlar: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    const satirSonu = c === "\n";
    if (!satirSonu && !".!?…".includes(c)) continue;
    // Arkasından boşluk gelmiyorsa cümle sonu değil ("14.30", "top.su").
    if (!satirSonu && i + 1 < t.length && !/\s/.test(t[i + 1])) continue;
    if (c === ".") {
      const kelime = /([A-Za-zÇĞİÖŞÜçğıöşü]+)$/.exec(t.slice(Math.max(0, i - 12), i))?.[1] ?? "";
      if (KISALTMA.has(kelime.toLocaleLowerCase("tr"))) continue;
      if (kelime.length === 1 && kelime === kelime.toLocaleUpperCase("tr")) continue;   // "A. Kaya"
    }
    let j = i + 1;
    while (j < t.length && /\s/.test(t[j])) j++;
    if (j >= t.length) break;
    if (sinirlar[sinirlar.length - 1] !== j) sinirlar.push(j);
    i = j - 1;
  }
  return sinirlar;
}

export function sesParcalari(metin: string): SesParcasi[] {
  if (!metin.trim()) return [];
  if (metin.length <= TEK_PARCA) return [{ metin, bas: 0 }];

  const sinirlar = cumleSinirlari(metin);
  if (!sinirlar.length) return [{ metin, bas: 0 }];

  // İlk parça: ilk cümle; çok kısaysa bir sonrakiyle birlikte.
  let ilkSon = sinirlar[0];
  for (let k = 1; ilkSon < ILK_EN_AZ && k < sinirlar.length; k++) {
    if (sinirlar[k] > ILK_EN_COK) break;
    ilkSon = sinirlar[k];
  }
  const parcalar: SesParcasi[] = [{ metin: metin.slice(0, ilkSon), bas: 0 }];
  const kalan = metin.length - ilkSon;
  if (kalan <= 0) return parcalar;

  if (kalan <= IKINCI_TEK) {
    parcalar.push({ metin: metin.slice(ilkSon), bas: ilkSon });
    return parcalar;
  }
  // Kalanı ikiye: ikinci parça kalanın yaklaşık yarısına kadar olan cümleler.
  const hedef = ilkSon + kalan * 0.45;
  const orta = sinirlar.find((s) => s > ilkSon && s >= hedef && s < metin.length);
  if (!orta) {
    parcalar.push({ metin: metin.slice(ilkSon), bas: ilkSon });
    return parcalar;
  }
  parcalar.push({ metin: metin.slice(ilkSon, orta), bas: ilkSon });
  parcalar.push({ metin: metin.slice(orta), bas: orta });
  return parcalar;
}

/**
 * Okunan konuma göre ekranda gösterilecek karakter sayısı: sözcük ortasında
 * kesilmesin diye bir sonraki boşluğa kadar uzatılır.
 */
export function gorunenUzunluk(metin: string, konum: number): number {
  if (konum <= 0) return 0;
  if (konum >= metin.length) return metin.length;
  const bosluk = metin.slice(konum).search(/\s/);
  return bosluk < 0 ? metin.length : konum + bosluk;
}
