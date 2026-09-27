import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import { OdulHatasi } from "../veri/odul";
import { gonderimMesaji, kimlik, onayMesaji, type KimlikDurumu } from "../veri/kimlik";
import { BOLUM_ONERILERI, SINIFLAR, type Sinif } from "../veri/pano_bicim";

/**
 * Öğrenci doğrulama penceresi: e-posta → kod → (bölüm, sınıf).
 *
 * Resmî bir kurum yazışması yok: üniversitenin kendi e-posta sunucusu
 * kanıttır. Adres saklanmaz; kullanıcıya bunu açıkça söylüyoruz çünkü
 * öğrenci numarası içeren bir adresi yazmak güven ister.
 */
export default function Dogrulama({ neden, onKapat, onDogrulandi }: {
  /** Neden açıldı: "Notu açmak için", "Paylaşmak için"... */
  neden?: string;
  onKapat: () => void;
  onDogrulandi?: (d: KimlikDurumu) => void;
}) {
  const [adim, setAdim] = useState<"yukleniyor" | "eposta" | "kod" | "bilgi" | "bitti">("yukleniyor");
  const [durum, setDurum] = useState<KimlikDurumu | null>(null);
  const [eposta, setEposta] = useState("");
  const [alan, setAlan] = useState("");
  const [universite, setUniversite] = useState("");
  const [kod, setKod] = useState("");
  const [bolum, setBolum] = useState("");
  const [sinif, setSinif] = useState<Sinif | "">("");
  const [hata, setHata] = useState<string | null>(null);
  const [islemde, setIslemde] = useState(false);
  const [bekleme, setBekleme] = useState(0);
  const kodRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let iptal = false;
    kimlik.durum().then((d) => {
      if (iptal) return;
      setDurum(d);
      setBolum(d.bolum ?? "");
      setSinif(d.sinif ?? "");
      if (d.bekleyen && d.bekleyen.kalan_sn > 0) {
        setAlan(d.bekleyen.eposta_alani);
        setAdim("kod");
      } else {
        setAdim("eposta");
      }
    }).catch((h) => {
      if (iptal) return;
      setHata(h instanceof OdulHatasi ? h.message : "Durum alınamadı.");
      setAdim("eposta");
    });
    return () => { iptal = true; };
  }, []);

  // Yeni kod için geri sayım.
  useEffect(() => {
    if (bekleme <= 0) return;
    const t = setTimeout(() => setBekleme((b) => b - 1), 1000);
    return () => clearTimeout(t);
  }, [bekleme]);

  useEffect(() => { if (adim === "kod") kodRef.current?.focus(); }, [adim]);

  async function kodGonder() {
    const e = eposta.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setHata("Geçerli bir e-posta adresi yaz."); return; }
    // Sık yapılan yazım hatası: üniversite kısmı düşmüş (numara@ogr.edu.tr).
    if (/@(ogr|ogrenci|std|stu|stud|student)\.edu\.tr$/.test(e)) {
      setHata(`Adreste üniversitenin adı eksik. Selçuk için: ${e.split("@")[0]}@ogr.selcuk.edu.tr`);
      return;
    }
    setIslemde(true);
    setHata(null);
    const g = await kimlik.kodGonder(e);
    setIslemde(false);
    const m = gonderimMesaji(g);
    if (m) {
      setHata(m);
      if (g.durum === "bekle") setBekleme(g.saniye ?? 60);
      return;
    }
    setAlan(e.split("@")[1]);
    setUniversite(g.universite ?? "");
    setKod("");
    setBekleme(60);
    setAdim("kod");
  }

  async function onayla() {
    if (!/^[0-9]{6}$/.test(kod)) { setHata("Kod 6 rakamdan oluşur."); return; }
    setIslemde(true);
    setHata(null);
    try {
      const o = await kimlik.kodOnayla(kod);
      const m = onayMesaji(o);
      if (m) {
        setHata(m);
        if (o.durum === "deneme" || o.durum === "sure" || o.durum === "yok") { setKod(""); setAdim("eposta"); }
        return;
      }
      const d = o as KimlikDurumu;
      setDurum(d);
      setUniversite(d.universite ?? universite);
      // Bölüm ve sınıf, notların künyesinin omurgası: yoksa şimdi sorulur.
      setAdim(d.bolum && d.sinif ? "bitti" : "bilgi");
      if (d.bolum && d.sinif) onDogrulandi?.(d);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Doğrulanamadı.");
    } finally {
      setIslemde(false);
    }
  }

  async function bilgiKaydet() {
    if (bolum.trim().length < 2 || !sinif) { setHata("Bölümünü yaz ve sınıfını seç."); return; }
    setIslemde(true);
    setHata(null);
    try {
      const d = await kimlik.bilgiKaydet(bolum.trim(), sinif);
      setDurum(d);
      setAdim("bitti");
      onDogrulandi?.(d);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Kaydedilemedi.");
    } finally {
      setIslemde(false);
    }
  }

  return createPortal(
    <div className="katman" onClick={onKapat}>
      <div className="pencere dogrulama-penceresi" role="dialog" aria-modal="true" aria-labelledby="dogrulama-baslik"
           onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <h2 id="dogrulama-baslik">{adim === "bitti" ? "Doğrulandın" : "Öğrenciliğini doğrula"}</h2>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        </div>

        {adim === "yukleniyor" && <div className="iskelet" style={{ width: "70%" }} aria-label="Yükleniyor" />}

        {adim === "eposta" && (
          <form className="yigin" onSubmit={(e) => { e.preventDefault(); kodGonder(); }}>
            {neden && <p className="dogrulama-neden">{neden}</p>}
            <p className="soluk">
              Üniversitenin sana verdiği e-postaya 6 haneli bir kod göndereceğiz. Selçuk'ta adresin
              <b> öğrenci numaran@ogr.selcuk.edu.tr</b>; diğer üniversitelerde .edu.tr ile biten öğrenci adresin.
            </p>
            {durum?.suresi_doldu && (
              <p className="bildirim bilgi">Doğrulamanın süresi doldu (her yıl Ekim sonunda yenilenir). Bir kod yeter.</p>
            )}
            <label className="alan">
              <span className="etiket">Üniversite e-postan</span>
              <input className="girdi" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
                     spellCheck={false} placeholder="numaran@ogr.selcuk.edu.tr" value={eposta}
                     onChange={(e) => setEposta(e.target.value)} maxLength={254} required />
            </label>
            <ul className="dogrulama-guvence">
              <li><Simge ad="kalkan" boyut={14} /> Adresin saklanmaz; yalnızca üniversiten ve doğrulama tarihi kalır.</li>
              <li><Simge ad="kilit" boyut={14} /> Şifreni asla sormayız. Kodu kendi posta kutunda göreceksin.</li>
            </ul>
            {hata && <p className="bildirim" role="alert">{hata}</p>}
            <button type="submit" className="dugme birincil genis" disabled={islemde || bekleme > 0}>
              {islemde ? "Gönderiliyor…" : bekleme > 0 ? `${bekleme} sn sonra tekrar` : "Kod gönder"}
            </button>
          </form>
        )}

        {adim === "kod" && (
          <form className="yigin" onSubmit={(e) => { e.preventDefault(); onayla(); }}>
            <p>
              <b>{eposta.trim().toLowerCase() || `…@${alan}`}</b> adresine kod gönderildi{universite ? ` (${universite})` : ""}. Gelen kutunda ya da
              gereksiz klasöründe <b>“YAZVEB öğrenci doğrulama kodun”</b> e-postasına bak.
            </p>
            <label className="alan">
              <span className="etiket">6 haneli kod</span>
              <input ref={kodRef} className="girdi kod-girdisi rakam" inputMode="numeric" autoComplete="one-time-code"
                     pattern="[0-9]*" maxLength={6} value={kod}
                     onChange={(e) => setKod(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-describedby="kod-sure" />
            </label>
            <p id="kod-sure" className="soluk">Kod 15 dakika geçerli, 5 deneme hakkın var.</p>
            {hata && <p className="bildirim" role="alert">{hata}</p>}
            <button type="submit" className="dugme birincil genis" disabled={islemde || kod.length !== 6}>
              {islemde ? "Doğrulanıyor…" : "Doğrula"}
            </button>
            <div className="dogrulama-alt">
              <button type="button" className="metin-dugme" onClick={() => { setAdim("eposta"); setHata(null); }}>
                Adresi değiştir
              </button>
              <button type="button" className="metin-dugme" disabled={bekleme > 0 || islemde || !eposta}
                      onClick={kodGonder}>
                {bekleme > 0 ? `Yeni kod ${bekleme} sn` : "Yeni kod gönder"}
              </button>
            </div>
          </form>
        )}

        {adim === "bilgi" && (
          <form className="yigin" onSubmit={(e) => { e.preventDefault(); bilgiKaydet(); }}>
            <p className="dogrulama-tamam"><Simge ad="tik" boyut={18} /> {durum?.universite} öğrencisi olarak doğrulandın.</p>
            <p className="soluk">Notlar bölüm ve sınıfa göre düzenlenir. Bunlar senin beyanın; istediğin zaman değiştirebilirsin.</p>
            <label className="alan">
              <span className="etiket">Bölüm</span>
              <input className="girdi" list="bolum-onerileri" value={bolum} maxLength={80}
                     onChange={(e) => setBolum(e.target.value)} placeholder="Bilgisayar Mühendisliği" />
            </label>
            <label className="alan">
              <span className="etiket">Sınıf</span>
              <select className="girdi buyuk-secim" value={sinif} onChange={(e) => setSinif(e.target.value as Sinif | "")}>
                <option value="">Seç</option>
                {SINIFLAR.map((s) => <option key={s.deger} value={s.deger}>{s.ad}</option>)}
              </select>
            </label>
            <BolumOnerileri />
            {hata && <p className="bildirim" role="alert">{hata}</p>}
            <button type="submit" className="dugme birincil genis" disabled={islemde}>Kaydet</button>
          </form>
        )}

        {adim === "bitti" && durum && (
          <div className="yigin">
            <div className="dogrulama-rozet">
              <span className="dogrulama-isaret" aria-hidden="true"><Simge ad="tik" boyut={22} /></span>
              <div>
                <b>{durum.universite}</b>
                <span className="soluk">{durum.tur === "ogrenci" ? "Doğrulanmış öğrenci" : "Doğrulanmış üniversite e-postası"}
                  {durum.bolum ? ` · ${durum.bolum}` : ""}</span>
              </div>
            </div>
            <p className="soluk">
              Artık notları açabilir, paylaşabilir ve “işime yaradı” diyebilirsin.
              {durum.gecerli_bitis ? ` Doğrulaman ${new Date(durum.gecerli_bitis).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} tarihine kadar geçerli.` : ""}
            </p>
            <button className="dugme birincil genis" onClick={onKapat}>Tamam</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Bölüm yazarken öneri listesi (serbest metin de kabul). */
export function BolumOnerileri() {
  return (
    <datalist id="bolum-onerileri">
      {BOLUM_ONERILERI.map((b) => <option key={b} value={b} />)}
    </datalist>
  );
}
