import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import qrcode from "qrcode-generator";
import Simge from "../tasarim/Simge";

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

/** Tam ekran QR: etkinlikte perdeye yansıtılır ya da yazdırılır. */
export function QrPenceresi({ baslik, altBaslik, icerik, kisaKod, onKapat }: {
  baslik: string;
  altBaslik?: string;
  icerik: string;
  kisaKod: string;
  onKapat: () => void;
}) {
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    document.body.classList.add("qr-yazdiriliyor");
    return () => {
      window.removeEventListener("keydown", tus);
      document.body.classList.remove("qr-yazdiriliyor");
    };
  }, [onKapat]);

  return createPortal(
    <div className="qr-penceresi" role="dialog" aria-modal="true" aria-label={`${baslik} QR kodu`}>
      <div className="qr-penceresi-ust yazdirma-yok">
        <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        <button className="dugme cizgili" onClick={() => window.print()}><Simge ad="yazdir" boyut={16} /> Yazdır</button>
      </div>
      <div className="qr-baski">
        <p className="qr-marka"><img src="/logo-128.webp" alt="" width={36} height={36} /> YAZVEB</p>
        <h2>{baslik}</h2>
        {altBaslik && <p className="qr-alt">{altBaslik}</p>}
        <div className="qr-cerceve"><QrSvg icerik={icerik} boyut={320} /></div>
        <p className="qr-kod-etiketi">Kamera yoksa kısa kod</p>
        <p className="qr-kisa-kod rakam">{kisaKod}</p>
        <p className="qr-alt">YAZVEB uygulaması → Ödüller → QR tara</p>
      </div>
    </div>,
    document.body,
  );
}
