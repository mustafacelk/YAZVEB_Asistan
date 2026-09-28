import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Simge from "../tasarim/Simge";
import { AltBasi, Bolum, Bos, DunyaBasi, Satir, SatirIskeleti, Satirlar } from "../tasarim/Dunya";
import Dogrulama from "../kimlik/Dogrulama";
import { odul, OdulHatasi, type Sponsor } from "../veri/odul";
import { useGezinme, type DersAnahtari } from "../veri/gezinme";
import { pano, type DersListesi, type NotListesi, type NotOzeti, type Sponsorlu } from "../veri/pano";
import {
  boyutEtiketi, dersKimligi, dersSayimi, donemEtiketi, sinavMetni, sinifAdi, SINIFLAR, TURLER,
  type DersOzeti, type NotTuru, type Sinif,
} from "../veri/pano_bicim";
import { SponsorDetay } from "../odul/SponsorKarti";
import NotDetayi from "./NotDetayi";
import PaylasPenceresi from "./Paylas";
import Notlarim from "./Notlarim";
import SponsorluKart from "./SponsorluKart";
import { dersSabitle, sabitDersler, sabitMi } from "./derslerim";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Akademi — dersler dünyası (TASARIM.md §2).
 *
 *   Derslerim / Tüm dersler / Notlarım
 *     → Ders (kod, ad, üniversite)
 *       → Tür: ders notu · çıkmış çözümü · özet
 *         → Not (künye) → Aç · İşime yaradı
 *
 * Ders okurken oyun, sohbet, ödül ya da reklam yok. Sponsorlu içerik
 * yalnızca giriş sayfasında, ayrı ve etiketli bir bölümde.
 */
export default function Akademi({ ders }: { ders?: DersAnahtari }) {
  return ders ? <DersSayfasi ders={ders} /> : <AkademiGiris />;
}

type Sekme = "derslerim" | "tum" | "notlarim";

// ═══════════════════════════════════════════════════════════════════
// GİRİŞ: ders listesi
// ═══════════════════════════════════════════════════════════════════
function AkademiGiris() {
  const { git } = useGezinme();
  const [veri, setVeri] = useState<DersListesi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [sekme, setSekme] = useState<Sekme | null>(null);
  const [kurum, setKurum] = useState<"benim" | "tum">("benim");
  const [bolum, setBolum] = useState<string | undefined>(undefined);
  const [sinif, setSinif] = useState<Sinif | "">("");
  const [sira, setSira] = useState<"yeni" | "cok">("yeni");
  const [ara, setAra] = useState("");
  const [araGecikmeli, setAraGecikmeli] = useState("");
  const [pencere, setPencere] = useState<{ tur: "paylas" } | { tur: "dogrula"; neden: string } | { tur: "sponsor"; s: Sponsor } | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const [secili, setSecili] = useState<NotOzeti | null>(null);
  // Notlarım'ı (kaldırma, paylaşım sonrası) yeniden kurmak için.
  const [notlarimSurum, setNotlarimSurum] = useState(0);
  const istekNo = useRef(0);

  const dogrulandi = !!veri?.ben.dogrulandi;
  // Derslerim: yıldızladıkların + bölümünün ve sınıfının dersleri. Onlar
  // üniversitenden gelir; "Tüm dersler"de kapsam seçilebilir.
  const etkinKurum = sekme === "tum" ? kurum : "benim";

  const yukle = useCallback(async () => {
    const no = ++istekNo.current;
    setHata(null);
    try {
      const v = await pano.dersler({
        kurum: etkinKurum,
        bolum: sekme === "tum" ? bolum : undefined,
        sinif: sekme === "tum" ? sinif : "",
        ara: araGecikmeli || undefined,
        sira,
      });
      if (no !== istekNo.current) return;
      setVeri(v);
      // İlk açılış: doğrulanmış ve bölümünü seçmiş kişi Derslerim'de başlar.
      setSekme((s) => s ?? (v.ben.dogrulandi && v.ben.bolum ? "derslerim" : "tum"));
      if (!v.ben.dogrulandi) setKurum("tum");
    } catch (h) {
      if (no !== istekNo.current) return;
      setHata(h instanceof OdulHatasi ? h.message : "Dersler alınamadı.");
    }
  }, [etkinKurum, sekme, bolum, sinif, araGecikmeli, sira]);

  useEffect(() => { if (sekme !== "notlarim") yukle(); }, [yukle, sekme]);
  useEffect(() => {
    const t = setTimeout(() => setAraGecikmeli(ara.trim()), 300);
    return () => clearTimeout(t);
  }, [ara]);

  const derslerim = useMemo(() => {
    if (!veri) return [];
    const sabitler = new Set(sabitDersler().map(dersKimligi));
    const b = veri.ben.bolum?.toLocaleLowerCase("tr");
    return veri.dersler.filter((d) =>
      sabitler.has(dersKimligi(d))
      || (b && d.bolum.toLocaleLowerCase("tr") === b && (!veri.ben.sinif || d.sinif === veri.ben.sinif)));
  }, [veri]);

  function paylas() {
    if (!dogrulandi) { setPencere({ tur: "dogrula", neden: "Not paylaşmak için öğrenciliğini doğrula. Bir kez yeter." }); return; }
    setPencere({ tur: "paylas" });
  }

  async function sponsorluAc(s: Sponsorlu) {
    pano.sponsorluTikla(s.id);
    if (s.sponsor_id) {
      const d = await odul.sponsorDetay(s.sponsor_id).catch(() => null);
      if (d) { setPencere({ tur: "sponsor", s: d }); return; }
    }
    if (s.baglanti) window.open(s.baglanti, "_blank", "noopener,noreferrer");
  }

  const liste = sekme === "derslerim" ? derslerim : veri?.dersler ?? [];
  // Sponsorlu en fazla iki satır: kademe sırası sunucudan (altın → gümüş → bronz).
  const sponsorlu = (veri?.sponsorlu ?? []).slice(0, 2);

  return (
    <div className="sayfa akademi">
      <div className="sutun">
        <DunyaBasi
          etiket={veri?.ben.universite ?? "Akademi"}
          baslik="Dersler"
          aciklama="Ders notları, çıkmış soru çözümleri ve özetler. Öğrenciden öğrenciye."
          eylem={<button className="dugme birincil" onClick={paylas}><Simge ad="arti" boyut={16} /> Paylaş</button>}
        />

        {veri?.sinav && (
          <div className="sinav-seridi gir" style={kademe(2)} data-asama={veri.sinav.asama} role="status">
            <Simge ad="saat" boyut={18} />
            <div>
              <b>{sinavMetni(veri.sinav)}</b>
              <span>{veri.sinav.asama === "suruyor" ? "Başarılar. En faydalı notlar ders sayfalarında üstte." :
                `Şimdi paylaşılan notlar ×${Number(veri.ayar.sinav_carpani).toLocaleString("tr-TR")} puan alır.`}</span>
            </div>
          </div>
        )}

        {veri && !dogrulandi && (
          <Satirlar className="gir akademi-dogrula">
            <Satir simge="kalkan" baslik={veri.ben.suresi_doldu ? "Doğrulamanı yenile" : "Öğrenciliğini doğrula"}
                   aciklama="Notları görebilirsin; açmak ve paylaşmak için üniversite e-postanla bir kez doğrula."
                   onClick={() => setPencere({ tur: "dogrula", neden: "Notları açmak ve paylaşmak için öğrenciliğini doğrula." })} />
          </Satirlar>
        )}

        {sekme && (
          <div className="secici bolum-secici gir" role="tablist" aria-label="Akademi bölümleri"
               style={{ ...kademe(3), ["--secim" as string]: ["derslerim", "tum", "notlarim"].indexOf(sekme), ["--adet" as string]: 3 }}>
            <span className="secici-gosterge" aria-hidden="true" />
            <button type="button" role="tab" aria-selected={sekme === "derslerim"} onClick={() => setSekme("derslerim")}>Derslerim</button>
            <button type="button" role="tab" aria-selected={sekme === "tum"} onClick={() => setSekme("tum")}>Tüm dersler</button>
            <button type="button" role="tab" aria-selected={sekme === "notlarim"} onClick={() => setSekme("notlarim")}>Notlarım</button>
          </div>
        )}

        {bildirim && (
          <p className="bildirim bilgi gir" role="status">
            {bildirim}{" "}
            <button className="metin-dugme baglanti satir-ici" onClick={() => setBildirim(null)}>Tamam</button>
          </p>
        )}

        {sekme === "notlarim" ? (
          <Notlarim key={notlarimSurum} onAc={setSecili} onPaylas={paylas} />
        ) : (
          <>
            {sekme === "tum" && (
              <div className="notlar-filtre gir" style={kademe(4)}>
                <label className="notlar-arama">
                  <Simge ad="liste" boyut={16} />
                  <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ders adı, kodu ya da hoca"
                         aria-label="Derslerde ara" maxLength={60} enterKeyHint="search" />
                </label>
                <div className="cipler" role="group" aria-label="Kapsam ve bölüm">
                  {dogrulandi && <Cip secili={kurum === "benim"} onClick={() => setKurum("benim")}>Üniversitem</Cip>}
                  <Cip secili={kurum === "tum"} onClick={() => setKurum("tum")}>Tüm üniversiteler</Cip>
                  {(veri?.bolumler.length ?? 0) > 0 && <span className="cip-ayrac" aria-hidden="true" />}
                  {veri?.bolumler.slice(0, 8).map((b) => (
                    <Cip key={b} secili={bolum === b} onClick={() => setBolum((x) => (x === b ? undefined : b))}>{b}</Cip>
                  ))}
                </div>
                <div className="notlar-alt-filtre">
                  <select className="girdi" value={sinif} aria-label="Sınıf" onChange={(e) => setSinif(e.target.value as Sinif | "")}>
                    <option value="">Tüm sınıflar</option>
                    {SINIFLAR.map((s) => <option key={s.deger} value={s.deger}>{s.ad}</option>)}
                  </select>
                  <select className="girdi" value={sira} aria-label="Sıralama" onChange={(e) => setSira(e.target.value as "yeni" | "cok")}>
                    <option value="yeni">Son paylaşılan</option>
                    <option value="cok">En çok not</option>
                  </select>
                </div>
              </div>
            )}

            {hata && <p className="bildirim" role="alert">{hata}</p>}
            {!veri && !hata ? <SatirIskeleti adet={4} /> : veri && (
              liste.length === 0 ? (
                sekme === "derslerim" ? (
                  <Bos simge="kitap" baslik="Derslerin burada toplanacak."
                       aciklama={veri.ben.bolum
                         ? "Bölümünün ve sınıfının dersleri, bir not paylaşıldığı anda burada görünür. Diğer dersleri yıldızlayarak da ekleyebilirsin."
                         : "Bölümünü ve sınıfını seçersen dersleri kendiliğinden gelir; istediğin dersi yıldızlayarak da ekleyebilirsin."}
                       eylem={<button className="dugme cizgili" onClick={() => setSekme("tum")}>Tüm derslere göz at</button>} />
                ) : (
                  <Bos simge="kitap" baslik={araGecikmeli || bolum || sinif ? "Bu filtreye uyan ders yok." : "Henüz not paylaşılmamış."}
                       aciklama={`İlk notu sen paylaş: onaylanınca +${veri.ayar.taban_xp} XP, her "işime yaradı" +${veri.ayar.oy_xp} XP.`}
                       eylem={<button className="dugme cizgili" onClick={paylas}><Simge ad="arti" boyut={16} /> Not paylaş</button>} />
                )
              ) : (
                <Bolum etiket={sekme === "derslerim" ? "Derslerim" : veri.kurum_adi ?? "Tüm üniversiteler"}
                       sag={<span className="etiket rakam">{liste.length}</span>} sira={4}>
                  <Satirlar>
                    {liste.map((d) => (
                      <DersSatiri key={dersKimligi(d)} ders={d} kurumGoster={etkinKurum === "tum"}
                                  onAc={() => git("akademi", { ders: { kod: d.kod, ad: d.ad, kurum: d.kurum } })} />
                    ))}
                  </Satirlar>
                </Bolum>
              )
            )}

            {sponsorlu.length > 0 && (
              <Bolum etiket="Sponsorlu" className="akademi-sponsorlu" sira={6}>
                <div className="yigin sik">
                  {sponsorlu.map((s) => <SponsorluKart key={s.id} s={s} onAc={() => sponsorluAc(s)} />)}
                </div>
              </Bolum>
            )}
          </>
        )}
      </div>

      {pencere?.tur === "paylas" && veri && (
        <PaylasPenceresi ayar={veri.ayar} sinavOncesi={!!veri.sinav}
          varsayilan={{ bolum: veri.ben.bolum ?? "", sinif: veri.ben.sinif ?? "" }}
          onKapat={() => setPencere(null)}
          onPaylasildi={(m) => { setPencere(null); setBildirim(m); setSekme("notlarim"); setNotlarimSurum((x) => x + 1); }}
          onDogrula={() => setPencere({ tur: "dogrula", neden: "Paylaşmak için öğrenciliğini doğrula." })} />
      )}
      {pencere?.tur === "dogrula" && (
        <Dogrulama neden={pencere.neden} onKapat={() => { setPencere(null); yukle(); }}
                   onDogrulandi={() => { setKurum("benim"); }} />
      )}
      {secili && (
        <NotDetayi not={secili} dogrulandi={dogrulandi} onKapat={() => setSecili(null)} onGuncelle={setSecili}
                   onDogrula={() => setPencere({ tur: "dogrula", neden: "Notu açmak için öğrenciliğini doğrula." })}
                   onSilindi={() => { setSecili(null); setBildirim("Not kaldırıldı."); setNotlarimSurum((x) => x + 1); }} />
      )}
      {pencere?.tur === "sponsor" && (
        <SponsorDetay sponsor={pencere.s} onKapat={() => setPencere(null)}
                      onTara={() => { setPencere(null); git("ben", { bolum: "sponsorlar" }); }} />
      )}
    </div>
  );
}

function Cip({ secili, onClick, children }: { secili: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="cip" aria-pressed={secili} onClick={onClick}>{children}</button>;
}

function DersSatiri({ ders: d, kurumGoster, onAc }: { ders: DersOzeti; kurumGoster: boolean; onAc: () => void }) {
  const sabit = sabitMi(d);
  return (
    <Satir
      simge={<span className="ders-kodu rakam" aria-hidden="true">{d.kod ? d.kod.split(/\s+/)[0].slice(0, 4) : d.ad.slice(0, 2)}</span>}
      baslik={<>{d.ad}{sabit && <Simge ad="yildiz" boyut={13} />}</>}
      aciklama={
        <>
          <span className="ders-satiri-sayim rakam">{[d.kod, dersSayimi(d)].filter(Boolean).join(" · ")}</span>
          <span className="ders-satiri-yer">{[`${d.bolum} · ${sinifAdi(d.sinif)}`, kurumGoster ? d.universite : null].filter(Boolean).join(" · ")}</span>
        </>
      }
      onClick={onAc}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
// DERS SAYFASI: bir dersin notları
// ═══════════════════════════════════════════════════════════════════
function DersSayfasi({ ders }: { ders: DersAnahtari }) {
  const { geri } = useGezinme();
  const [tur, setTur] = useState<NotTuru | "">("");
  const [sira, setSira] = useState<"faydali" | "yeni">("faydali");
  const [veri, setVeri] = useState<NotListesi | null>(null);
  const [ekler, setEkler] = useState<NotOzeti[]>([]);
  const [sayfa, setSayfa] = useState(0);
  const [hata, setHata] = useState<string | null>(null);
  const [secili, setSecili] = useState<NotOzeti | null>(null);
  const [pencere, setPencere] = useState<{ tur: "paylas" } | { tur: "dogrula"; neden: string } | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const [sabit, setSabit] = useState(() => sabitMi(ders));
  const [turSayilari, setTurSayilari] = useState<Record<string, number> | null>(null);

  const yukle = useCallback(async () => {
    setHata(null);
    try {
      const v = await pano.notlar({ kurum: "tum", ders, tur, sira, sayfa: 0 });
      setVeri(v);
      setEkler([]);
      setSayfa(0);
      if (!tur) {
        const say: Record<string, number> = { "": v.liste.length };
        for (const n of v.liste) say[n.tur] = (say[n.tur] ?? 0) + 1;
        setTurSayilari((onceki) => (v.daha ? onceki ?? null : say));
      }
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Notlar alınamadı.");
    }
  }, [ders, tur, sira]);
  useEffect(() => { yukle(); }, [yukle]);

  async function dahaFazla() {
    const s = sayfa + 1;
    try {
      const v = await pano.notlar({ kurum: "tum", ders, tur, sira, sayfa: s });
      setEkler((e) => [...e, ...v.liste]);
      setVeri((x) => (x ? { ...x, daha: v.daha } : x));
      setSayfa(s);
    } catch { /* bir sonraki dokunuşta tekrar */ }
  }

  const notlar = [...(veri?.liste ?? []), ...ekler];
  const ilk = notlar[0];
  const dogrulandi = !!veri?.ben.dogrulandi;

  function notGuncelle(n: NotOzeti) {
    setVeri((v) => (v ? { ...v, liste: v.liste.map((x) => (x.id === n.id ? n : x)) } : v));
    setEkler((e) => e.map((x) => (x.id === n.id ? n : x)));
    setSecili((s) => (s && s.id === n.id ? n : s));
  }

  function paylas() {
    if (!dogrulandi) { setPencere({ tur: "dogrula", neden: "Not paylaşmak için öğrenciliğini doğrula. Bir kez yeter." }); return; }
    setPencere({ tur: "paylas" });
  }

  return (
    <div className="sayfa akademi ders">
      <div className="sutun">
        <AltBasi
          ust="Dersler"
          baslik={ilk?.ders_adi ?? ders.ad}
          aciklama={[ders.kod, ilk ? `${ilk.bolum} · ${sinifAdi(ilk.sinif)}` : null, ilk?.universite].filter(Boolean).join(" · ")}
          onGeri={geri}
          eylem={
            <button className="ikon-dugme" aria-pressed={sabit} onClick={() => { dersSabitle(ders, !sabit); setSabit(!sabit); }}
                    aria-label={sabit ? "Derslerimden çıkar" : "Derslerime ekle"} data-ipucu={sabit ? "Derslerimden çıkar" : "Derslerime ekle"}
                    data-ipucu-yon="alt">
              <Simge ad="yildiz" />
            </button>
          }
        />

        {veri?.sinav && (
          <div className="sinav-seridi gir" style={kademe(2)} data-asama={veri.sinav.asama} role="status">
            <Simge ad="saat" boyut={18} />
            <div><b>{sinavMetni(veri.sinav)}</b><span>En faydalı notlar üstte.</span></div>
          </div>
        )}

        <div className="ders-arac gir" style={kademe(3)}>
          <div className="cipler" role="group" aria-label="Not türü">
            <Cip secili={tur === ""} onClick={() => setTur("")}>Tümü{turSayilari?.[""] ? ` ${turSayilari[""]}` : ""}</Cip>
            {TURLER.map((t) => (
              <Cip key={t.deger} secili={tur === t.deger} onClick={() => setTur(t.deger)}>
                {t.kisa}{turSayilari?.[t.deger] ? ` ${turSayilari[t.deger]}` : ""}
              </Cip>
            ))}
          </div>
          <select className="girdi" value={sira} aria-label="Sıralama" onChange={(e) => setSira(e.target.value as "faydali" | "yeni")}>
            <option value="faydali">En faydalı</option>
            <option value="yeni">En yeni</option>
          </select>
        </div>

        {bildirim && (
          <p className="bildirim bilgi gir" role="status">
            {bildirim}{" "}
            <button className="metin-dugme baglanti satir-ici" onClick={() => setBildirim(null)}>Tamam</button>
          </p>
        )}
        {hata && <p className="bildirim" role="alert">{hata}</p>}

        {!veri && !hata ? <SatirIskeleti adet={4} /> : veri && (
          notlar.length === 0 ? (
            <Bos simge="kitap" baslik={tur ? "Bu türde not yok." : "Bu derse henüz not yok."}
                 aciklama="İlk notu sen paylaş."
                 eylem={<button className="dugme cizgili" onClick={paylas}><Simge ad="arti" boyut={16} /> Bu derse not paylaş</button>} />
          ) : (
            <>
              <Satirlar className="not-satirlari">
                {notlar.map((n) => <NotSatiri key={n.id} not={n} onAc={() => setSecili(n)} />)}
              </Satirlar>
              {veri.daha && <button className="dugme cizgili genis daha-fazla" onClick={dahaFazla}>Daha fazla</button>}
              <div className="ders-paylas gir">
                <button className="dugme cizgili" onClick={paylas}><Simge ad="arti" boyut={16} /> Bu derse not paylaş</button>
              </div>
            </>
          )
        )}
      </div>

      {secili && (
        <NotDetayi not={secili} dogrulandi={dogrulandi} onKapat={() => setSecili(null)} onGuncelle={notGuncelle}
                   onDogrula={() => setPencere({ tur: "dogrula", neden: "Notu açmak için öğrenciliğini doğrula. Bir kez yeter." })}
                   onSilindi={() => { setSecili(null); setBildirim("Not kaldırıldı."); yukle(); }} />
      )}
      {pencere?.tur === "paylas" && veri && (
        <PaylasPenceresi ayar={veri.ayar} sinavOncesi={!!veri.sinav}
          varsayilan={{ bolum: ilk?.bolum ?? veri.ben.bolum ?? "", sinif: ilk?.sinif ?? veri.ben.sinif ?? "",
                        ders_adi: ilk?.ders_adi ?? ders.ad, ders_kodu: ders.kod ?? "" }}
          onKapat={() => setPencere(null)}
          onPaylasildi={(m) => { setPencere(null); setBildirim(m); yukle(); }}
          onDogrula={() => setPencere({ tur: "dogrula", neden: "Paylaşmak için öğrenciliğini doğrula." })} />
      )}
      {pencere?.tur === "dogrula" && (
        <Dogrulama neden={pencere.neden} onKapat={() => { setPencere(null); yukle(); }} />
      )}
    </div>
  );
}

/** Bir not, liste satırı olarak: tür, başlık, dönem, paylaşan, kaç kişinin işine yaradı. */
function NotSatiri({ not: n, onAc }: { not: NotOzeti; onAc: () => void }) {
  return (
    <div className="satir-dunya">
      <button className="satir-dugme not-satiri" onClick={onAc}>
        <span className="satir-govde">
          <span className="not-satiri-ust">
            <span className="not-tur" data-tur={n.tur}>{TURLER.find((t) => t.deger === n.tur)?.ad}</span>
            <span className="not-donem rakam">{donemEtiketi(n.yil, n.yariyil)}</span>
          </span>
          <span className="satir-baslik">{n.baslik}</span>
          <span className="satir-aciklama">
            {n.yazar ? "@" + n.yazar : "Gizli üye"}{n.benim ? " · sen" : ""}{n.hoca ? ` · ${n.hoca}` : ""}
          </span>
        </span>
        <span className="satir-deger not-satiri-sag rakam">
          <span aria-label={`${n.yararli} kişinin işine yaradı`}><Simge ad="yildiz" boyut={13} /> {n.yararli}</span>
          <small>{n.dosya_turu.toUpperCase()}{n.boyut ? " · " + boyutEtiketi(n.boyut) : ""}</small>
        </span>
      </button>
    </div>
  );
}
