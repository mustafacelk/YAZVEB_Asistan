// ═══════════════════════════════════════════════════════════════════
// Ses ölçer — küreyi besleyen gerçek genlik
// ═══════════════════════════════════════════════════════════════════
// İki kaynak var, ikisi de aynı AnalyserNode'dan okunur:
//
//   mikrofon   kullanıcı konuşurken   (MediaStream → Analyser)
//   yanıt sesi asistan konuşurken     (<audio> → Analyser → hoparlör)
//
// Küre her karede `seviye()`yi çeker; bu dosya React'e hiç dokunmaz,
// dolayısıyla ses ne kadar hızlı değişirse değişsin yeniden çizim olmaz.
//
// ANDROID NOTU
// ────────────
// Android Chrome'da konuşma tanıma mikrofonu tek başına istiyor; aynı anda
// getUserMedia ile açılırsa tanıma "audio-capture" hatasıyla düşüyor. Orada
// genlik okunmaz; küre tanımanın gerçek olaylarına (ses başladı / kelime
// geldi) tepki verir. Uydurma bir dalga çizilmez.
// ═══════════════════════════════════════════════════════════════════

type Kaynak = { tur: "mikrofon" | "yanit"; birak: () => void };

let baglam: AudioContext | null = null;
let analiz: AnalyserNode | null = null;
let tampon: Uint8Array | null = null;
let kaynak: Kaynak | null = null;

/** Olay tabanlı darbe (Android'de tanıma olaylarından gelir). */
let darbe = 0;
let darbeZamani = 0;

export const mikrofonOlculebilir =
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  !/Android/i.test(navigator.userAgent);

function hazirla(): AnalyserNode | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return null;
  if (!baglam) {
    baglam = new Ctx();
    analiz = baglam.createAnalyser();
    analiz.fftSize = 512;
    analiz.smoothingTimeConstant = 0.55;
    tampon = new Uint8Array(analiz.fftSize);
  }
  // Tarayıcılar sesi ancak bir dokunuştan sonra açar; her bağlanışta denenir.
  if (baglam.state === "suspended") baglam.resume().catch(() => {});
  return analiz;
}

/**
 * Ses bağlamını bir dokunuşun İÇİNDE açar.
 *
 * Yanıt sesi ağdan birkaç saniye sonra gelir; o anda artık "kullanıcı
 * hareketi" yoktur ve tarayıcı askıdaki bağlamı açmaz. Bu yüzden mikrofon,
 * gönder ve ses düğmeleri bunu dokunuş anında çağırır.
 */
export function sesiUyandir() {
  hazirla();
}

/** Eski kaynağı bırakır. Birden fazla kaynak aynı anda ölçülmez. */
export function kaynagiBirak() {
  kaynak?.birak();
  kaynak = null;
}

/** Mikrofonu ölçmeye başlar. Başarısız olursa sessizce `false` döner. */
export async function mikrofonuOlc(): Promise<boolean> {
  if (!mikrofonOlculebilir) return false;
  const a = hazirla();
  if (!a || !baglam) return false;
  try {
    const akis = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    kaynagiBirak();
    const dugum = baglam.createMediaStreamSource(akis);
    dugum.connect(a);          // hoparlöre bağlanmaz — yankı olmasın
    kaynak = {
      tur: "mikrofon",
      birak: () => {
        dugum.disconnect();
        akis.getTracks().forEach((t) => t.stop());   // mikrofon ışığı sönsün
      },
    };
    return true;
  } catch {
    return false;
  }
}

/** Çalan yanıt sesini ölçer; ses hoparlöre de gitmeye devam eder. */
export function yanitiOlc(ses: HTMLAudioElement) {
  const a = hazirla();
  // Bağlam açık değilse sesi ona bağlamak sesi SUSTURUR (element artık
  // yalnızca bağlam üzerinden çalar). Ölçümden vazgeçilir, ses doğrudan çalar.
  if (!a || !baglam || baglam.state !== "running") return;
  try {
    kaynagiBirak();
    const dugum = baglam.createMediaElementSource(ses);
    dugum.connect(a);
    a.connect(baglam.destination);
    kaynak = {
      tur: "yanit",
      birak: () => {
        dugum.disconnect();
        try { a.disconnect(baglam!.destination); } catch { /* zaten ayrık */ }
      },
    };
  } catch {
    // Ölçüm kurulamazsa ses yine çalar; yalnızca küre tepki vermez.
  }
}

/** Android: tanıma olayı geldiğinde kısa bir enerji darbesi. */
export function darbeVer(guc = 0.55) {
  darbe = Math.max(darbe, guc);
  darbeZamani = performance.now();
}

/** 0..1 arası anlık seviye. Her karede bir kez çağrılır. */
export function seviye(): number {
  let olcum = 0;
  if (kaynak && analiz && tampon) {
    analiz.getByteTimeDomainData(tampon);
    let toplam = 0;
    for (let i = 0; i < tampon.length; i++) {
      const v = (tampon[i] - 128) / 128;
      toplam += v * v;
    }
    const rms = Math.sqrt(toplam / tampon.length);
    // Konuşma RMS'i nadiren 0.3'ü geçer; algısal olarak yayılması için kök.
    olcum = Math.min(1, Math.sqrt(rms * 3.2));
  }
  if (darbe > 0) {
    const gecen = (performance.now() - darbeZamani) / 1000;
    const kalan = darbe * Math.exp(-gecen * 3.5);
    if (kalan < 0.01) darbe = 0;
    olcum = Math.max(olcum, kalan);
  }
  return olcum;
}
