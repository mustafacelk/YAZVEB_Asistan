// ═══════════════════════════════════════════════════════════════════
// Sesli soru kaydı — tarayıcının konuşma tanıması çalışmadığında
// ═══════════════════════════════════════════════════════════════════
// Tarayıcının konuşma tanıması her yerde çalışmıyor: Firefox'ta yok,
// Brave/Opera'da var görünüp sonuç döndürmüyor, bazı masaüstü kurulumlarında
// mikrofon açık olduğu hâlde sessizce hiçbir metin gelmiyor. Bu durumda
// ses kaydedilir, 16 kHz mono WAV'a çevrilir ve sunucuda yazıya dökülür
// (supabase/functions/asistan/model.ts → transkript).
// ═══════════════════════════════════════════════════════════════════

export const kayitDesteklenir =
  typeof window !== "undefined" &&
  typeof window.MediaRecorder !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

/** Sunucunun kabul ettiğinden kısa: 20 sn × 16 kHz × 2 bayt ≈ 640 KB. */
export const EN_UZUN_KAYIT_MS = 20_000;
const HEDEF_HZ = 16_000;

export class Kaydedici {
  private kaydedici: MediaRecorder | null = null;
  private parcalar: Blob[] = [];
  private bitisSozu: ((b: Blob | null) => void) | null = null;

  constructor(akis: MediaStream) {
    try {
      this.kaydedici = new MediaRecorder(akis);
      this.kaydedici.ondataavailable = (e) => { if (e.data.size) this.parcalar.push(e.data); };
      this.kaydedici.onstop = () => {
        const tur = this.kaydedici?.mimeType || this.parcalar[0]?.type || "audio/webm";
        this.bitisSozu?.(this.parcalar.length ? new Blob(this.parcalar, { type: tur }) : null);
        this.bitisSozu = null;
      };
      // Parça parça: kayıt beklenmedik biçimde kesilse de eldeki kaybolmaz.
      this.kaydedici.start(250);
    } catch {
      this.kaydedici = null;
    }
  }

  get calisiyor() { return this.kaydedici?.state === "recording"; }

  /** Kaydı bitirir ve sesi döndürür (kayıt başlayamadıysa null). */
  bitir(): Promise<Blob | null> {
    const k = this.kaydedici;
    if (!k || k.state === "inactive") {
      return Promise.resolve(this.parcalar.length ? new Blob(this.parcalar) : null);
    }
    return new Promise((coz) => {
      this.bitisSozu = coz;
      try { k.stop(); } catch { coz(null); }
    });
  }

  iptal() {
    this.bitisSozu = null;
    try { if (this.kaydedici && this.kaydedici.state !== "inactive") this.kaydedici.stop(); } catch { /* zaten durdu */ }
    this.parcalar = [];
  }
}

/**
 * Konuşma algılayıcı: seviyeyi düzenli okur; konuşma başlayıp ardından
 * yeterince sessiz kalınınca (ya da en uzun süre dolunca) haber verir.
 * Eşik ortam gürültüsüne göre uyarlanır: ilk yarım saniyenin tabanı ölçülür.
 */
export function konusmaIzle(
  seviye: () => number,
  olay: { konustu: () => void; sustu: () => void },
  ayar = { sessizlikMs: 1200, adimMs: 80, enUzunMs: EN_UZUN_KAYIT_MS },
): () => void {
  const bas = performance.now();
  let taban = 1;
  let konustu = false;
  let ustUste = 0;
  let sessizBas = 0;
  let bitti = false;

  const z = setInterval(() => {
    if (bitti) return;
    const s = seviye();
    const gecen = performance.now() - bas;
    if (gecen < 500) { taban = Math.min(taban, s); return; }
    // İlk anda zaten konuşuluyorsa taban yüksek ölçülür; eşik yine de ulaşılabilir kalsın.
    taban = Math.min(taban, 0.35);
    const esik = Math.max(0.28, taban + 0.14);
    if (s > esik) {
      ustUste++;
      sessizBas = 0;
      if (!konustu && ustUste >= 2) { konustu = true; olay.konustu(); }
    } else {
      // Sessiz anlarda taban ortama yavaşça uyar (fan, klima açılıp kapanabilir).
      taban = taban * 0.97 + s * 0.03;
      ustUste = 0;
      if (konustu) {
        sessizBas ||= performance.now();
        if (performance.now() - sessizBas >= ayar.sessizlikMs) { bitir(); olay.sustu(); }
      }
    }
    if (gecen >= ayar.enUzunMs) { bitir(); olay.sustu(); }
  }, ayar.adimMs);

  function bitir() {
    bitti = true;
    clearInterval(z);
  }
  return bitir;
}

/**
 * Kaydı 16 kHz mono 16 bit WAV'a çevirir. Tarayıcının kaydettiği biçim
 * (Chrome: webm/opus, Firefox: ogg/opus, Safari: mp4/aac) ne olursa olsun
 * sunucu tek bir biçim görür ve boyut küçülür.
 */
export async function wavaCevir(kayit: Blob, baglam: BaseAudioContext): Promise<Blob | null> {
  try {
    const tampon = await baglam.decodeAudioData(await kayit.arrayBuffer());
    const kanal = tampon.getChannelData(0);
    const oran = tampon.sampleRate / HEDEF_HZ;
    const uzunluk = Math.min(Math.floor(kanal.length / oran), HEDEF_HZ * (EN_UZUN_KAYIT_MS / 1000));
    if (uzunluk < HEDEF_HZ * 0.3) return null;   // 0,3 sn'den kısa: konuşma yok
    const pcm = new Int16Array(uzunluk);
    for (let i = 0; i < uzunluk; i++) {
      // Alt örnekleme: aralığın ortalaması (basit alçak geçiren süzgeç).
      const a = Math.floor(i * oran);
      const b = Math.min(kanal.length, Math.floor((i + 1) * oran));
      let t = 0;
      for (let j = a; j < b; j++) t += kanal[j];
      const v = Math.max(-1, Math.min(1, t / Math.max(1, b - a)));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return new Blob([wavBasligi(pcm.byteLength), pcm.buffer], { type: "audio/wav" });
  } catch {
    return null;
  }
}

function wavBasligi(veriBayt: number): ArrayBuffer {
  const b = new DataView(new ArrayBuffer(44));
  const yaz = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  yaz(0, "RIFF");
  b.setUint32(4, 36 + veriBayt, true);
  yaz(8, "WAVE");
  yaz(12, "fmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);              // PCM
  b.setUint16(22, 1, true);              // mono
  b.setUint32(24, HEDEF_HZ, true);
  b.setUint32(28, HEDEF_HZ * 2, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  yaz(36, "data");
  b.setUint32(40, veriBayt, true);
  return b.buffer;
}

/** Blob → base64 (data: öneki olmadan). */
export function base64(blob: Blob): Promise<string> {
  return new Promise((coz, reddet) => {
    const r = new FileReader();
    r.onload = () => coz(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reddet(r.error);
    r.readAsDataURL(blob);
  });
}
