// ═══════════════════════════════════════════════════════════════════
// Konuşma tanıma parçalarını tekrarsız birleştirme
// ═══════════════════════════════════════════════════════════════════
// Tarayıcılar aynı konuşmayı farklı biçimlerde parça parça yolluyor:
//
//   Masaüstü Chrome   "merhaba" · "nasılsın"               (ardışık)
//   Android Chrome    "merhaba" · "merhaba nasılsın"       (birikimli)
//   Yeniden başlatma  "... nasılsın" · "nasılsın"          (tekrar)
//
// Parçaları körlemesine uç uca eklemek Android'de "merhaba merhaba
// nasılsın" üretiyordu. Burada her yeni parça, eldeki metnin sonuyla
// kelime kelime örtüştürülür; yalnızca gerçekten yeni olan kısım eklenir.
// ═══════════════════════════════════════════════════════════════════

const kelimeler = (m: string) => m.trim().split(/\s+/).filter(Boolean);

/** Karşılaştırma için: büyük/küçük harf ve noktalama farkı tekrar sayılmaz. */
const sade = (k: string) =>
  k.replace(/I/g, "ı").replace(/İ/g, "i").toLocaleLowerCase("tr").replace(/[.,!?;:…"']/g, "");

/** `eldeki` metnin sonuna `yeni` parçayı tekrar etmeden ekler. */
export function birlestir(eldeki: string, yeni: string, yarimKelime = false): string {
  const a = kelimeler(eldeki);
  const b = kelimeler(yeni);
  if (!b.length) return a.join(" ");
  if (!a.length) return tekrarlariSeyrelt(b).join(" ");

  const as = a.map(sade);
  const bs = b.map(sade);

  // Yeni parça zaten eldekinin içinde bir yerde bitiyorsa (yeniden
  // başlatmada son parçanın bir kez daha gelmesi) hiçbir şey ekleme.
  if (bs.length <= as.length) {
    for (let bas = as.length - bs.length; bas >= 0; bas--) {
      if (bs.every((k, i) => k === as[bas + i])) {
        // Ancak tam sondaysa kesin tekrar; ortadaysa kullanıcı aynı sözü
        // yeniden söylemiş olabilir. Bu yüzden yalnızca son pencereye bakılır.
        if (bas + bs.length === as.length) return a.join(" ");
        break;
      }
    }
  }

  // En uzun örtüşme: eldekinin son k kelimesi == yeninin ilk k kelimesi.
  let ortusme = 0;
  for (let k = Math.min(as.length, bs.length); k > 0; k--) {
    let esit = true;
    for (let i = 0; i < k; i++) {
      if (as[as.length - k + i] !== bs[i]) { esit = false; break; }
    }
    if (esit) { ortusme = k; break; }
  }

  // Ara sonuçlarda son kelime yarım gelir ("nası" → "nasılsın"): yarım
  // kelime yenisinin başıysa yerini tam haline bırakır. Kesin sonuçlarda
  // uygulanmaz — orada "bu bugün" gerçekten iki kelimedir.
  let bas = a;
  if (yarimKelime && ortusme === 0) {
    const son = as[as.length - 1];
    if (son.length >= 2 && bs[0].startsWith(son) && bs[0] !== son) bas = a.slice(0, -1);
  }

  return tekrarlariSeyrelt([...bas, ...b.slice(ortusme)]).join(" ");
}

/**
 * Aynı kelimenin art arda üç ve daha fazla kez gelmesi tanıma hatasıdır;
 * ikiye indirilir. İki kez ("çok çok", "yavaş yavaş") Türkçede olağandır,
 * dokunulmaz.
 */
function tekrarlariSeyrelt(liste: string[]): string[] {
  const cikti: string[] = [];
  for (const k of liste) {
    const n = cikti.length;
    if (n >= 2 && sade(cikti[n - 1]) === sade(k) && sade(cikti[n - 2]) === sade(k)) continue;
    cikti.push(k);
  }
  return cikti;
}

/**
 * Bir tanıma olayının tüm sonuç listesinden oturum metnini çıkarır.
 *
 * `resultIndex`'e güvenilmez: Android bazen 0'dan yeniden gönderiyor.
 * Liste her olayda baştan okunur ve birleştirme tekrarları eler.
 */
export function oturumMetni(sonuclar: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>) {
  let kesin = "";
  let ara = "";
  for (let i = 0; i < sonuclar.length; i++) {
    const s = sonuclar[i];
    if (s.isFinal) kesin = birlestir(kesin, s[0].transcript);
    else ara = birlestir(ara, s[0].transcript, true);
  }
  return { kesin, ara };
}
