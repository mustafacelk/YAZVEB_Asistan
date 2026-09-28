import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import { OdulHatasi } from "../veri/odul";
import { pano, type NotOzeti } from "../veri/pano";
import { boyutEtiketi, donemEtiketi, sinifAdi, turAdi } from "../veri/pano_bicim";
import SikayetPenceresi from "../pano/SikayetPenceresi";

/**
 * Bir notun künyesi ve eylemleri: aç, işime yaradı, şikayet, kaldır.
 * Doğrulanmamış üye künyeyi görür; açmak için doğrulamaya yönlenir.
 */
export default function NotDetayi({ not: n, dogrulandi, onKapat, onGuncelle, onDogrula, onSilindi }: {
  not: NotOzeti;
  dogrulandi: boolean;
  onKapat: () => void;
  onGuncelle: (n: NotOzeti) => void;
  onDogrula: () => void;
  onSilindi: () => void;
}) {
  const [islemde, setIslemde] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [dosya, setDosya] = useState<{ adres: string; ad: string; turu: string } | null>(null);
  const [sikayet, setSikayet] = useState(false);
  const [silOnay, setSilOnay] = useState(false);

  // Blob adresi pencere kapanınca bırakılır.
  useEffect(() => () => { if (dosya) URL.revokeObjectURL(dosya.adres); }, [dosya]);

  async function ac() {
    if (!dogrulandi && !n.benim) { onDogrula(); return; }
    // PDF yeni sekmede açılır; açılır pencere engellenmesin diye sekme
    // dokunuş anında açılıp dosya gelince yönlendirilir.
    const sekme = n.dosya_turu === "pdf" ? window.open("", "_blank") : null;
    setIslemde("ac");
    setHata(null);
    try {
      const r = await pano.ac(n.id);
      if (r.durum !== "tamam") {
        sekme?.close();
        if (r.durum === "dogrulama_gerekli") onDogrula();
        else setHata(r.durum === "sinir" ? "Bugün çok not açtın. Yarın devam et." : "Not bulunamadı; kaldırılmış olabilir.");
        return;
      }
      setDosya({ adres: r.adres, ad: r.ad, turu: r.turu });
      if (sekme) { sekme.opener = null; sekme.location.href = r.adres; }
      if (!n.benim && !n.actim) onGuncelle({ ...n, actim: true, acilma: n.acilma + 1 });
    } catch (h) {
      sekme?.close();
      setHata(h instanceof OdulHatasi ? h.message : "Dosya açılamadı.");
    } finally {
      setIslemde(null);
    }
  }

  async function oyla() {
    setIslemde("oy");
    setHata(null);
    try {
      const r = await pano.oy(n.id, !n.oyum);
      if (r.durum === "tamam") onGuncelle({ ...n, oyum: !!r.oyum, yararli: r.yararli ?? n.yararli });
      else if (r.durum === "once_ac") setHata("Önce notu aç; işine yaradıysa sonra söyle.");
      else if (r.durum === "dogrulama_gerekli") onDogrula();
      else setHata("Oy verilemedi.");
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Oy verilemedi.");
    } finally {
      setIslemde(null);
    }
  }

  async function sil() {
    setIslemde("sil");
    try {
      if (await pano.sil(n.id)) onSilindi();
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Kaldırılamadı.");
    } finally {
      setIslemde(null);
    }
  }

  return createPortal(
    <div className="katman" onClick={onKapat}>
      <div className="pencere not-detay" role="dialog" aria-modal="true" aria-labelledby="not-detay-baslik" onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <span className="not-tur">{turAdi(n.tur)}</span>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        </div>
        <h2 id="not-detay-baslik" className="not-detay-baslik">{n.baslik}</h2>
        <dl className="not-kunye">
          <div><dt>Ders</dt><dd>{n.ders_kodu ? `${n.ders_kodu} · ` : ""}{n.ders_adi}</dd></div>
          <div><dt>Bölüm</dt><dd>{n.bolum} · {sinifAdi(n.sinif)}</dd></div>
          <div><dt>Üniversite</dt><dd>{n.universite}</dd></div>
          <div><dt>Dönem</dt><dd>{donemEtiketi(n.yil, n.yariyil)}</dd></div>
          {n.hoca && <div><dt>Hoca</dt><dd>{n.hoca}</dd></div>}
          <div><dt>Paylaşan</dt><dd>{n.yazar ? "@" + n.yazar : "Gizli üye"}</dd></div>
          <div><dt>Dosya</dt><dd className="rakam">{n.dosya_turu.toUpperCase()}{n.boyut ? " · " + boyutEtiketi(n.boyut) : ""}</dd></div>
        </dl>
        {n.aciklama && <p className="not-aciklama">{n.aciklama}</p>}
        <p className="soluk not-sayac rakam">{n.yararli} kişinin işine yaradı · {n.acilma} açılma</p>

        {hata && <p className="bildirim" role="alert">{hata}</p>}

        {dosya?.turu && dosya.turu !== "pdf" && (
          <img className="not-onizleme" src={dosya.adres} alt={n.baslik} />
        )}
        {dosya?.turu === "pdf" && (
          <p className="soluk">PDF yeni sekmede açıldı. Açılmadıysa: <a className="baglanti" href={dosya.adres} target="_blank" rel="noopener">tekrar aç</a> ya da{" "}
            <a className="baglanti" href={dosya.adres} download={`${n.baslik}.pdf`}>indir</a>.</p>
        )}

        <div className="not-eylemler">
          {!dogrulandi && !n.benim ? (
            <button className="dugme birincil genis" onClick={onDogrula}>
              <Simge ad="kilit" boyut={16} /> Açmak için doğrula
            </button>
          ) : (
            <button className="dugme birincil genis" onClick={ac} disabled={islemde === "ac"}>
              <Simge ad="kitap" boyut={16} /> {islemde === "ac" ? "Açılıyor…" : dosya ? "Tekrar aç" : "Notu aç"}
            </button>
          )}
          {!n.benim && dogrulandi && (
            <button className="dugme cizgili genis" onClick={oyla} disabled={!n.actim || islemde === "oy"} aria-pressed={n.oyum}
                    title={n.actim ? undefined : "Önce notu aç"}>
              <Simge ad={n.oyum ? "tik" : "yildiz"} boyut={16} /> {n.oyum ? "İşime yaradı ✓" : "İşime yaradı"}
            </button>
          )}
        </div>
        <div className="not-alt-eylemler">
          {!n.benim && <button className="metin-dugme" onClick={() => setSikayet(true)}>Şikayet et</button>}
          {n.benim && (silOnay ? (
            <span className="sil-onay">
              Kaldırılsın mı? Puanı da geri alınır.
              <button className="metin-dugme tehlike-metin" onClick={sil} disabled={islemde === "sil"}>Evet, kaldır</button>
              <button className="metin-dugme" onClick={() => setSilOnay(false)}>Vazgeç</button>
            </span>
          ) : (
            <button className="metin-dugme tehlike-metin" onClick={() => setSilOnay(true)}>Notu kaldır</button>
          ))}
        </div>
        {sikayet && <SikayetPenceresi tur="not" hedef={n.id} onKapat={() => setSikayet(false)} />}
      </div>
    </div>,
    document.body,
  );
}
