import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * QR çizimi: SVG yolu olarak üretilir (HTML enjeksiyonu yok, CSP dostu,
 * her çözünürlükte keskin, yazdırmaya hazır).
 */
export function QrSvg({ icerik, boyut = 280 }: { icerik: string; boyut?: number }) {
  const { yol, adet } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(icerik);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
    }
    return { yol: d, adet: n + 8 };   // 4 modül sessiz alan
  }, [icerik]);

  return (
    <svg className="qr-svg" viewBox={`0 0 ${adet} ${adet}`} width={boyut} height={boyut}
         shapeRendering="crispEdges" role="img" aria-label="QR kodu">
      <rect width={adet} height={adet} fill="#fff" />
      <path d={yol} fill="#000" />
    </svg>
  );
}
