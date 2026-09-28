import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import { QrSvg } from "../odul/QrSvg";
import { OdulHatasi } from "../veri/odul";
import { yonetim, type YCanli } from "./veri";

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
        <p className="qr-alt">{icerik.startsWith("YAZVEB:S:")
          ? "YAZVEB → Ben → Sponsorlar → işletme → QR'yi okut"
          : "YAZVEB → Etkinlikler → QR okut"}</p>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Canlı görevin perde ekranı. QR ve kısa kodun son dört harfi dakikada bir
 * değişir; ekran pencere bitince sunucudan yenisini alır.
 *
 * Yazdırma bilerek YOK: basılı canlı kod bir dakika sonra işe yaramaz.
 * Basılı QR gereken yer (stand, afiş) için görevi canlı olmadan oluştur.
 */
export function CanliQrPenceresi({ gorevId, baslik, altBaslik, onKapat }: {
  gorevId: number;
  baslik: string;
  altBaslik?: string;
  onKapat: () => void;
}) {
  const [canli, setCanli] = useState<Extract<YCanli, { dinamik: true }> | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(Date.now());
  const farkRef = useRef(0);   // sunucu saati - cihaz saati

  const yukle = useCallback(async () => {
    try {
      const c = await yonetim.gorevCanli(gorevId);
      if (!c.dinamik) { setHata("Bu görev canlı kodlu değil."); return; }
      farkRef.current = new Date(c.sunucu_zamani).getTime() - Date.now();
      setCanli(c);
      setHata(null);
    } catch (h) {
      // Perde bağlantısı bir an koparsa eski kod bir dakika daha geçerli; sessizce yeniden dene.
      setHata(h instanceof OdulHatasi ? h.message : "Canlı kod alınamadı; yeniden deneniyor.");
    }
  }, [gorevId]);

  useEffect(() => { yukle(); }, [yukle]);
  useEffect(() => {
    const z = setInterval(() => setSimdi(Date.now() + farkRef.current), 250);
    return () => clearInterval(z);
  }, []);
  // Pencere bitince (ya da hata varsa 5 saniyede bir) yeni kod.
  useEffect(() => {
    const kalan = canli ? new Date(canli.pencere_bitis).getTime() - (Date.now() + farkRef.current) : 0;
    const z = setTimeout(yukle, hata || !canli ? 5000 : Math.max(500, kalan + 300));
    return () => clearTimeout(z);
  }, [canli, hata, yukle]);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [onKapat]);

  const oran = canli ? Math.min(1, Math.max(0, (new Date(canli.pencere_bitis).getTime() - simdi) / 60000)) : 0;

  return createPortal(
    <div className="qr-penceresi" role="dialog" aria-modal="true" aria-label={`${baslik} canlı QR kodu`}>
      <div className="qr-penceresi-ust">
        <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        <span className="etiket">Canlı kod · dakikada bir değişir</span>
        <span className="tarayici-bosluk" />
      </div>
      <div className="qr-baski">
        <p className="qr-marka"><img src="/logo-128.webp" alt="" width={36} height={36} /> YAZVEB</p>
        <h2>{baslik}</h2>
        {altBaslik && <p className="qr-alt">{altBaslik}</p>}
        {canli ? (
          <>
            <div className="qr-cerceve"><QrSvg icerik={canli.qr} boyut={320} /></div>
            <div className="qr-sure" aria-hidden="true"><i style={{ transform: `scaleX(${oran})` }} /></div>
            <p className="qr-kod-etiketi">Kamera yoksa kodun tamamı</p>
            <p className="qr-kisa-kod rakam" aria-live="polite">
              <span className="qr-sabit">{canli.kisa_kod.slice(0, -4)}</span>
              <span className="qr-canli-ek">{canli.kod}</span>
            </p>
          </>
        ) : (
          <div className="dogrulama-halkasi" aria-label="Yükleniyor" />
        )}
        {hata && <p className="qr-alt" role="status">{hata}</p>}
        <p className="qr-alt">YAZVEB → Etkinlikler → QR okut</p>
      </div>
    </div>,
    document.body,
  );
}
