import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Simge, { type SimgeAdi } from "../tasarim/Simge";
import { AltBasi, Bolum, Bos, Satir, SatirIskeleti, Satirlar } from "../tasarim/Dunya";
import { useGorunum } from "../veri/oturum";
import { useGezinme } from "../veri/gezinme";
import { OdulHatasi } from "../veri/odul";
import {
  DURUM_ADI,
  ekip,
  ekipOzetleri,
  gunEkle,
  panoyuDuzenle,
  sinavHaftasi,
  teslimEtiketi,
  type EkipKodu,
  type IsDurumu,
  type Pano,
  type PanoFiltresi,
  type PanoIsi,
} from "../veri/ekip";
import Pencere from "./Pencere";
import HavuzYonetimi from "./HavuzYonetimi";
import Kadro from "./Kadro";

type Sekme = "pano" | "havuz" | "kadro";
const SEKMELER: { kod: Sekme; ad: string }[] = [
  { kod: "pano", ad: "Pano" },
  { kod: "havuz", ad: "Gönüllü havuzu" },
  { kod: "kadro", ad: "Kadro" },
];

const DURUM_SIMGESI: Record<IsDurumu, SimgeAdi> = {
  sirada: "liste",
  yapiliyor: "saat",
  onayda: "kalkan",
  bitti: "tik",
  kacti: "kapat",
};

/**
 * Ekip panosu — görevli kadronun ortak panosu (YAZVEB Yeni Yönetim Yapısı §7).
 *
 * "Görev vermek için gruba yazmak yetmez; iş panoya girince verilmiş sayılır."
 * Her satır bir iş: tek sahibi, ekibi, teslim tarihi, durumu. Panoyu kadrodaki
 * herkes görür (şeffaflık); işi yalnızca ekibin lideri ve Operasyon yazar.
 * Çekirdek toplantısından önce bakılacak yer burası: geciken ne, kim neyi bitirdi.
 */
export default function EkipPanosu() {
  const { geri } = useGezinme();
  const { gorunum } = useGorunum();
  const [sekme, setSekme] = useState<Sekme>("pano");
  const [p, setP] = useState<Pano | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    try {
      setP(await ekip.pano());
      setHata(null);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Pano yüklenemedi.");
    }
  }, []);
  useEffect(() => { yukle(); }, [yukle]);

  const sira = SEKMELER.findIndex((s) => s.kod === sekme);
  return (
    <div className="sayfa ekip-panosu">
      <div className="sutun genis">
        <AltBasi
          ust={gorunum === "yonetim" ? "Panel" : "Ben"}
          baslik="Ekip panosu"
          aciklama="Her işin tek sahibi ve tarihi var. İş panoya girince verilmiş sayılır."
          onGeri={geri}
        />
        {hata && <p className="bildirim" role="alert">{hata}</p>}

        <div className="secici gir" role="tablist" aria-label="Pano bölümleri"
             style={{ ["--secim" as string]: sira, ["--adet" as string]: SEKMELER.length } as CSSProperties}>
          <span className="secici-gosterge" aria-hidden="true" />
          {SEKMELER.map((s) => (
            <button key={s.kod} type="button" role="tab" aria-selected={sekme === s.kod} onClick={() => setSekme(s.kod)}>
              {s.ad}
            </button>
          ))}
        </div>

        {!p ? (!hata && <SatirIskeleti adet={4} />) : (
          <>
            {sekme === "pano" && <PanoSekmesi p={p} onDegisti={yukle} />}
            {sekme === "havuz" && <HavuzYonetimi pano={p} />}
            {sekme === "kadro" && <Kadro p={p} onDegisti={yukle} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Pano ────────────────────────────────────────────────────────────

function PanoSekmesi({ p, onDegisti }: { p: Pano; onDegisti: () => void }) {
  const [f, setF] = useState<PanoFiltresi>({ kim: "hepsi", ekip: "hepsi", bitenler: false });
  // Kimlik tutulur, iş panodan okunur: pano tazelenince pencere güncel hâli gösterir.
  const [acik, setAcik] = useState<number | "yeni" | null>(null);
  const acikIs = typeof acik === "number" ? p.isler.find((i) => i.id === acik) ?? null : null;
  const ozet = useMemo(() => ekipOzetleri(p), [p]);
  const gruplar = useMemo(() => panoyuDuzenle(p, f), [p, f]);
  const geciken = p.isler.filter((i) => i.gecikti).length;
  const benimAcik = p.isler.filter((i) => i.sahibi.id === p.ben.id && ["sirada", "yapiliyor", "onayda"].includes(i.durum)).length;

  return (
    <>
      <div className="pano-ust gir">
        <p className="pano-ozet-cumlesi">
          {geciken > 0
            ? <><b className="rakam uyari-metin">{geciken}</b> iş gecikmede.</>
            : "Geciken iş yok."}
          {benimAcik > 0 && <> Sende <b className="rakam">{benimAcik}</b> açık iş var.</>}
        </p>
        {p.ben.yonettikleri.length > 0 && (
          <button className="dugme birincil" onClick={() => setAcik("yeni")}><Simge ad="arti" boyut={16} /> Yeni iş</button>
        )}
      </div>

      <div className="cipler gir" role="group" aria-label="Ekibe göre süz">
        <button className="cip" aria-pressed={f.ekip === "hepsi"} onClick={() => setF({ ...f, ekip: "hepsi" })}>Bütün ekipler</button>
        {p.ekipler.map((e) => (
          <button key={e.kod} className="cip" aria-pressed={f.ekip === e.kod} onClick={() => setF({ ...f, ekip: e.kod })}>
            {e.ad}{(ozet[e.kod]?.acik ?? 0) > 0 && <span className="rakam soluk"> {ozet[e.kod].acik}</span>}
            {(ozet[e.kod]?.geciken ?? 0) > 0 && <span className="cip-uyari rakam"> · {ozet[e.kod].geciken} gecikmede</span>}
          </button>
        ))}
      </div>
      <div className="pano-suzgec gir">
        <button className="cip" aria-pressed={f.kim === "benim"} onClick={() => setF({ ...f, kim: f.kim === "benim" ? "hepsi" : "benim" })}>
          Yalnızca benim işlerim
        </button>
        <button className="cip" aria-pressed={f.bitenler} onClick={() => setF({ ...f, bitenler: !f.bitenler })}>
          Biten ve kaçanlar
        </button>
      </div>

      {gruplar.length === 0 ? (
        <Bos simge="liste" baslik={p.isler.length ? "Bu süzgeçte iş yok." : "Pano boş."}
             aciklama={p.ben.yonettikleri.length ? "İlk işi sen yaz: iş, sahibi, teslim tarihi." : "Ekip liderin iş yazınca burada görünür."} />
      ) : gruplar.map((g, gi) => (
        <Bolum key={g.ekip.kod} etiket={g.ekip.ad} sira={gi + 3} sag={<span className="etiket rakam">{g.isler.length}</span>}>
          <Satirlar>
            {g.isler.map((i) => <IsSatiri key={i.id} i={i} bugun={p.bugun} benim={i.sahibi.id === p.ben.id} onAc={() => setAcik(i.id)} />)}
          </Satirlar>
        </Bolum>
      ))}

      {p.sinav.length > 0 && (
        <p className="pano-sinav soluk gir">
          <Simge ad="kitap" boyut={14} /> Sınav haftalarına teslim konmaz:{" "}
          {p.sinav.map((s) => `${s.ad} ${tarihKisa(s.baslangic)}–${tarihKisa(s.bitis)}`).join(" · ")}
        </p>
      )}

      {(acik === "yeni" || acikIs) && (
        <IsPenceresi key={acik} p={p} is={acikIs} onKapat={() => setAcik(null)} onDegisti={onDegisti} />
      )}
    </>
  );
}

function IsSatiri({ i, bugun, benim, onAc }: { i: PanoIsi; bugun: string; benim: boolean; onAc: () => void }) {
  const t = teslimEtiketi(i.teslim, bugun);
  const kapali = i.durum === "bitti" || i.durum === "kacti";
  return (
    <Satir
      simge={DURUM_SIMGESI[i.durum]}
      baslik={<>{i.baslik}{benim && <span className="rozet benim-rozeti">Sen</span>}</>}
      aciklama={
        <span className="is-ust">
          <span>{i.sahibi.ad}</span>
          {!kapali && <span className="teslim rakam" data-ton={i.gecikti ? "gecikti" : t.ton}>{i.gecikti ? `${t.metin}` : t.metin}</span>}
          {i.ertelendi > 0 && <span className="soluk rakam" title="Haber verilip ertelendi">↻ {i.ertelendi}</span>}
        </span>
      }
      deger={<span className="durum-rozeti" data-durum={i.durum}>{DURUM_ADI[i.durum]}</span>}
      onClick={onAc}
    />
  );
}

function IsPenceresi({ p, is, onKapat, onDegisti }: {
  p: Pano;
  is: PanoIsi | null;
  onKapat: () => void;
  onDegisti: () => void;
}) {
  const yonetir = is ? p.ben.yonettikleri.includes(is.ekip) : p.ben.yonettikleri.length > 0;
  const sahibi = !!is && is.sahibi.id === p.ben.id;
  const [taslak, setTaslak] = useState({
    baslik: is?.baslik ?? "",
    ekip: (is?.ekip ?? p.ben.yonettikleri[0] ?? "cekirdek") as EkipKodu,
    sahibi: is?.sahibi.id ?? "",
    teslim: is?.teslim ?? gunEkle(p.bugun, 7),
    notu: is?.notu ?? "",
  });
  const [ertele, setErtele] = useState({ teslim: gunEkle(is?.teslim && is.teslim > p.bugun ? is.teslim : p.bugun, 3), neden: "" });
  const [mesaj, setMesaj] = useState<{ metin: string; hata?: boolean } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [silOnay, setSilOnay] = useState(false);

  const sinav = sinavHaftasi(taslak.teslim, p.sinav);
  const erteleSinav = sinavHaftasi(ertele.teslim, p.sinav);
  const rolAdi = (kod: string) => p.roller.find((r) => r.kod === kod)?.ad ?? kod;
  const kapali = !!is && (is.durum === "bitti" || is.durum === "kacti");
  const sahibiErteleyebilir = sahibi && !kapali && p.bugun <= (is?.teslim ?? "");

  async function calistir<T>(f: () => Promise<T>, sonra?: (r: T) => string | null, kapat = false) {
    setMesgul(true);
    setMesaj(null);
    try {
      const r = await f();
      const m = sonra?.(r) ?? null;
      onDegisti();
      if (kapat && !m) onKapat();
      else if (m) setMesaj({ metin: m });
    } catch (h) {
      setMesaj({ metin: h instanceof OdulHatasi ? h.message : "Olmadı, tekrar dene.", hata: true });
    } finally {
      setMesgul(false);
    }
  }

  const izinliDurumlar: IsDurumu[] = yonetir ? ["sirada", "yapiliyor", "onayda", "bitti", "kacti"]
    : sahibi && !kapali ? ["sirada", "yapiliyor", "onayda"] : [];

  return (
    <Pencere baslik={is ? (yonetir ? "İşi düzenle" : is.baslik) : "Yeni iş"} onKapat={onKapat}>
      <div className="yigin">
        {yonetir ? (
          <form className="yigin" onSubmit={(e) => {
            e.preventDefault();
            calistir(() => ekip.isKaydet({ id: is?.id, ...taslak }), undefined, true);
          }}>
            <label className="alan">
              <span className="etiket">İş</span>
              <input className="girdi" value={taslak.baslik} maxLength={140} autoFocus={!is}
                     placeholder="Örn. Atölye afişinin ilk taslağı"
                     onChange={(e) => setTaslak({ ...taslak, baslik: e.target.value })} />
            </label>
            <div className="alan-ikili">
              <label className="alan">
                <span className="etiket">Ekip</span>
                <select className="girdi" value={taslak.ekip} onChange={(e) => setTaslak({ ...taslak, ekip: e.target.value as EkipKodu })}>
                  {p.ekipler.filter((e) => p.ben.yonettikleri.includes(e.kod)).map((e) => <option key={e.kod} value={e.kod}>{e.ad}</option>)}
                </select>
              </label>
              <label className="alan">
                <span className="etiket">Teslim</span>
                <input className="girdi" type="date" value={taslak.teslim} min={p.bugun}
                       onChange={(e) => setTaslak({ ...taslak, teslim: e.target.value })} />
              </label>
            </div>
            {sinav && <p className="bildirim">{sinav} haftasına teslim konmaz; öncesi ya da sonrası için bir tarih seç.</p>}
            <label className="alan">
              <span className="etiket">Sahibi (tek kişi)</span>
              <select className="girdi" value={taslak.sahibi} onChange={(e) => setTaslak({ ...taslak, sahibi: e.target.value })}>
                <option value="">Seç</option>
                {p.ekipler.map((e) => {
                  const kisiler = p.kadro.filter((k) => p.roller.find((r) => r.kod === k.rol)?.ekip === e.kod);
                  return kisiler.length ? (
                    <optgroup key={e.kod} label={e.ad}>
                      {kisiler.map((k) => <option key={k.id} value={k.id}>{k.ad} · {rolAdi(k.rol)}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
            <label className="alan">
              <span className="etiket">Not <i>(isteğe bağlı)</i></span>
              <textarea className="girdi" rows={2} maxLength={500} value={taslak.notu}
                        onChange={(e) => setTaslak({ ...taslak, notu: e.target.value })} />
            </label>
            <div className="pencere-dip">
              {is && (
                <button type="button" className={"dugme tehlike" + (silOnay ? " onay" : "")} disabled={mesgul}
                        onClick={() => silOnay ? calistir(() => ekip.isSil(is.id), undefined, true) : setSilOnay(true)}>
                  <Simge ad="cop" boyut={16} /> {silOnay ? "Silinsin mi?" : "Sil"}
                </button>
              )}
              <button type="submit" className="dugme birincil" disabled={mesgul || !taslak.baslik.trim() || !taslak.sahibi || !!sinav}>
                {is ? "Kaydet" : "Panoya ekle"}
              </button>
            </div>
          </form>
        ) : is && (
          <dl className="is-ayrinti">
            <div><dt className="etiket">Sahibi</dt><dd>{is.sahibi.ad}</dd></div>
            <div><dt className="etiket">Ekip</dt><dd>{p.ekipler.find((e) => e.kod === is.ekip)?.ad}</dd></div>
            <div><dt className="etiket">Teslim</dt><dd className="rakam">{teslimEtiketi(is.teslim, p.bugun).metin} · {tarihKisa(is.teslim)}</dd></div>
            {is.notu && <div><dt className="etiket">Not</dt><dd>{is.notu}</dd></div>}
          </dl>
        )}

        {is && izinliDurumlar.length > 0 && (
          <section className="is-bolum">
            <span className="etiket">Durum</span>
            <div className="durum-secici">
              {izinliDurumlar.map((d) => (
                <button key={d} type="button" className="cip" aria-pressed={is.durum === d} disabled={mesgul || is.durum === d}
                        data-durum={d}
                        onClick={() => calistir(() => ekip.isDurum(is.id, d), (r) => d === "kacti"
                          ? (r.gorusme
                              ? `Kayda geçti. ${is.sahibi.ad} için bu ${r.kacti}. kayıt: başkan ve ekip lideriyle görüşme zamanı. İşin ağırlığına ve nedenine bakılır.`
                              : `Kayda geçti (${r.kacti}/${r.esik}). Bugün kendisine yazıp nedenini sor.`)
                          : null, d !== "kacti")}>
                  {DURUM_ADI[d]}
                </button>
              ))}
            </div>
            {yonetir && !kapali && (
              <p className="soluk kucuk">
                "Kaçtı" yalnızca haber vermeden kaçan teslim içindir. Önceden haber verip yeni tarih isteyen için aşağıdan ertele; kayıt tutulmaz.
              </p>
            )}
            {yonetir && is.kacti_kayit && (
              <button type="button" className="metin-dugme baglanti" disabled={mesgul}
                      onClick={() => calistir(() => ekip.isDurum(is.id, is.durum === "kacti" ? "yapiliyor" : is.durum, true),
                        () => "Kaçtı kaydı silindi.")}>
                Kaçtı yanlışlıkla işlendiyse kaydı düzelt
              </button>
            )}
          </section>
        )}

        {is && !kapali && (yonetir || sahibiErteleyebilir) && (
          <section className="is-bolum">
            <span className="etiket">Yetişmeyecekse önceden haber ver</span>
            <div className="alan-ikili">
              <input className="girdi" type="date" value={ertele.teslim} min={gunEkle(p.bugun, 1)} aria-label="Yeni teslim"
                     onChange={(e) => setErtele({ ...ertele, teslim: e.target.value })} />
              <input className="girdi" value={ertele.neden} maxLength={300} placeholder="Kısa neden (isteğe bağlı)" aria-label="Neden"
                     onChange={(e) => setErtele({ ...ertele, neden: e.target.value })} />
            </div>
            {erteleSinav && <p className="bildirim">{erteleSinav} haftasına teslim konmaz.</p>}
            <button type="button" className="dugme cizgili" disabled={mesgul || !!erteleSinav}
                    onClick={() => calistir(() => ekip.isErtele(is.id, ertele.teslim, ertele.neden), undefined, true)}>
              <Simge ad="saat" boyut={16} /> Yeni tarihe ertele
            </button>
          </section>
        )}
        {is && sahibi && !kapali && !yonetir && !sahibiErteleyebilir && (
          <p className="bildirim">Teslim günü geçti. Yeni tarih için ekip liderine yaz.</p>
        )}

        {mesaj && <p className={"bildirim" + (mesaj.hata ? "" : " bilgi")} role="status">{mesaj.metin}</p>}
      </div>
    </Pencere>
  );
}

function tarihKisa(gun: string) {
  const [y, a, g] = gun.slice(0, 10).split("-").map(Number);
  return new Date(y, a - 1, g).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}
