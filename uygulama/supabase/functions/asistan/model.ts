// ═══════════════════════════════════════════════════════════════════
// Model çağrısı — yanıt okuma, düşünme ayarı, yedekli yarış
// ═══════════════════════════════════════════════════════════════════
// Saf: Deno'ya da ağa da dokunmaz. Ağ çağrısı dışarıdan verilir; bu
// sayede zamanlama mantığı sahte modelle test edilir
// (testler/asistan_model.test.mts).
//
// "CEVABI GETİREMEDİM" NEREDEN GELİYORDU
// ───────────────────────────────────────
//   1. Boş cevap. Gemini 3 ailesi düşünen modeller; `maxOutputTokens`
//      düşünmeyi de sayar. 220 jetonluk bütçe bazen düşünmeye gidiyor,
//      geriye metin kalmıyordu. Artık düşünme en aza indiriliyor, bütçede
//      pay bırakılıyor ve kesilen cevap son tam cümlede bitiriliyor.
//   2. Kota (429) ve yoğunluk (503). Eski düzen takılan isteğin yanına
//      AYNI modele ikinci, üçüncü isteği atıyordu; dakikalık sınır dolunca
//      bu tam tersine hepsini düşürüyordu. Artık hata gelince aynı modele
//      yüklenilmez, yedek modele geçilir (ayrı kota).
//   3. Güvenlik süzgeci. Engellenen cevap hata değil: nazik bir ret cümlesi.
// ═══════════════════════════════════════════════════════════════════

/** Modelden dönen hata; HTTP durumu varsa taşır. */
export class ModelHatasi extends Error {
  constructor(mesaj: string, readonly durum?: number) {
    super(mesaj);
    this.name = "ModelHatasi";
  }
}

/**
 * Modele göre düşünme ayarı. Asistanın cevapları kısa ve bilgi zaten
 * istemde; uzun düşünme yalnızca gecikme ve boş cevap riski getirir.
 *
 *   Gemini 2.5 Flash / Flash-Lite   thinkingBudget: 0 (kapalı)
 *   Gemini 3 ve sonrası, "-latest"  thinkingLevel: "minimal"
 *   Daha eskiler                    ayar yok (düşünmüyorlar)
 *
 * Model ayarı tanımazsa 400 döner; çağıran bir kez ayarsız dener ve
 * bunu hatırlar (bkz. yarisliSor).
 */
export function dusunmeAyari(model: string): Record<string, unknown> | null {
  const m = model.toLowerCase();
  if (/gemini-2\.5-flash/.test(m)) return { thinkingBudget: 0 };
  if (/gemini-(1\.|2\.0|2\.5-pro)/.test(m)) return null;
  return { thinkingLevel: "minimal" };
}

/** Düşünmeye ayrılan pay: düşünme tamamen kapanmasa da cevap kesilmesin. */
export const DUSUNME_PAYI = 512;

type Parca = { text?: unknown; thought?: unknown };
type Aday = { content?: { parts?: Parca[] }; finishReason?: string };
type ModelYaniti = { candidates?: Aday[]; promptFeedback?: { blockReason?: string } };

export const ENGEL_CEVABI = "Bu konuda yardımcı olamam ama topluluk hakkında sorabileceğin her şey için buradayım.";

/**
 * Modelin JSON yanıtından cevap metnini çıkarır.
 *
 * - Metin birden çok parçaya bölünmüş gelebilir: hepsi birleştirilir.
 * - Düşünce parçaları (thought: true) cevap değildir, atılır.
 * - Jeton sınırında kesilen cevap son tam cümlede bitirilir.
 * - Güvenlik süzgecine takılan istek hata değil, ret cümlesidir.
 * Kullanılabilir metin yoksa ModelHatasi fırlatır.
 */
export function cevapMetni(v: unknown): string {
  const y = (v ?? {}) as ModelYaniti;
  if (y.promptFeedback?.blockReason) return ENGEL_CEVABI;
  const aday = y.candidates?.[0];
  if (!aday) throw new ModelHatasi("aday yok");
  const metin = (aday.content?.parts ?? [])
    .filter((p) => p.thought !== true && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim();
  const neden = aday.finishReason ?? "";
  if (!metin) {
    if (/SAFETY|BLOCKLIST|PROHIBITED|SPII|RECITATION/.test(neden)) return ENGEL_CEVABI;
    throw new ModelHatasi(`boş cevap (${neden || "neden yok"})`);
  }
  return neden === "MAX_TOKENS" ? cumledeKes(metin) : metin;
}

/**
 * Yarım kalan metni son tam cümlede bitirir. Hiç cümle sonu yoksa ya da
 * kesmek metnin yarısından fazlasını atacaksa olduğu gibi "…" ile biter.
 */
export function cumledeKes(metin: string): string {
  const t = metin.replace(/\[\[[^\]]*$/, "").trimEnd();
  let son = -1;
  for (let i = 0; i < t.length; i++) {
    if (".!?".includes(t[i]) && (i === t.length - 1 || /\s/.test(t[i + 1]))) son = i;
  }
  if (son >= t.length * 0.5) return t.slice(0, son + 1);
  return t.replace(/[\s,;:–-]+$/, "") + "…";
}

// ── Yedekli yarış ───────────────────────────────────────────────────

export type Cagri = (model: string, dusunmeli: boolean) => Promise<string>;

export type YarisAyari = {
  cagir: Cagri;
  birincil: string;
  /** Birincil kota/yoğunluk hatası verirse ya da geç kalırsa denenecek model. */
  yedek?: string | null;
  /** Birincil bu sürede dönmezse aynı modele ikinci istek (takılma kuyruğu). */
  ikinciAtisMs: number;
  /** Bu sürede hâlâ cevap yoksa yedek model de devreye girer. */
  yedekAtisMs: number;
  /** Toplam süre; aşılırsa son hata ile vazgeçilir. */
  toplamMs: number;
  /** Düşünme ayarını reddetmiş modeller (süreç boyunca hatırlanır). */
  ayarsizlar?: Set<string>;
};

/** Aynı modeli yeniden denemek anlamsız: kota, yetki, bulunamadı. */
const yuklenme = (h: unknown) => {
  const d = h instanceof ModelHatasi ? h.durum : undefined;
  return d === 429 || d === 401 || d === 403 || d === 404;
};

/**
 * Modeli sorar; ilk dönen cevap kazanır.
 *
 *   t=0              birincil
 *   hata 400         aynı model, düşünme ayarı olmadan (bir kez; hatırlanır)
 *   hata 429/5xx/…   hemen yedek model
 *   t=ikinciAtisMs   birincil takıldıysa (ve kota hatası almadıysa) ikinci istek
 *   t=yedekAtisMs    hâlâ cevap yoksa yedek model
 *   t=toplamMs       vazgeç
 */
export function yarisliSor(a: YarisAyari): Promise<string> {
  const ayarsizlar = a.ayarsizlar ?? new Set<string>();
  const yedek = a.yedek && a.yedek !== a.birincil ? a.yedek : null;

  return new Promise<string>((coz, reddet) => {
    let bitti = false;
    let ucan = 0;
    let sonHata: unknown = null;
    let yedekAtildi = false;
    let ikinciAtildi = false;
    let birincilYuklu = false;
    const zamanlar: ReturnType<typeof setTimeout>[] = [];

    const bitir = (f: () => void) => {
      if (bitti) return;
      bitti = true;
      zamanlar.forEach(clearTimeout);
      f();
    };
    const hepsiDustuyse = () => {
      // Bekleyen zamanlı atış varsa (yedek henüz atılmadı) onu beklemek yerine hemen dene.
      if (ucan > 0 || bitti) return;
      if (yedek && !yedekAtildi) { yedekAtildi = true; at(yedek); return; }
      // Geçici hata (5xx, boş cevap): aynı modele bir kez daha.
      if (!ikinciAtildi && !birincilYuklu) { ikinciAtildi = true; at(a.birincil); return; }
      bitir(() => reddet(sonHata ?? new ModelHatasi("model yanıt vermedi")));
    };

    const at = (model: string) => {
      if (bitti) return;
      const dusunmeli = !!dusunmeAyari(model) && !ayarsizlar.has(model);
      ucan++;
      a.cagir(model, dusunmeli).then(
        (m) => bitir(() => coz(m)),
        (h) => {
          ucan--;
          sonHata = h;
          if (bitti) return;
          if (h instanceof ModelHatasi && h.durum === 400 && dusunmeli) {
            ayarsizlar.add(model);
            at(model);
            return;
          }
          if (model === a.birincil && yuklenme(h)) birincilYuklu = true;
          if (yedek && !yedekAtildi && model !== yedek) { yedekAtildi = true; at(yedek); return; }
          hepsiDustuyse();
        },
      );
    };

    at(a.birincil);
    zamanlar.push(setTimeout(() => {
      if (!bitti && !ikinciAtildi && !birincilYuklu) { ikinciAtildi = true; at(a.birincil); }
    }, a.ikinciAtisMs));
    if (yedek) {
      zamanlar.push(setTimeout(() => {
        if (!bitti && !yedekAtildi) { yedekAtildi = true; at(yedek); }
      }, a.yedekAtisMs));
    }
    zamanlar.push(setTimeout(() => {
      bitir(() => reddet(sonHata ?? new ModelHatasi("zaman aşımı")));
    }, a.toplamMs));
  });
}

// ── Sesli soru: kaydı yazıya dökme ──────────────────────────────────
//
// Tarayıcının kendi konuşma tanıması her yerde çalışmıyor (Firefox'ta yok;
// Brave/Opera'da var görünüp sonuç vermiyor; bazı masaüstü kurulumlarında
// sessizce hiçbir şey döndürmüyor). O durumda uygulama sesi kaydeder, 16 kHz
// WAV olarak buraya yollar; model yalnızca yazıya döker. Cevap, yazıya
// dökülen metinle normal yoldan (hızlı cevap, güvenlik, kota) istenir.

/** ~20 sn'lik 16 kHz mono 16 bit WAV ≈ 640 KB; base64 ile ≈ 850 KB. */
export const SES_SINIR = { base64: 900_000, govdeBayt: 920_000 } as const;
const SES_TURLERI = ["audio/wav", "audio/ogg", "audio/mp3", "audio/mpeg", "audio/aac", "audio/flac"];

export type SesIstegi = { veri: string; tur: string };

export function sesIstegiDogrula(g: unknown): { tamam: true; deger: SesIstegi } | { tamam: false; neden: string } {
  if (typeof g !== "object" || g === null || Array.isArray(g)) return { tamam: false, neden: "ses nesne değil" };
  const { veri, tur } = g as Record<string, unknown>;
  if (typeof tur !== "string" || !SES_TURLERI.includes(tur)) return { tamam: false, neden: "ses türü desteklenmiyor" };
  if (typeof veri !== "string" || !veri) return { tamam: false, neden: "ses verisi yok" };
  if (veri.length > SES_SINIR.base64) return { tamam: false, neden: "ses çok uzun" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(veri)) return { tamam: false, neden: "ses verisi bozuk" };
  return { tamam: true, deger: { veri, tur } };
}

export const TRANSKRIPT_TALIMATI =
  "Bu kayıtta bir üniversite öğrencisi, YAZVEB adlı öğrenci topluluğunun uygulamasındaki asistana " +
  "Türkçe bir soru soruyor. Konuşmayı olduğu gibi, düzgün Türkçe yazımla yazıya dök. Yalnızca " +
  "söylenen cümleyi yaz; açıklama, tırnak işareti, etiket ya da cevap ekleme. Kayıtta anlaşılır " +
  "bir konuşma yoksa yalnızca BOŞ yaz.";

export function transkriptGovdesi(ses: SesIstegi, dusunme: Record<string, unknown> | null) {
  return {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: ses.tur, data: ses.veri } },
        { text: TRANSKRIPT_TALIMATI },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 200 + (dusunme ? DUSUNME_PAYI : 0),
      ...(dusunme ? { thinkingConfig: dusunme } : {}),
    },
  };
}

/** Modelin yazıya döktüğü metni temizler; konuşma yoksa boş döner. */
export function transkriptTemizle(metin: string): string {
  const t = metin.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, "").replace(/\s+/g, " ").trim();
  if (!t || /^boş\.?$/i.test(t) || /^\(?(sessizlik|anlaşılmıyor)\)?\.?$/i.test(t)) return "";
  return t.slice(0, 1000);
}
