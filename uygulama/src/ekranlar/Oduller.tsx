import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Simge, { odulIkonu } from "../tasarim/Simge";
import {
  hedefCumlesi,
  odul,
  OdulHatasi,
  sayi,
  seviyeIlerlemesi,
  tarih,
  tarihSaat,
  type KazanimOzeti,
  type Liderlik,
  type Profil,
  type Sponsor,
} from "../veri/odul";
import Tarayici, { type TaramaModu } from "../odul/Tarayici";
import OdulGoster from "../odul/OdulGoster";
import { SponsorDetay, SponsorKarti } from "../odul/SponsorKarti";

// Yönetim paneli yalnızca yetkililer açtığında yüklenir.
const Yonetim = lazy(() => import("../yonetim/Yonetim"));

type Bolum = "sponsorlar" | "oduller" | "siralama" | "gecmis";
const BOLUMLER: { anahtar: Bolum; ad: string }[] = [
  { anahtar: "sponsorlar", ad: "Sponsorlar" },
  { anahtar: "oduller", ad: "Ödüllerim" },
  { anahtar: "siralama", ad: "Sıralama" },
  { anahtar: "gecmis", ad: "Geçmiş" },
];

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Ödüller — kullanıcının YAZVEB içindeki ilerleme profili.
 *
 * İlk bakışta üç şey görünür: kaç puanın var, hangi seviyedesin, bir sonraki
 * hedefin ne. Hemen altında tek ana eylem: QR TARA. Geri kalan her şey
 * sekmelerde; ekran bağırmaz.
 */
export default function Oduller() {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [sponsorlar, setSponsorlar] = useState<Sponsor[] | null>(null);
  const [cuzdan, setCuzdan] = useState<KazanimOzeti[] | null>(null);
  const [liderlik, setLiderlik] = useState<Liderlik | null>(null);
  const [bolum, setBolum] = useState<Bolum>("sponsorlar");
  const [hata, setHata] = useState<string | null>(null);
  const [tarama, setTarama] = useState<TaramaModu | null>(null);
  const [detay, setDetay] = useState<Sponsor | null>(null);
  const [gosterilen, setGosterilen] = useState<string | null>(null);
  const [yonetim, setYonetim] = useState(false);

  const tazele = useCallback(async () => {
    try {
      const [p, s, c] = await Promise.all([odul.profil(), odul.sponsorlar(), odul.cuzdan()]);
      setProfil(p);
      setSponsorlar(s);
      setCuzdan(c);
      setHata(null);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Yüklenemedi.");
    }
  }, []);

  useEffect(() => { tazele(); }, [tazele]);

  useEffect(() => {
    if (bolum !== "siralama") return;
    odul.liderlik().then(setLiderlik).catch(() => setLiderlik({ acik: false }));
  }, [bolum, profil?.xp, profil?.gizli]);

  const sira = BOLUMLER.findIndex((b) => b.anahtar === bolum);
  const aktifOdul = cuzdan?.filter((z) => z.durum === "aktif").length ?? 0;

  return (
    <div className="sayfa oduller">
      <div className="sutun">
        <header className="sayfa-basi">
          <div>
            <span className="etiket gir">İlerleme</span>
            <h1 className="gir" style={kademe(1)}>Ödüller</h1>
          </div>
          {profil?.yetkili && (
            <button className="dugme cizgili gir" style={kademe(2)} onClick={() => setYonetim(true)}>
              <Simge ad="ayar" boyut={16} /> Yönetim
            </button>
          )}
        </header>

        {hata && <p className="bildirim" role="alert">{hata}</p>}

        {!profil ? (
          <div className="yigin" aria-label="Yükleniyor">
            <div className="iskelet" style={{ width: "40%", height: 48 }} />
            <div className="iskelet" style={{ width: "100%" }} />
          </div>
        ) : (
          <IlerlemeKarti profil={profil} onTara={() => setTarama({ tur: "gorev" })} />
        )}

        <div className="secici bolum-secici gir" role="tablist" aria-label="Ödül bölümleri"
             style={{ ...kademe(5), ["--secim" as string]: sira, ["--adet" as string]: BOLUMLER.length }}>
          <span className="secici-gosterge" aria-hidden="true" />
          {BOLUMLER.map((b) => (
            <button key={b.anahtar} type="button" role="tab" aria-selected={bolum === b.anahtar}
                    onClick={() => setBolum(b.anahtar)}>
              {b.ad}{b.anahtar === "oduller" && aktifOdul > 0 ? <span className="sayac rakam">{aktifOdul}</span> : null}
            </button>
          ))}
        </div>

        {bolum === "sponsorlar" && (
          sponsorlar === null ? null : sponsorlar.length === 0 ? (
            <div className="bos gir">
              <Simge ad="kilit" boyut={28} />
              <b>Sponsor ağı hazırlanıyor.</b>
              <span>İlk sponsorlar eklendiğinde kilitlerini burada açacaksın.</span>
            </div>
          ) : (
            <div className="sponsor-izgara">
              {sponsorlar.map((s, i) => (
                <SponsorKarti key={s.id} sponsor={s} sira={i} onAc={() => setDetay(s)} />
              ))}
            </div>
          )
        )}

        {bolum === "oduller" && <Cuzdan liste={cuzdan} onGoster={setGosterilen} />}
        {bolum === "siralama" && profil && (
          <Siralama veri={liderlik} gizli={profil.gizli} onGizlilik={async (g) => {
            await odul.gizlilik(g).catch(() => {});
            tazele();
          }} />
        )}
        {bolum === "gecmis" && profil && <Gecmis profil={profil} />}
      </div>

      {detay && (
        <SponsorDetay
          sponsor={detay}
          onKapat={() => setDetay(null)}
          onTara={(s) => { setDetay(null); setTarama({ tur: "sponsor", sponsor: s }); }}
        />
      )}
      {tarama && (
        <Tarayici
          mod={tarama}
          onKapat={() => setTarama(null)}
          onDegisti={tazele}
          onOdulGoster={(id) => setGosterilen(id)}
        />
      )}
      {gosterilen && <OdulGoster kazanimId={gosterilen} onKapat={() => setGosterilen(null)} onDegisti={tazele} />}
      {yonetim && (
        <Suspense fallback={null}>
          <Yonetim onKapat={() => { setYonetim(false); tazele(); }} />
        </Suspense>
      )}
    </div>
  );
}

function IlerlemeKarti({ profil, onTara }: { profil: Profil; onTara: () => void }) {
  const { seviye, xp } = profil;
  const oran = seviyeIlerlemesi(xp, seviye);
  const hedef = hedefCumlesi(profil.sonraki_kilit);
  const gosterilenXp = useSayac(xp);

  return (
    <section className="ilerleme-karti gir" style={kademe(2)} aria-label="İlerleme">
      <div className="ilerleme-ust">
        <div>
          <p className="xp-buyuk rakam" aria-label={`${xp} XP`}>{sayi(gosterilenXp)}<span>XP</span></p>
          <p className="seviye-adi">
            <span className="etiket rakam">Seviye {String(seviye.sira).padStart(2, "0")}</span>
            <b>{seviye.ad}</b>
          </p>
        </div>
        {profil.ayarlar.seri_acik && profil.seri > 1 && (
          <span className="seri-cipi" title="Üst üste katıldığın etkinlik sayısı">
            <Simge ad="alev" boyut={16} /> <span className="rakam">×{profil.seri}</span>
          </span>
        )}
      </div>

      <div className="ilerleme-cubugu" style={{ ["--oran" as string]: oran }} role="progressbar"
           aria-valuemin={seviye.esik} aria-valuemax={seviye.sonraki?.esik ?? xp} aria-valuenow={xp}
           aria-label="Seviye ilerlemesi"><i /></div>
      <div className="ilerleme-satiri">
        <span className="etiket rakam">{sayi(seviye.esik)}</span>
        <span className="etiket rakam">
          {seviye.sonraki ? `${seviye.sonraki.ad} · ${sayi(seviye.sonraki.esik)}` : "En üst seviye"}
        </span>
      </div>

      <p className="hedef-cumlesi">
        {xp === 0
          ? "Macera burada başlıyor. İlk etkinlikte QR'yi okut."
          : hedef ?? (profil.toplam_sponsor > 0 ? "Bütün sponsor kilitleri açık." : seviye.aciklama ?? "")}
      </p>

      <div className="ilerleme-ozet">
        <div><b className="rakam">{profil.etkinlik_sayisi}</b><span className="etiket">Etkinlik</span></div>
        <div><b className="rakam">{profil.acik_sponsor}/{profil.toplam_sponsor}</b><span className="etiket">Kilit</span></div>
        <div><b className="rakam">{profil.aktif_odul}</b><span className="etiket">Ödül</span></div>
      </div>

      <button className="tara-dugmesi" onClick={onTara}>
        <Simge ad="tara" boyut={22} />
        <span>QR tara</span>
        <small>veya kısa kod gir</small>
      </button>
    </section>
  );
}

/** Sayı değişince yumuşakça sayar (az hareket tercihinde anında). */
function useSayac(hedef: number) {
  const [deger, setDeger] = useState(hedef);
  const onceki = useRef(hedef);
  useEffect(() => {
    const bas = onceki.current;
    onceki.current = hedef;
    if (bas === hedef || matchMedia("(prefers-reduced-motion: reduce)").matches) { setDeger(hedef); return; }
    const t0 = performance.now();
    let kare = 0;
    const adim = (an: number) => {
      const t = Math.min(1, (an - t0) / 700);
      setDeger(Math.round(bas + (hedef - bas) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) kare = requestAnimationFrame(adim);
    };
    kare = requestAnimationFrame(adim);
    return () => cancelAnimationFrame(kare);
  }, [hedef]);
  return deger;
}

function Cuzdan({ liste, onGoster }: { liste: KazanimOzeti[] | null; onGoster: (id: string) => void }) {
  if (liste === null) return null;
  if (liste.length === 0) {
    return (
      <div className="bos gir">
        <Simge ad="hediye" boyut={28} />
        <b>Henüz ödül kazanmadın.</b>
        <span>Kilidi açık bir sponsorun QR'sini okut, sürpriz ödül burada belirir.</span>
      </div>
    );
  }
  const gruplar: { ad: string; durum: KazanimOzeti["durum"][] }[] = [
    { ad: "Aktif", durum: ["aktif"] },
    { ad: "Kullanılmış", durum: ["kullanildi"] },
    { ad: "Süresi dolan", durum: ["suresi_doldu", "iptal"] },
  ];
  return (
    <>
      {gruplar.map((g) => {
        const ogeler = liste.filter((z) => g.durum.includes(z.durum));
        if (!ogeler.length) return null;
        return (
          <section key={g.ad}>
            <div className="bolum-basi"><span className="etiket">{g.ad}</span><span className="etiket rakam">{ogeler.length}</span></div>
            <ul className="cuzdan-listesi">
              {ogeler.map((z, i) => (
                <li key={z.id} className="cuzdan-ogesi gir" data-durum={z.durum} style={kademe(Math.min(i, 8))}>
                  <span className="cuzdan-ikon"><Simge ad={odulIkonu(z.ikon)} boyut={22} /></span>
                  <div className="cuzdan-bilgi">
                    <span className="etiket">{z.sponsor}</span>
                    <b>{z.baslik}</b>
                    <span className="soluk rakam">
                      Kazanıldı {tarih(z.zaman)}
                      {z.durum === "aktif" ? ` · Son kullanım ${tarih(z.son_kullanma)}` : ""}
                      {z.durum === "kullanildi" && z.kullanildi ? ` · Kullanıldı ${tarihSaat(z.kullanildi)}` : ""}
                    </span>
                  </div>
                  {z.durum === "aktif" ? (
                    <button className="dugme birincil" onClick={() => onGoster(z.id)}>Göster</button>
                  ) : (
                    <span className="etiket soluk">{z.durum === "kullanildi" ? "Kullanıldı" : "Süresi doldu"}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function Siralama({ veri, gizli, onGizlilik }: { veri: Liderlik | null; gizli: boolean; onGizlilik: (g: boolean) => void }) {
  if (!veri) return null;
  if (!veri.acik) {
    return <div className="bos gir"><Simge ad="grafik" boyut={28} /><b>Sıralama şu an kapalı.</b></div>;
  }
  return (
    <section>
      <label className="gizlilik-anahtari">
        <input type="checkbox" checked={gizli} onChange={(e) => onGizlilik(e.target.checked)} />
        <span>
          <b>Gizli profil</b>
          <span className="soluk">Açıkken adın sıralamada görünmez. Puanın ve ödüllerin etkilenmez.</span>
        </span>
      </label>
      {veri.liste.length === 0 ? (
        <div className="bos"><b>Sıralama henüz boş.</b><span>İlk puanı alan zirveye yerleşir.</span></div>
      ) : (
        <ol className="siralama-listesi">
          {veri.liste.map((s) => (
            <li key={s.ad + s.sira} data-ben={s.ben} data-ilk={s.sira <= 3}>
              <span className="siralama-no rakam">{String(s.sira).padStart(2, "0")}</span>
              <span className="siralama-ad">@{s.ad}</span>
              <span className="etiket">{s.seviye}</span>
              <span className="rakam siralama-xp">{sayi(s.xp)} XP</span>
            </li>
          ))}
        </ol>
      )}
      {veri.ben.sira && !veri.liste.some((s) => s.ben) && (
        <p className="soluk siralama-ben">
          {veri.ben.gizli ? "Profilin gizli. " : ""}Senin sıran: <b className="rakam">{veri.ben.sira}</b> · {sayi(veri.ben.xp)} XP
        </p>
      )}
    </section>
  );
}

function Gecmis({ profil }: { profil: Profil }) {
  if (profil.islemler.length === 0) {
    return <div className="bos gir"><Simge ad="liste" boyut={28} /><b>Macera burada başlıyor.</b><span>Kazandığın her puan burada listelenir.</span></div>;
  }
  return (
    <ul className="gecmis-listesi">
      {profil.islemler.map((i, n) => (
        <li key={n} className="gir" style={kademe(Math.min(n, 8))}>
          <span className="gecmis-tur" data-tur={i.tur}>
            <Simge ad={i.tur === "seri_bonusu" ? "alev" : i.tur === "yonetici" ? "kalkan" : "qr"} boyut={16} />
          </span>
          <div>
            <b>{i.aciklama}</b>
            <span className="soluk rakam">{tarihSaat(i.zaman)}{i.tur === "yonetici" ? " · yönetim" : ""}</span>
          </div>
          <span className={"rakam gecmis-miktar" + (i.miktar < 0 ? " eksi" : "")}>
            {i.miktar > 0 ? "+" : ""}{sayi(i.miktar)}
          </span>
        </li>
      ))}
    </ul>
  );
}
