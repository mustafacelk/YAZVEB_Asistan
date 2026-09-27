import { useState } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import { OdulHatasi } from "../veri/odul";
import { pano, sikayetMesaji, SIKAYET_NEDENLERI, type SikayetNedeni } from "../veri/pano";

/** Şikayet: not ya da sohbet mesajı için ortak. */
export default function SikayetPenceresi({ tur, hedef, onKapat, onTamam }: {
  tur: "not" | "mesaj";
  hedef: string;
  onKapat: () => void;
  onTamam?: (gizlendi: boolean) => void;
}) {
  const [neden, setNeden] = useState<SikayetNedeni | "">("");
  const [aciklama, setAciklama] = useState("");
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [islemde, setIslemde] = useState(false);

  async function gonder() {
    if (!neden) return;
    setIslemde(true);
    try {
      const r = await pano.sikayet(tur, hedef, neden, aciklama);
      setSonuc(sikayetMesaji(r.durum));
      if (r.durum === "tamam") onTamam?.(!!r.gizlendi);
    } catch (h) {
      setSonuc(h instanceof OdulHatasi ? h.message : "Gönderilemedi.");
    } finally {
      setIslemde(false);
    }
  }

  return createPortal(
    <div className="katman ust-katman" onClick={onKapat}>
      <div className="pencere" role="dialog" aria-modal="true" aria-labelledby="sikayet-baslik" onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <h2 id="sikayet-baslik">{tur === "not" ? "Notu şikayet et" : "Mesajı şikayet et"}</h2>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        </div>
        {sonuc ? (
          <div className="yigin">
            <p>{sonuc}</p>
            <button className="dugme birincil genis" onClick={onKapat}>Tamam</button>
          </div>
        ) : (
          <form className="yigin" onSubmit={(e) => { e.preventDefault(); gonder(); }}>
            <fieldset className="secenek-listesi">
              <legend className="etiket">Sebep</legend>
              {SIKAYET_NEDENLERI.filter((x) => tur === "not" || (x.deger !== "telif" && x.deger !== "yanlis")).map((x) => (
                <label key={x.deger} className="secenek">
                  <input type="radio" name="neden" value={x.deger} checked={neden === x.deger} onChange={() => setNeden(x.deger)} />
                  <span>{x.ad}</span>
                </label>
              ))}
            </fieldset>
            <label className="alan">
              <span className="etiket">Açıklama <i>(isteğe bağlı)</i></span>
              <textarea className="girdi" rows={2} maxLength={300} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
            </label>
            <p className="soluk">Birkaç doğrulanmış öğrenci şikayet edince içerik incelemeye kadar gizlenir; kararı yönetim verir.</p>
            <button type="submit" className="dugme birincil genis" disabled={!neden || islemde}>Gönder</button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
