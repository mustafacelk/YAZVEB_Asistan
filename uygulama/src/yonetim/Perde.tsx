import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import { sayi, tarihSaat } from "../veri/odul";
import { CanliQrPenceresi, QrPenceresi } from "./QrKod";
import { yonetim, type YGorev } from "./veri";
import { gorevIsliyor } from "./oncelik";

/**
 * Yönetim görünümünde gezinme çubuğunun ortası: "Perde QR".
 *
 * Üyenin ortada QR TARAMASI var; yöneticinin etkinlikte en sık yaptığı iş
 * ise QR GÖSTERMEK. Şu an işleyen tek görev varsa QR doğrudan açılır;
 * birden çoksa kısa bir liste, hiç yoksa ne yapılacağı.
 */
export default function Perde({ onKapat, onGorevOlustur }: { onKapat: () => void; onGorevOlustur: () => void }) {
  const [gorevler, setGorevler] = useState<YGorev[] | null>(null);
  const [secili, setSecili] = useState<YGorev | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    yonetim.gorevler()
      .then((l) => {
        const simdi = Date.now();
        const isleyen = l.filter((g) => gorevIsliyor(g, simdi))
          .sort((a, b) => a.bitis.localeCompare(b.bitis));
        setGorevler(isleyen);
        if (isleyen.length === 1) setSecili(isleyen[0]);
      })
      .catch(() => setHata("Görevler alınamadı."));
  }, []);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape" && !secili) onKapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [onKapat, secili]);

  if (secili) {
    // Tek görev doğrudan açıldıysa QR kapanınca seçici de kapanır.
    const kapat = () => (gorevler && gorevler.length > 1 ? setSecili(null) : onKapat());
    return secili.dinamik
      ? <CanliQrPenceresi gorevId={secili.id} baslik={secili.baslik} altBaslik={`+${secili.puan} XP`} onKapat={kapat} />
      : <QrPenceresi baslik={secili.baslik} altBaslik={`+${secili.puan} XP`} icerik={`YAZVEB:G:${secili.token}`}
          kisaKod={secili.kisa_kod} onKapat={kapat} />;
  }

  return createPortal(
    <div className="katman" onClick={onKapat}>
      <div className="pencere" role="dialog" aria-modal="true" aria-labelledby="perde-baslik" onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <div>
            <span className="etiket">Perde QR</span>
            <h2 id="perde-baslik">Hangi görevin QR'si?</h2>
          </div>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        </div>
        {hata && <p className="bildirim" role="alert">{hata}</p>}
        {!gorevler && !hata && <div className="dogrulama-halkasi" aria-label="Yükleniyor" />}
        {gorevler?.length === 0 && (
          <div className="yigin">
            <p className="soluk">Şu an işleyen QR görevi yok. Etkinlik için bir görev oluştur; başlangıç saati gelince burada görünür.</p>
            <button className="dugme birincil genis" onClick={() => { onKapat(); onGorevOlustur(); }}>
              <Simge ad="arti" boyut={16} /> QR görevi oluştur
            </button>
          </div>
        )}
        {gorevler && gorevler.length > 1 && (
          <ul className="yonetim-liste">
            {gorevler.map((g) => (
              <li key={g.id}>
                <span className="yonetim-satir-bilgi">
                  <b>{g.baslik}</b>
                  <span className="soluk rakam">
                    +{g.puan} XP · {sayi(g.kullanim_sayisi)} okutma · {tarihSaat(g.bitis)}'e kadar{g.dinamik ? " · canlı" : ""}
                  </span>
                </span>
                <button className="dugme birincil" onClick={() => setSecili(g)}><Simge ad="qr" boyut={16} /> Aç</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
