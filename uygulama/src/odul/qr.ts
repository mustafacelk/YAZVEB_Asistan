// ═══════════════════════════════════════════════════════════════════
// QR çözme — kamera karesinden metin
// ═══════════════════════════════════════════════════════════════════
// İki yol:
//   1. BarcodeDetector (Android Chrome, Capacitor WebView): tarayıcının
//      yerleşik, donanım hızlandırmalı çözücüsü. Ek kod indirilmez.
//   2. jsQR: yerleşik çözücü yoksa (masaüstü Chrome/Firefox, iOS Safari)
//      ilk kullanımda yüklenir. Uygulamanın açılışına yük bindirmez.
//
// Görüntü hiçbir yere gönderilmez; kare cihazda çözülür, yalnızca QR'nin
// içindeki metin sunucuya gider.
// ═══════════════════════════════════════════════════════════════════

type Cozucu = (video: HTMLVideoElement) => Promise<string | null>;

type YerlesikDedektor = { detect: (kaynak: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DedektorSinifi = {
  new (secenek: { formats: string[] }): YerlesikDedektor;
  getSupportedFormats?: () => Promise<string[]>;
};

/** Karenin ortasındaki kare bölgeyi okur: QR'yi çerçeveye getiren kullanıcı için yeterli, çok daha hızlı. */
const EN_FAZLA_KENAR = 640;

export async function cozucuKur(): Promise<Cozucu> {
  const Dedektor = (globalThis as unknown as { BarcodeDetector?: DedektorSinifi }).BarcodeDetector;
  if (Dedektor) {
    try {
      const bicimler = (await Dedektor.getSupportedFormats?.()) ?? ["qr_code"];
      if (bicimler.includes("qr_code")) {
        const d = new Dedektor({ formats: ["qr_code"] });
        return async (video) => {
          if (video.readyState < 2) return null;
          const sonuc = await d.detect(video);
          return sonuc[0]?.rawValue ?? null;
        };
      }
    } catch {
      /* yerleşik çözücü kullanılamıyor, jsQR'a düş */
    }
  }

  const { default: jsQR } = await import("jsqr");
  const tuval = document.createElement("canvas");
  const baglam = tuval.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!baglam || video.readyState < 2 || !video.videoWidth) return null;
    const kenar = Math.min(video.videoWidth, video.videoHeight);
    const hedef = Math.min(kenar, EN_FAZLA_KENAR);
    tuval.width = hedef;
    tuval.height = hedef;
    baglam.drawImage(
      video,
      (video.videoWidth - kenar) / 2, (video.videoHeight - kenar) / 2, kenar, kenar,
      0, 0, hedef, hedef,
    );
    const veri = baglam.getImageData(0, 0, hedef, hedef);
    return jsQR(veri.data, hedef, hedef, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

/**
 * QR içeriği YAZVEB'e mi ait? Sokaktaki rastgele bir QR (menü, afiş) sunucuya
 * gönderilmez: hem anlamsız istek olur hem de kullanıcının "hatalı deneme"
 * hakkını boşa yer. Asıl doğrulama yine sunucuda.
 */
export function yazvebKoduMu(metin: string): "gorev" | "sponsor" | null {
  const m = metin.trim().toUpperCase();
  if (/^YAZVEB:G:[A-Z0-9_-]{32}$/.test(m)) return "gorev";
  if (/^YAZVEB:S:[A-Z0-9_-]{32}$/.test(m)) return "sponsor";
  return null;
}

/** Kısa kod girişini sadeleştirir: "yaz-25 " → "YAZ25". */
export function kisaKodSadelestir(girdi: string): string {
  return girdi.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}
