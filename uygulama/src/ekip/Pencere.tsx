import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";

/**
 * Ekip ekranlarının ortak penceresi. body'ye taşınır: sahne katmanı kendi
 * yığın bağlamını kuruyor, içindeki hiçbir şey gezinme çubuğunun üstüne
 * çıkamıyordu (Etkinlikler'deki pencereyle aynı gerekçe). Esc kapatır.
 */
export default function Pencere({ baslik, onKapat, children }: {
  baslik: string;
  onKapat: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [onKapat]);

  return createPortal(
    <div className="katman" onClick={onKapat}>
      <div className="pencere ekip-pencere" role="dialog" aria-modal="true" aria-label={baslik}
           onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <h2>{baslik}</h2>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
