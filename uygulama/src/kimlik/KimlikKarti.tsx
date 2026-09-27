import { useEffect, useState } from "react";
import Simge from "../tasarim/Simge";
import Dogrulama, { BolumOnerileri } from "./Dogrulama";
import { kimlik, type KimlikDurumu } from "../veri/kimlik";
import { OdulHatasi } from "../veri/odul";
import { SINIFLAR, sinifAdi, type Sinif } from "../veri/pano_bicim";

/**
 * Hesap penceresinde öğrenci kimliği: doğrulandı mı, hangi üniversite,
 * bölüm ve sınıf (beyan). Doğrulamayı kaldırmak da buradan: kişinin
 * kendi verisi üzerinde son söz onda.
 */
export default function KimlikKarti() {
  const [d, setD] = useState<KimlikDurumu | null>(null);
  const [acik, setAcik] = useState(false);
  const [duzenle, setDuzenle] = useState(false);
  const [bolum, setBolum] = useState("");
  const [sinif, setSinif] = useState<Sinif | "">("");
  const [silOnay, setSilOnay] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = () => kimlik.durum().then((x) => { setD(x); setBolum(x.bolum ?? ""); setSinif(x.sinif ?? ""); })
    .catch(() => setD(null));
  useEffect(() => { yukle(); }, []);

  async function kaydet() {
    setHata(null);
    try {
      const x = await kimlik.bilgiKaydet(bolum.trim(), sinif);
      setD((eski) => (eski ? { ...eski, ...x } : x));
      setDuzenle(false);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Kaydedilemedi.");
    }
  }

  async function kaldir() {
    try {
      const x = await kimlik.dogrulamaSil();
      setD((eski) => (eski ? { ...eski, ...x } : x));
      setSilOnay(false);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Kaldırılamadı.");
    }
  }

  if (!d) return null;
  return (
    <div className="kimlik-karti">
      <div className="kimlik-karti-bas">
        <span className="ana-satir-ikon"><Simge ad={d.dogrulandi ? "tik" : "kalkan"} boyut={18} /></span>
        <div>
          <b>{d.dogrulandi ? d.universite : d.suresi_doldu ? "Doğrulamanın süresi doldu" : "Öğrenciliğin doğrulanmadı"}</b>
          <span className="soluk">
            {d.dogrulandi
              ? `${d.tur === "ogrenci" ? "Doğrulanmış öğrenci" : "Doğrulanmış üniversite e-postası"}${d.bolum ? ` · ${d.bolum}` : ""}${d.sinif ? ` · ${sinifAdi(d.sinif)}` : ""}`
              : "Notları açmak ve paylaşmak için üniversite e-postanla doğrula."}
          </span>
        </div>
      </div>

      {duzenle ? (
        <form className="yigin" onSubmit={(e) => { e.preventDefault(); kaydet(); }}>
          <div className="alan-ikili">
            <label className="alan">
              <span className="etiket">Bölüm</span>
              <input className="girdi" list="bolum-onerileri" value={bolum} maxLength={80} onChange={(e) => setBolum(e.target.value)} />
            </label>
            <label className="alan">
              <span className="etiket">Sınıf</span>
              <select className="girdi buyuk-secim" value={sinif} onChange={(e) => setSinif(e.target.value as Sinif | "")}>
                <option value="">Seç</option>
                {SINIFLAR.map((s) => <option key={s.deger} value={s.deger}>{s.ad}</option>)}
              </select>
            </label>
          </div>
          <BolumOnerileri />
          {hata && <p className="bildirim" role="alert">{hata}</p>}
          <div className="dugmeler">
            <button type="submit" className="dugme birincil">Kaydet</button>
            <button type="button" className="dugme" onClick={() => setDuzenle(false)}>Vazgeç</button>
          </div>
        </form>
      ) : (
        <div className="dugmeler">
          {!d.dogrulandi && (
            <button className="dugme birincil" onClick={() => setAcik(true)}>
              {d.suresi_doldu ? "Yenile" : "Doğrula"}
            </button>
          )}
          <button className="dugme cizgili" onClick={() => setDuzenle(true)}>Bölüm ve sınıf</button>
          {d.dogrulandi && !silOnay && (
            <button className="metin-dugme" onClick={() => setSilOnay(true)}>Doğrulamayı kaldır</button>
          )}
        </div>
      )}
      {silOnay && (
        <p className="sil-onay">
          Kaldırılsın mı? Notları açamazsın; paylaştıkların yerinde kalır.
          <button className="metin-dugme tehlike-metin" onClick={kaldir}>Evet, kaldır</button>
          <button className="metin-dugme" onClick={() => setSilOnay(false)}>Vazgeç</button>
        </p>
      )}
      {d.dogrulandi && d.gecerli_bitis && (
        <span className="soluk" style={{ fontSize: "var(--y-kucuk)" }}>
          {new Date(d.gecerli_bitis).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} tarihine kadar geçerli. Her yıl Ekim sonunda bir kodla yenilenir.
        </span>
      )}
      {acik && <Dogrulama onKapat={() => { setAcik(false); yukle(); }} />}
    </div>
  );
}
