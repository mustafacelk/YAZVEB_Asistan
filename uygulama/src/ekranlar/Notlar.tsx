import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import Dogrulama, { BolumOnerileri } from "../kimlik/Dogrulama";
import { odul, OdulHatasi, type Sponsor } from "../veri/odul";
import { useGezinme } from "../veri/gezinme";
import SikayetPenceresi from "../pano/SikayetPenceresi";
import { pano, type BenimNotum, type NotFiltresi, type NotListesi, type Notlarim,
         type NotOzeti, type Sponsorlu } from "../veri/pano";
import {
  akisKur, boyutEtiketi, donemEtiketi, dosyaTuru, kunyeHatasi, puanOzeti, simdikiDonem, sinavMetni, sinifAdi,
  SINIFLAR, turAdi, TURLER, YARIYILLAR, type Kunye, type NotTuru, type Sinif,
} from "../veri/pano_bicim";
import { SponsorDetay } from "../odul/SponsorKarti";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Notlar — bölüm bölüm ders notu, çıkmış soru çözümü, özet.
 *
 * Herkes notun VAR olduğunu görür (künye, kaç kişinin işine yaradığı);
 * dosyayı açmak ve paylaşmak üniversite e-postasıyla doğrulama ister.
 * Sponsorlu kart kademesine göre öne çıkar ama en fazla her beş kartta
 * bir; organik notu listeden itmez. Öğrenci notu parayla öne çıkamaz.
 */
export default function Notlar() {
  const { git } = useGezinme();
  const [bolum, setBolum] = useState<"kesfet" | "benim">("kesfet");
  const [filtre, setFiltre] = useState<NotFiltresi>({ kurum: "benim", sira: "yeni" });
  const [siraSecildi, setSiraSecildi] = useState(false);
  const [ara, setAra] = useState("");
  const [veri, setVeri] = useState<NotListesi | null>(null);
  const [ekler, setEkler] = useState<NotOzeti[]>([]);
  const [sayfa, setSayfa] = useState(0);
  const [hata, setHata] = useState<string | null>(null);
  const [secili, setSecili] = useState<NotOzeti | null>(null);
  const [paylas, setPaylas] = useState(false);
  const [dogrulama, setDogrulama] = useState<string | null>(null);
  const [sponsorDetay, setSponsorDetay] = useState<Sponsor | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const istekNo = useRef(0);

  const yukle = useCallback(async (f: NotFiltresi) => {
    const no = ++istekNo.current;
    setHata(null);
    try {
      const v = await pano.notlar({ ...f, sayfa: 0 });
      if (no !== istekNo.current) return;
      // Doğrulanmamış üyenin "üniversitem"i yok: tüm üniversiteler gösterilir.
      if (f.kurum === "benim" && !v.ben.dogrulandi) {
        setFiltre((x) => ({ ...x, kurum: "tum" }));
        return;
      }
      // Sınav döneminde, kullanıcı sırayı kendisi seçmediyse en faydalılar üstte.
      if (v.sinav && !siraSecildi && f.sira !== "faydali") {
        setFiltre((x) => ({ ...x, sira: "faydali" }));
        return;
      }
      setVeri(v);
      setEkler([]);
      setSayfa(0);
    } catch (h) {
      if (no !== istekNo.current) return;
      setHata(h instanceof OdulHatasi ? h.message : "Notlar alınamadı.");
    }
  }, [siraSecildi]);

  useEffect(() => { yukle(filtre); }, [filtre, yukle]);

  // Arama yazarken her tuşta değil, durunca.
  useEffect(() => {
    const t = setTimeout(() => setFiltre((f) => (f.ara ?? "") === ara.trim() ? f : { ...f, ara: ara.trim() || undefined }), 350);
    return () => clearTimeout(t);
  }, [ara]);

  async function dahaFazla() {
    if (!veri) return;
    const s = sayfa + 1;
    try {
      const v = await pano.notlar({ ...filtre, sayfa: s });
      setEkler((e) => [...e, ...v.liste]);
      setVeri((x) => (x ? { ...x, daha: v.daha } : x));
      setSayfa(s);
    } catch { /* bir sonraki dokunuşta tekrar */ }
  }

  const notlar = useMemo(() => [...(veri?.liste ?? []), ...ekler], [veri, ekler]);
  const akis = useMemo(() => akisKur(notlar, veri?.sponsorlu ?? []), [notlar, veri]);
  const dogrulandi = !!veri?.ben.dogrulandi;

  function notGuncelle(n: NotOzeti) {
    setVeri((v) => (v ? { ...v, liste: v.liste.map((x) => (x.id === n.id ? n : x)) } : v));
    setEkler((e) => e.map((x) => (x.id === n.id ? n : x)));
    setSecili((s) => (s && s.id === n.id ? n : s));
  }

  async function sponsorluAc(s: Sponsorlu) {
    pano.sponsorluTikla(s.id);
    if (s.sponsor_id) {
      const d = await odul.sponsorDetay(s.sponsor_id).catch(() => null);
      if (d) { setSponsorDetay(d); return; }
    }
    if (s.baglanti) window.open(s.baglanti, "_blank", "noopener,noreferrer");
  }

  function paylasBaslat() {
    if (!dogrulandi) { setDogrulama("Not paylaşmak için öğrenciliğini doğrula. Bir kez yeter."); return; }
    setPaylas(true);
  }

  return (
    <div className="sayfa notlar">
      <div className="sutun">
        <header className="sayfa-basi">
          <div>
            <span className="etiket gir">{veri?.kurum_adi ?? "Tüm üniversiteler"}</span>
            <h1 className="gir" style={kademe(1)}>Notlar</h1>
            <p className="sayfa-aciklama gir" style={kademe(2)}>Ders notu, çıkmış soru çözümü, özet. Öğrenciden öğrenciye.</p>
          </div>
          <button className="dugme birincil gir notlar-paylas" style={kademe(2)} onClick={paylasBaslat}>
            <Simge ad="arti" boyut={16} /> Paylaş
          </button>
        </header>

        {veri?.sinav && (
          <div className="sinav-seridi gir" style={kademe(2)} data-asama={veri.sinav.asama} role="status">
            <Simge ad="saat" boyut={18} />
            <div>
              <b>{sinavMetni(veri.sinav)}</b>
              <span>{veri.sinav.asama === "suruyor" ? "En faydalı notlar üstte. Başarılar!" :
                `Şimdi paylaşılan notlar ×${Number(veri.ayar.sinav_carpani).toLocaleString("tr-TR")} puan alır.`}</span>
            </div>
          </div>
        )}

        {veri && !dogrulandi && (
          <button className="ana-satir dogrulama-cagrisi gir" style={kademe(3)}
                  onClick={() => setDogrulama("Notları açmak ve paylaşmak için öğrenciliğini doğrula.")}>
            <span className="ana-satir-ikon"><Simge ad="kalkan" boyut={20} /></span>
            <span className="ana-satir-govde">
              <b>{veri.ben.suresi_doldu ? "Doğrulamanı yenile" : "Öğrenciliğini doğrula"}</b>
              <span className="soluk">Notları görebilirsin; açmak ve paylaşmak için üniversite e-postanla bir kez doğrula.</span>
            </span>
            <Simge ad="ileri" boyut={16} />
          </button>
        )}

        <div className="secici bolum-secici gir" role="tablist" aria-label="Notlar bölümleri"
             style={{ ...kademe(3), ["--secim" as string]: bolum === "kesfet" ? 0 : 1, ["--adet" as string]: 2 }}>
          <span className="secici-gosterge" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={bolum === "kesfet"} onClick={() => setBolum("kesfet")}>Keşfet</button>
          <button type="button" role="tab" aria-selected={bolum === "benim"} onClick={() => setBolum("benim")}>Notlarım</button>
        </div>

        {bildirim && (
          <p className="bildirim bilgi gir" role="status">
            {bildirim}{" "}
            <button className="metin-dugme baglanti satir-ici" onClick={() => setBildirim(null)}>Tamam</button>
          </p>
        )}

        {bolum === "kesfet" ? (
          <>
            <div className="notlar-filtre gir" style={kademe(4)}>
              <label className="notlar-arama">
                <Simge ad="liste" boyut={16} />
                <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ders, kod ya da hoca ara"
                       aria-label="Notlarda ara" maxLength={60} enterKeyHint="search" />
              </label>
              <div className="cipler" role="group" aria-label="Kapsam">
                {dogrulandi && (
                  <Cip secili={filtre.kurum === "benim"} onClick={() => setFiltre((f) => ({ ...f, kurum: "benim" }))}>
                    Üniversitem
                  </Cip>
                )}
                <Cip secili={filtre.kurum === "tum"} onClick={() => setFiltre((f) => ({ ...f, kurum: "tum" }))}>Tüm üniversiteler</Cip>
                <span className="cip-ayrac" aria-hidden="true" />
                <Cip secili={!filtre.tur} onClick={() => setFiltre((f) => ({ ...f, tur: "" }))}>Tümü</Cip>
                {TURLER.map((t) => (
                  <Cip key={t.deger} secili={filtre.tur === t.deger} onClick={() => setFiltre((f) => ({ ...f, tur: t.deger }))}>
                    {t.kisa}
                  </Cip>
                ))}
              </div>
              <div className="cipler" role="group" aria-label="Bölüm">
                {veri?.ben.bolum && (
                  <Cip secili={filtre.bolum === veri.ben.bolum}
                       onClick={() => setFiltre((f) => ({ ...f, bolum: f.bolum === veri.ben.bolum ? undefined : veri.ben.bolum ?? undefined }))}>
                    Bölümüm
                  </Cip>
                )}
                {(veri?.bolumler ?? []).filter((b) => b !== veri?.ben.bolum).slice(0, 8).map((b) => (
                  <Cip key={b} secili={filtre.bolum === b} onClick={() => setFiltre((f) => ({ ...f, bolum: f.bolum === b ? undefined : b }))}>{b}</Cip>
                ))}
              </div>
              <div className="notlar-alt-filtre">
                <select className="girdi" value={filtre.sinif ?? ""} aria-label="Sınıf"
                        onChange={(e) => setFiltre((f) => ({ ...f, sinif: e.target.value as Sinif | "" }))}>
                  <option value="">Tüm sınıflar</option>
                  {SINIFLAR.map((s) => <option key={s.deger} value={s.deger}>{s.ad}</option>)}
                </select>
                <select className="girdi" value={filtre.sira} aria-label="Sıralama"
                        onChange={(e) => { setSiraSecildi(true); setFiltre((f) => ({ ...f, sira: e.target.value as "yeni" | "faydali" })); }}>
                  <option value="yeni">En yeni</option>
                  <option value="faydali">En faydalı</option>
                </select>
              </div>
            </div>

            {hata && <p className="bildirim" role="alert">{hata}</p>}

            {veri === null && !hata ? (
              <div className="yigin" aria-label="Yükleniyor">
                {[80, 60, 72].map((g, i) => <div key={i} className="iskelet not-iskelet" style={{ width: g + "%" }} />)}
              </div>
            ) : veri && (
              <>
                <ul className="not-listesi">
                  {akis.map((o, i) => (
                    <li key={o.tur === "not" ? o.not.id : "s" + o.sponsorlu.id} className="gir" style={kademe(Math.min(i + 5, 12))}>
                      {o.tur === "not"
                        ? <NotKarti not={o.not} kurumGoster={filtre.kurum === "tum"} onAc={() => setSecili(o.not)} />
                        : <SponsorluKart s={o.sponsorlu} onAc={() => sponsorluAc(o.sponsorlu)} />}
                    </li>
                  ))}
                </ul>
                {notlar.length === 0 && (
                  <div className="notlar-bos">
                    <Simge ad="kitap" boyut={28} />
                    <b>{filtre.ara || filtre.bolum || filtre.tur || filtre.sinif ? "Bu filtreye uyan not yok." : "Henüz not paylaşılmamış."}</b>
                    <span className="soluk">İlk notu sen paylaş: onaylanınca +{veri.ayar.taban_xp} XP, her “işime yaradı” +{veri.ayar.oy_xp} XP.</span>
                    <button className="dugme cizgili" onClick={paylasBaslat}><Simge ad="arti" boyut={16} /> Not paylaş</button>
                  </div>
                )}
                {veri.daha && <button className="dugme cizgili genis" onClick={dahaFazla}>Daha fazla</button>}
              </>
            )}
          </>
        ) : (
          <NotlarimBolumu onAc={setSecili} onPaylas={paylasBaslat} />
        )}
      </div>

      {secili && (
        <NotDetayi not={secili} dogrulandi={dogrulandi} onKapat={() => setSecili(null)} onGuncelle={notGuncelle}
                   onDogrula={() => setDogrulama("Notu açmak için öğrenciliğini doğrula. Bir kez yeter.")}
                   onSilindi={() => { setSecili(null); setBildirim("Not kaldırıldı."); yukle(filtre); }} />
      )}
      {paylas && veri && (
        <PaylasPenceresi ayar={veri.ayar} sinavOncesi={!!veri.sinav} varsayilan={{ bolum: veri.ben.bolum ?? "", sinif: veri.ben.sinif ?? "" }}
          onKapat={() => setPaylas(false)}
          onPaylasildi={(m) => { setPaylas(false); setBildirim(m); setBolum("benim"); yukle(filtre); }}
          onDogrula={() => { setPaylas(false); setDogrulama("Paylaşmak için öğrenciliğini doğrula."); }} />
      )}
      {dogrulama && (
        <Dogrulama neden={dogrulama} onKapat={() => { setDogrulama(null); yukle(filtre); }}
                   onDogrulandi={() => setFiltre((f) => ({ ...f, kurum: "benim" }))} />
      )}
      {sponsorDetay && (
        <SponsorDetay sponsor={sponsorDetay} onKapat={() => setSponsorDetay(null)}
                      onTara={() => { setSponsorDetay(null); git("odul", { bolum: "sponsorlar" }); }} />
      )}
    </div>
  );
}

function Cip({ secili, onClick, children }: { secili: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="cip" aria-pressed={secili} onClick={onClick}>{children}</button>;
}

function NotKarti({ not: n, kurumGoster, onAc }: { not: NotOzeti; kurumGoster: boolean; onAc: () => void }) {
  return (
    <button className="not-karti" onClick={onAc} data-tur={n.tur}>
      <span className="not-karti-ust">
        <span className="not-tur">{turAdi(n.tur)}</span>
        <span className="not-donem rakam">{donemEtiketi(n.yil, n.yariyil)}</span>
      </span>
      <b className="not-baslik">{n.baslik}</b>
      <span className="not-ders">{n.ders_kodu ? <span className="rakam">{n.ders_kodu} · </span> : null}{n.ders_adi}</span>
      <span className="not-meta">
        <span>{n.bolum} · {sinifAdi(n.sinif)}</span>
        {kurumGoster && <span>{n.universite}</span>}
      </span>
      <span className="not-alt">
        <span className="not-yazar">{n.yazar ? "@" + n.yazar : "Gizli üye"}{n.benim ? " · sen" : ""}</span>
        <span className="not-sayilar rakam">
          <span title="İşime yaradı" aria-label={`${n.yararli} kişinin işine yaradı`}><Simge ad="yildiz" boyut={13} /> {n.yararli}</span>
          <span className="not-dosya">{n.dosya_turu.toUpperCase()}{n.boyut ? " · " + boyutEtiketi(n.boyut) : ""}</span>
        </span>
      </span>
    </button>
  );
}

const KADEME_ADI = { altin: "Altın sponsor", gumus: "Gümüş sponsor", bronz: "Sponsor" } as const;

function SponsorluKart({ s, onAc }: { s: Sponsorlu; onAc: () => void }) {
  return (
    <button className="sponsorlu-kart" data-kademe={s.kademe} onClick={onAc}>
      <span className="sponsorlu-ust">
        <span className="sponsorlu-etiket">Sponsorlu · {KADEME_ADI[s.kademe]}</span>
        {s.baglam === "sinav_donemi" && <span className="sponsorlu-baglam">Sınav dönemi</span>}
      </span>
      <span className="sponsorlu-govde">
        {s.logo
          ? <img className="sponsorlu-logo" src={s.logo} alt="" width={44} height={44} />
          : <span className="sponsorlu-logo harf" aria-hidden="true">{(s.sponsor ?? s.baslik).slice(0, 1).toLocaleUpperCase("tr")}</span>}
        <span className="sponsorlu-metin">
          <b>{s.baslik}</b>
          {s.metin && <span>{s.metin}</span>}
          {s.sponsor && <small>{s.sponsor}</small>}
        </span>
        <Simge ad="ileri" boyut={16} />
      </span>
    </button>
  );
}

function NotDetayi({ not: n, dogrulandi, onKapat, onGuncelle, onDogrula, onSilindi }: {
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

function PaylasPenceresi({ ayar, sinavOncesi, varsayilan, onKapat, onPaylasildi, onDogrula }: {
  ayar: NotListesi["ayar"];
  sinavOncesi: boolean;
  varsayilan: { bolum: string; sinif: Sinif | "" };
  onKapat: () => void;
  onPaylasildi: (mesaj: string) => void;
  onDogrula: () => void;
}) {
  const donem = simdikiDonem();
  const [k, setK] = useState<Kunye>({
    baslik: "", ders_adi: "", ders_kodu: "", bolum: varsayilan.bolum, sinif: varsayilan.sinif,
    tur: "ders_notu", yil: donem.yil, yariyil: donem.yariyil, hoca: "", aciklama: "",
  });
  const [dosya, setDosya] = useState<File | null>(null);
  const [onay, setOnay] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [islemde, setIslemde] = useState(false);
  const yaz = <A extends keyof Kunye>(a: A, v: Kunye[A]) => setK((x) => ({ ...x, [a]: v }));
  const yillar = [donem.yil, donem.yil - 1, donem.yil - 2, donem.yil - 3, donem.yil - 4];

  const turu = dosya ? dosyaTuru(dosya.name, dosya.type) : null;

  async function gonder() {
    setHata(null);
    if (!dosya) { setHata("Bir dosya seç (PDF ya da fotoğraf)."); return; }
    if (!turu) { setHata("Yalnızca PDF, JPG, PNG ya da WEBP."); return; }
    if (dosya.size > ayar.azami_bayt) { setHata(`Dosya en fazla ${Math.round(ayar.azami_bayt / 1048576)} MB olabilir.`); return; }
    const h = kunyeHatasi(k);
    if (h) { setHata(h); return; }
    if (!onay) { setHata("Notun sana ait olduğunu onayla."); return; }
    setIslemde(true);
    try {
      const r = await pano.paylas(k, dosya, turu);
      if (r.durum === "tamam") {
        const taban = Math.round(ayar.taban_xp * (r.sinav_oncesi ? Number(ayar.sinav_carpani) : 1));
        onPaylasildi(`Notun yayında. ${ayar.onay_saat} saat içinde şikayet gelmezse +${taban} XP kazanacaksın.`);
      } else if (r.durum === "dogrulama_gerekli") {
        onDogrula();
      } else {
        setHata(r.mesaj);
      }
    } catch (e) {
      setHata(e instanceof OdulHatasi ? e.message : "Paylaşılamadı.");
    } finally {
      setIslemde(false);
    }
  }

  return createPortal(
    <div className="katman" onClick={islemde ? undefined : onKapat}>
      <div className="pencere paylas-penceresi" role="dialog" aria-modal="true" aria-labelledby="paylas-baslik" onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <h2 id="paylas-baslik">Not paylaş</h2>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat" disabled={islemde}><Simge ad="kapat" /></button>
        </div>
        <form className="yigin" onSubmit={(e) => { e.preventDefault(); gonder(); }}>
          <label className="dosya-sec" data-secili={!!dosya}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                   onChange={(e) => setDosya(e.target.files?.[0] ?? null)} />
            <Simge ad={dosya ? "tik" : "arti"} boyut={20} />
            <span>
              <b>{dosya ? dosya.name : "Dosya seç"}</b>
              <small className="soluk">{dosya ? `${boyutEtiketi(dosya.size)}${turu ? "" : " · desteklenmeyen tür"}` :
                `PDF ya da fotoğraf, en fazla ${Math.round(ayar.azami_bayt / 1048576)} MB`}</small>
            </span>
          </label>

          <div className="secici" role="tablist" aria-label="Not türü"
               style={{ ["--secim" as string]: TURLER.findIndex((t) => t.deger === k.tur), ["--adet" as string]: TURLER.length }}>
            <span className="secici-gosterge" aria-hidden="true" />
            {TURLER.map((t) => (
              <button key={t.deger} type="button" role="tab" aria-selected={k.tur === t.deger}
                      onClick={() => yaz("tur", t.deger as NotTuru)}>{t.kisa}</button>
            ))}
          </div>

          <label className="alan">
            <span className="etiket">Başlık</span>
            <input className="girdi" value={k.baslik} maxLength={120} onChange={(e) => yaz("baslik", e.target.value)}
                   placeholder={k.tur === "cikmis_cozum" ? "2025 vize soruları ve çözümleri" : "1-5. hafta ders notları"} />
          </label>
          <div className="alan-ikili">
            <label className="alan">
              <span className="etiket">Ders adı</span>
              <input className="girdi" value={k.ders_adi} maxLength={100} onChange={(e) => yaz("ders_adi", e.target.value)} placeholder="Veri Yapıları" />
            </label>
            <label className="alan">
              <span className="etiket">Ders kodu <i>(varsa)</i></span>
              <input className="girdi" value={k.ders_kodu} maxLength={20} autoCapitalize="characters"
                     onChange={(e) => yaz("ders_kodu", e.target.value)} placeholder="BM 203" />
            </label>
          </div>
          <div className="alan-ikili">
            <label className="alan">
              <span className="etiket">Bölüm</span>
              <input className="girdi" list="bolum-onerileri" value={k.bolum} maxLength={80} onChange={(e) => yaz("bolum", e.target.value)} />
            </label>
            <label className="alan">
              <span className="etiket">Sınıf</span>
              <select className="girdi buyuk-secim" value={k.sinif} onChange={(e) => yaz("sinif", e.target.value as Sinif | "")}>
                <option value="">Seç</option>
                {SINIFLAR.map((s) => <option key={s.deger} value={s.deger}>{s.ad}</option>)}
              </select>
            </label>
          </div>
          <BolumOnerileri />
          <div className="alan-ikili">
            <label className="alan">
              <span className="etiket">Dönem</span>
              <select className="girdi buyuk-secim" value={`${k.yil}-${k.yariyil}`}
                      onChange={(e) => { const [y, d] = e.target.value.split("-"); setK((x) => ({ ...x, yil: Number(y), yariyil: d as Kunye["yariyil"] })); }}>
                {yillar.flatMap((y) => YARIYILLAR.map((d) => (
                  <option key={`${y}-${d.deger}`} value={`${y}-${d.deger}`}>{donemEtiketi(y, d.deger)}</option>
                )))}
              </select>
            </label>
            <label className="alan">
              <span className="etiket">Hoca <i>(isteğe bağlı)</i></span>
              <input className="girdi" value={k.hoca} maxLength={80} onChange={(e) => yaz("hoca", e.target.value)} />
            </label>
          </div>
          <label className="alan">
            <span className="etiket">Açıklama <i>(isteğe bağlı)</i></span>
            <textarea className="girdi" rows={2} maxLength={500} value={k.aciklama} onChange={(e) => yaz("aciklama", e.target.value)}
                      placeholder="Hangi konuları kapsıyor, el yazısı mı, eksik var mı?" />
          </label>

          <label className="onay-kutusu">
            <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} />
            <span>Bu not bana ait. Hocanın slaytı, kitap sayfası ya da başkasının notu değil.</span>
          </label>
          <p className="soluk puan-ozeti">{puanOzeti(ayar, sinavOncesi)}</p>

          {hata && <p className="bildirim" role="alert">{hata}</p>}
          <button type="submit" className="dugme birincil genis" disabled={islemde}>
            {islemde ? "Yükleniyor…" : "Paylaş"}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function NotlarimBolumu({ onAc, onPaylas }: { onAc: (n: NotOzeti) => void; onPaylas: () => void }) {
  const [veri, setVeri] = useState<Notlarim | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    pano.notlarim().then(setVeri).catch((h) => setHata(h instanceof OdulHatasi ? h.message : "Notların alınamadı."));
  }, []);

  if (hata) return <p className="bildirim" role="alert">{hata}</p>;
  if (!veri) return <div className="iskelet not-iskelet" style={{ width: "70%" }} aria-label="Yükleniyor" />;

  const oran = veri.hafta.tavan > 0 ? Math.min(1, veri.hafta.kazanilan / veri.hafta.tavan) : 0;
  return (
    <div className="yigin">
      <div className="notlarim-ozet gir">
        <div>
          <span className="etiket">Bu hafta notlardan</span>
          <b className="rakam">{veri.hafta.kazanilan} <small>/ {veri.hafta.tavan} XP</small></b>
        </div>
        <div>
          <span className="etiket">Toplam</span>
          <b className="rakam">{veri.toplam} <small>XP</small></b>
        </div>
        <span className="ilerleme-cubugu" style={{ ["--oran" as string]: oran }} role="progressbar"
              aria-label="Haftalık not puanı" aria-valuemin={0} aria-valuemax={veri.hafta.tavan} aria-valuenow={veri.hafta.kazanilan}><i /></span>
      </div>
      {veri.liste.length === 0 ? (
        <div className="notlar-bos">
          <Simge ad="kalem" boyut={28} />
          <b>Henüz not paylaşmadın.</b>
          <span className="soluk">Puanın çoğu, notun başkasının işine yaradıkça gelir.</span>
          <button className="dugme cizgili" onClick={onPaylas}><Simge ad="arti" boyut={16} /> Not paylaş</button>
        </div>
      ) : (
        <ul className="not-listesi">
          {veri.liste.map((n, i) => (
            <li key={n.id} className="gir" style={kademe(Math.min(i + 1, 10))}>
              <button className="not-karti" onClick={() => onAc(n)}>
                <span className="not-karti-ust">
                  <span className="not-tur">{turAdi(n.tur)}</span>
                  <NotDurumu n={n} />
                </span>
                <b className="not-baslik">{n.baslik}</b>
                <span className="not-ders">{n.ders_adi}</span>
                <span className="not-alt">
                  <span className="not-sayilar rakam">
                    <span><Simge ad="yildiz" boyut={13} /> {n.yararli}</span>
                    <span>{n.acilma} açılma</span>
                  </span>
                  <span className="not-xp rakam">{n.xp > 0 ? `+${n.xp} XP` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotDurumu({ n }: { n: BenimNotum }) {
  if (n.durum === "gizli") return <span className="not-durum uyari">İncelemede</span>;
  if (!n.onaylandi) {
    const kalan = n.onay_zamani ? Math.max(0, new Date(n.onay_zamani).getTime() - Date.now()) : 0;
    const saat = Math.ceil(kalan / 3_600_000);
    return <span className="not-durum">{n.sikayet ? "Şikayet inceleniyor" : saat > 0 ? `Onaya ${saat} sa` : "Onaylanıyor"}</span>;
  }
  return <span className="not-durum onayli">Onaylandı{n.sinav_oncesi ? " · sınav öncesi" : ""}</span>;
}
