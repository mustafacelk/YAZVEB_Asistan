import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";

// Yönetim ekranlarının ortak parçaları (Yonetim.tsx, PanoYonetim.tsx).

export function Mesaj({ m }: { m: { tur: "hata" | "bilgi"; metin: string } | null }) {
  if (!m) return null;
  return <p className={"bildirim" + (m.tur === "bilgi" ? " bilgi" : "")} role={m.tur === "hata" ? "alert" : "status"}>{m.metin}</p>;
}

// ── Ortak form parçaları ────────────────────────────────────────────
export function Alan({ ad, not, children }: { ad: string; not?: string; children: ReactNode }) {
  return (
    <label className="alan">
      <span className="etiket">{ad}{not ? <i> ({not})</i> : null}</span>
      {children}
    </label>
  );
}

export function FormPenceresi({ baslik, onKapat, children }: { baslik: string; onKapat: () => void; children: ReactNode }) {
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onKapat(); } };
    window.addEventListener("keydown", tus, true);
    return () => window.removeEventListener("keydown", tus, true);
  }, [onKapat]);
  // Pencere body'ye taşınır: Yönetim bir sekme olarak açıldığında sahne katmanı
  // kendi yığın bağlamını kuruyor ve gezinme çubuğu formun altını (Kaydet
  // düğmesini) örtüyordu.
  return createPortal(
    <div className="katman" onClick={onKapat}>
      <div className="pencere yonetim-pencere" role="dialog" aria-modal="true" aria-label={baslik} onClick={(e) => e.stopPropagation()}>
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
