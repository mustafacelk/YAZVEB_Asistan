import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { sorun, supabase, yapilandirildi, type Etkinlik } from "./veri/supabase";
import { OturumSaglayici, useGorunum, useOturum } from "./veri/oturum";
import { KipBaglami, kipOku, kipYaz, type GirisKipi } from "./veri/kip";
import {
  GezinmeBaglami,
  ODUL_DEGISTI,
  odulDegisti,
  rotaAnahtari,
  rotaKur,
  UST_SEKME,
  type Gezinme,
  type Rota,
  type Sekme,
} from "./veri/gezinme";
import { odul, sayi, type EtkinlikOzeti } from "./veri/odul";
import { canliEtkinlik } from "./veri/bugun";
import Giris from "./ekranlar/Giris";
import Ana from "./ekranlar/Ana";
import Sohbet from "./ekranlar/Sohbet";
import Etkinlikler from "./ekranlar/Etkinlikler";
import Topluluk from "./ekranlar/Topluluk";
import Asistan from "./ekranlar/Asistan";
import Ben from "./ekranlar/Ben";
import Tarayici from "./odul/Tarayici";
import Simge, { type SimgeAdi } from "./tasarim/Simge";
import { hubTercihi, hubTercihiYaz } from "./hub/veri";
import HubSiniri from "./hub/HubSiniri";

// Çalışanın doğrulama sayfası: üyelerin uygulamasıyla ortak kod az, ayrı yüklenir.
const Isletme = lazy(() => import("./isletme/Isletme"));
// Yönetim görünümü: üyelerin hiç indirmediği parçalar.
const Panel = lazy(() => import("./yonetim/Panel"));
const YonetimSayfasi = lazy(() => import("./yonetim/Yonetim"));
const Perde = lazy(() => import("./yonetim/Perde"));
// 3B HUB: Three.js yalnızca bu görünüm açılınca iner.
const HubGorunumu = lazy(() => import("./hub/Hub"));
// Akademi: dosya yükleme ve doğrulama pencereleriyle birlikte, açılınca iner.
const Akademi = lazy(() => import("./akademi/Akademi"));

/** <site>/isletme — giriş istemez; kasadaki çalışan kendi telefonunda açar. */
const ISLETME_SAYFASI =
  typeof location !== "undefined" && /^\/isletme\/?$/.test(location.pathname);

type SekmeTanimi = { anahtar: Sekme; ad: string; simge: SimgeAdi };

/**
 * Üye çubuğu: beş dünya (TASARIM.md §2). Asistan ve 3D HUB çubukta değil;
 * Ana'dan girilen tam ekran deneyimler (masaüstü şeridinde "Deneyimler").
 *
 * QR artık her ekranda duran bir düğme değil, BAĞLAMSAL: Etkinlikler'in
 * birincil eylemi; bir etkinlik şu an sürüyor ve okutulmadıysa her ekranın
 * altında tek satırlık şerit. Etkinlikteki kişi yine tek dokunuş uzakta.
 */
const SEKMELER: SekmeTanimi[] = [
  { anahtar: "ana", ad: "Ana", simge: "ev" },
  { anahtar: "akademi", ad: "Akademi", simge: "kitap" },
  { anahtar: "etkinlik", ad: "Etkinlikler", simge: "etkinlik" },
  { anahtar: "topluluk", ad: "Topluluk", simge: "topluluk" },
  { anahtar: "ben", ad: "Ben", simge: "kisi" },
];

/**
 * Yönetim görünümünde çubuk: Panel · Etkinlikler · [Perde QR] · Yönetim ·
 * Topluluk. Etkinlikte yöneticinin en sık yaptığı iş QR göstermek.
 */
const SEKMELER_YONETIM: SekmeTanimi[] = [
  { anahtar: "ana", ad: "Panel", simge: "grafik" },
  { anahtar: "etkinlik", ad: "Etkinlikler", simge: "etkinlik" },
  { anahtar: "yonetim", ad: "Yönetim", simge: "ayar" },
  { anahtar: "topluluk", ad: "Topluluk", simge: "topluluk" },
];

/** Eski ekranın geri çekilme süresi. temel.css → .sahne[data-asama="cik"] ile aynı. */
const CIKIS_MS = 200;
/** Canlı etkinlik şeridi: etkinlik başlayınca en geç bu kadar sonra görünür. */
const CANLI_TAZELEME_MS = 60_000;

/** Geçmiş yoksa (ilk açılış, yenileme) "geri" dünyanın girişine götürür. */
function ustRota(r: Rota): Rota {
  if (r.g === "ben" && r.ben) return { g: "ben" };
  if (r.g === "akademi" && r.ders) return { g: "akademi" };
  if (r.g === "sohbet") return { g: "topluluk" };
  return { g: "ana" };
}

export default function Uygulama() {
  // Giriş türü (üye / yönetim / işletme) oturumdan ÖNCE seçilir; işletme
  // çalışanının oturumu hiç olmaz. Bu yüzden oturumun dışında tutulur.
  const [kip, setKip] = useState<GirisKipi | null>(kipOku);
  const kipDegeri = useMemo(() => ({
    kip,
    sec: (k: GirisKipi | null) => { kipYaz(k); setKip(k); },
  }), [kip]);

  return (
    <KipBaglami.Provider value={kipDegeri}>
      <div className="atmosfer" aria-hidden="true" />
      {yapilandirildi && (ISLETME_SAYFASI || kip === "isletme") ? (
        <Suspense fallback={<Acilis />}>
          <Isletme />
        </Suspense>
      ) : yapilandirildi ? (
        <OturumSaglayici>
          <Kabuk />
        </OturumSaglayici>
      ) : (
        <Yapilandirma />
      )}
    </KipBaglami.Provider>
  );
}

function Kabuk() {
  const { oturum, profil, yukleniyor } = useOturum();

  if (yukleniyor) return <Acilis />;
  if (!oturum) return <Giris />;
  // Oturum var ama profil henüz gelmediyse (tetikleyici yeni yazıyor olabilir)
  // boş ekran yerine açılış göster.
  if (!profil) return <Acilis not="Profil hazırlanıyor" />;
  return <Ekranlar />;
}

/**
 * Dünyalar arası geçiş.
 *
 * Gösterge yeni sekmeye HEMEN kayar (dokunuşun karşılığı anında); içerik
 * önce geri çekilir, sonra yenisi öğelerini sırayla getirir. Hızlı art arda
 * dokunuşta son dokunulan kazanır. Her gidiş tarayıcı geçmişine yazılır:
 * geri tuşu uygulamanın içinde geri gider.
 */
function Ekranlar() {
  const { gorunum } = useGorunum();
  const yonetimde = gorunum === "yonetim";
  const [rota, setRota] = useState<Rota>({ g: "ana" });
  const [gorunen, setGorunen] = useState<Rota>({ g: "ana" });
  const [asama, setAsama] = useState<"gir" | "cik">("gir");
  const [tarama, setTarama] = useState(false);
  const [perde, setPerde] = useState(false);
  // HUB bir görünüm: açık bırakılırsa uygulama bir dahaki açılışta HUB'da açılır.
  const [hubAcik, setHubAcik] = useState(hubTercihi);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gorunenRef = useRef<Rota>({ g: "ana" });
  const yonetimdeRef = useRef(yonetimde);
  /** Bu oturumda uygulamanın kendi yazdığı geçmiş kaydı sayısı. */
  const derinlik = useRef(0);

  useEffect(() => { gorunenRef.current = gorunen; }, [gorunen]);
  useEffect(() => { yonetimdeRef.current = yonetimde; }, [yonetimde]);

  /** Ekranı değiştirir (geçmişe dokunmaz). */
  const gec = useCallback((r: Rota) => {
    setRota(r);
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    if (rotaAnahtari(gorunenRef.current) === rotaAnahtari(r)) {
      // Aynı ekran (belki yalnızca soru ya da yönetim bölümü değişti).
      setGorunen(r);
      setAsama("gir");
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGorunen(r);
      return;
    }
    setAsama("cik");
    zamanlayici.current = setTimeout(() => {
      setGorunen(r);
      setAsama("gir");
    }, CIKIS_MS);
  }, []);

  const git = useCallback<Gezinme["git"]>((hedef, secenek) => {
    const r = rotaKur(hedef, secenek, yonetimdeRef.current);
    const simdiki = gorunenRef.current;
    if (rotaAnahtari(r) !== rotaAnahtari(simdiki) || r.yonetim !== simdiki.yonetim) {
      try {
        history.pushState({ yazveb: r }, "");
        derinlik.current += 1;
      } catch { /* geçmiş API'si yoksa yalnızca ekran değişir */ }
    }
    gec(r);
  }, [gec]);

  const geri = useCallback(() => {
    if (derinlik.current > 0) {
      history.back();
      return;
    }
    const ust = ustRota(gorunenRef.current);
    try { history.replaceState({ yazveb: ust }, ""); } catch { /* yok */ }
    gec(ust);
  }, [gec]);

  // Tarayıcının / Android'in geri tuşu: kayıtlı rotaya dön.
  useEffect(() => {
    try { history.replaceState({ yazveb: { g: "ana" } }, ""); } catch { /* yok */ }
    const geriGeldi = (e: PopStateEvent) => {
      const r = (e.state as { yazveb?: Rota } | null)?.yazveb ?? { g: "ana" };
      derinlik.current = Math.max(0, derinlik.current - 1);
      gec(r);
    };
    window.addEventListener("popstate", geriGeldi);
    return () => window.removeEventListener("popstate", geriGeldi);
  }, [gec]);

  const tara = useCallback(() => setTarama(true), []);
  const hubAc = useCallback(() => { hubTercihiYaz(true); setHubAcik(true); }, []);

  // Görünüm değişince (üye ↔ yönetim) başa dön: aynı sekme artık başka bir ekran.
  const ilkGorunum = useRef(gorunum);
  useEffect(() => {
    if (ilkGorunum.current === gorunum) return;
    ilkGorunum.current = gorunum;
    git("ana");
  }, [gorunum, git]);
  const gezinme = useMemo(() => ({ git, geri, tara, hubAc }), [git, geri, tara, hubAc]);

  useEffect(() => () => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
  }, []);

  const canli = useCanliEtkinlik(!yonetimde);
  const secili = UST_SEKME[rota.g];
  const sekmeler = yonetimde ? SEKMELER_YONETIM : SEKMELER;
  const sira = sekmeler.findIndex((s) => s.anahtar === secili);
  // Yönetimde Perde QR 3. sütunda: sonraki sekmeler bir kayar.
  const sutun = sira < 0 ? -1 : yonetimde && sira >= 2 ? sira + 1 : sira;
  const seritGoster = !!canli && !hubAcik && !tarama
    && !["ana", "etkinlik", "asistan", "sohbet"].includes(gorunen.g);

  return (
    <GezinmeBaglami.Provider value={gezinme}>
      <div className="kabuk" data-gorunum={gorunum}>
        <main className="sahne" data-asama={asama} key={rotaAnahtari(gorunen)}>
          {gorunen.g === "ana" && (yonetimde
            ? <Suspense fallback={<Acilis />}><Panel /></Suspense>
            : <Ana />)}
          {gorunen.g === "akademi" && <Suspense fallback={<Acilis />}><Akademi ders={gorunen.ders} /></Suspense>}
          {gorunen.g === "etkinlik" && <Etkinlikler />}
          {gorunen.g === "topluluk" && <Topluluk />}
          {gorunen.g === "sohbet" && <Sohbet onGeri={geri} />}
          {gorunen.g === "ben" && <Ben bolum={gorunen.ben} />}
          {gorunen.g === "asistan" && <Asistan ilkSoru={gorunen.soru} onGeri={geri} />}
          {gorunen.g === "yonetim" && (
            <Suspense fallback={<Acilis />}><YonetimSayfasi gomulu ilkBolum={gorunen.yonetim ?? "ozet"} /></Suspense>
          )}
        </main>

        {seritGoster && canli && (
          <button className="canli-serit cam" onClick={tara}
                  aria-label={`${canli.etkinlik.baslik} şu an sürüyor. QR'yi okut, ${canli.puan} XP kazan`}>
            <i className="canli-nokta" aria-hidden="true" />
            <span className="canli-serit-metin">
              <b className="tek-satir">{canli.etkinlik.baslik}</b>
              <small className="rakam">Şu an · +{sayi(canli.puan)} XP</small>
            </span>
            <span className="canli-serit-eylem"><Simge ad="tara" boyut={16} /> QR okut</span>
          </button>
        )}

        <nav
          className="gezinme cam"
          aria-label="Ana gezinme"
          data-gosterge={sutun < 0 ? "yok" : undefined}
          style={{ "--i": Math.max(0, sutun), "--adet": 5 } as CSSProperties}
        >
          <span className="gezinme-gosterge" aria-hidden="true" />
          {/* Yalnızca masaüstü kenar çubuğunda görünür. */}
          <div className="gezinme-marka" aria-hidden="true">
            <img src="/logo-128.webp" alt="" width={32} height={32} />
            <span><b>YAZVEB</b><small>Yapay Zekâ ve Veri Bilimi</small></span>
          </div>
          {yonetimde ? (
            <>
              {sekmeler.slice(0, 2).map((s) => <SekmeDugmesi key={s.anahtar} s={s} secili={secili} git={git} />)}
              <button
                className="gezinme-tara"
                onClick={() => setPerde(true)}
                aria-label="Perdeye QR yansıt"
                data-ipucu="Perde QR"
                data-ipucu-yon="sag"
              >
                <span className="gezinme-tara-yuz">
                  <Simge ad="qr" boyut={22} />
                  <span className="gezinme-tara-etiket">Perde QR</span>
                </span>
              </button>
              {sekmeler.slice(2).map((s) => <SekmeDugmesi key={s.anahtar} s={s} secili={secili} git={git} />)}
            </>
          ) : (
            <>
              {sekmeler.map((s) => <SekmeDugmesi key={s.anahtar} s={s} secili={secili} git={git} />)}
              {/* Masaüstünde yer var: sürükleyici deneyimler şeridin altında. */}
              <div className="gezinme-deneyimler" role="group" aria-label="Deneyimler">
                <span className="etiket">Deneyimler</span>
                <button className="gezinme-oge" onClick={() => git("asistan")}
                        aria-current={secili === "ana" && rota.g === "asistan" ? "page" : undefined}>
                  <Simge ad="asistan" />
                  <span className="gezinme-etiket">Asistan</span>
                </button>
                <button className="gezinme-oge" onClick={hubAc}>
                  <Simge ad="kup" />
                  <span className="gezinme-etiket">3D HUB</span>
                </button>
              </div>
            </>
          )}
          <p className="gezinme-dip" aria-hidden="true">Selçuk Üniversitesi<br />Yapay Zekâ ve Veri Bilimi Topluluğu</p>
        </nav>

        {tarama && (
          <Tarayici
            mod={{ tur: "gorev" }}
            onKapat={() => setTarama(false)}
            onDegisti={odulDegisti}
          />
        )}
        {hubAcik && !yonetimde && (
          <HubSiniri onHata={() => { hubTercihiYaz(false); setHubAcik(false); }}>
            <Suspense fallback={<Acilis not="YAZVEB HUB hazırlanıyor" />}>
              <HubGorunumu onKapat={() => { hubTercihiYaz(false); setHubAcik(false); }} />
            </Suspense>
          </HubSiniri>
        )}
        {perde && (
          <Suspense fallback={null}>
            <Perde onKapat={() => setPerde(false)} onGorevOlustur={() => git("odul", { yonetim: "gorevler" })} />
          </Suspense>
        )}
      </div>
    </GezinmeBaglami.Provider>
  );
}

/**
 * Şu an süren, puanlı ve henüz okutulmamış etkinlik (varsa). Dakikada bir
 * ve puan değişince tazelenir; sekme arka plandayken sormaz.
 */
function useCanliEtkinlik(acik: boolean) {
  const [veri, setVeri] = useState<{ etkinlikler: Etkinlik[]; ozet: EtkinlikOzeti[] }>({ etkinlikler: [], ozet: [] });
  const [simdi, setSimdi] = useState(Date.now());

  useEffect(() => {
    if (!acik) return;
    let gecerli = true;
    const yukle = async () => {
      if (document.hidden) return;
      const [liste, ozet] = await Promise.all([
        supabase.from("etkinlikler").select("*")
          .gte("baslangic", new Date(Date.now() - 12 * 3_600_000).toISOString())
          .lte("baslangic", new Date(Date.now() + 3_600_000).toISOString())
          .order("baslangic", { ascending: true }).limit(10),
        odul.etkinlikOzeti().catch((): EtkinlikOzeti[] => []),
      ]);
      if (!gecerli) return;
      setVeri({ etkinlikler: (liste.data as Etkinlik[] | null) ?? [], ozet });
      setSimdi(Date.now());
    };
    yukle();
    const z = setInterval(yukle, CANLI_TAZELEME_MS);
    window.addEventListener(ODUL_DEGISTI, yukle);
    document.addEventListener("visibilitychange", yukle);
    return () => {
      gecerli = false;
      clearInterval(z);
      window.removeEventListener(ODUL_DEGISTI, yukle);
      document.removeEventListener("visibilitychange", yukle);
    };
  }, [acik]);

  return acik ? canliEtkinlik(veri.etkinlikler, veri.ozet, simdi) : null;
}

function SekmeDugmesi({ s, secili, git }: {
  s: SekmeTanimi;
  secili: Sekme;
  git: Gezinme["git"];
}) {
  return (
    <button
      className="gezinme-oge"
      onClick={() => git(s.anahtar)}
      aria-current={secili === s.anahtar ? "page" : undefined}
      aria-label={s.ad}
      data-ipucu={s.ad}
      data-ipucu-yon="sag"
    >
      <Simge ad={s.simge} />
      <span className="gezinme-etiket" aria-hidden="true">{s.ad}</span>
    </button>
  );
}

function Acilis({ not }: { not?: string }) {
  return (
    <div className="acilis" role="status" aria-live="polite">
      <img src="/logo-256.webp" alt="YAZVEB" width={64} height={64} />
      <div className="acilis-cizgi" aria-hidden="true" />
      <span className="etiket">{not ?? "Yükleniyor"}</span>
    </div>
  );
}

/**
 * Anahtarlar tanımsızken boş ekran yerine ne yapılacağını söyler.
 *
 * Çözüm nerede çalıştığına göre DEĞİŞİR: yerelde `.env` dosyası düzenlenir,
 * yayındaki bir sitede ise böyle bir dosya yoktur — değerler barındırma
 * panelinde tanımlanır. Yanlış yeri tarif eden bir hata mesajı, hata
 * mesajı olmamasından çok daha fazla zaman kaybettirir.
 */
function Yapilandirma() {
  const yerel =
    typeof location !== "undefined" &&
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  return (
    <div className="giris">
      <div className="giris-kolon yigin">
        <div className="giris-marka">
          <img src="/logo-256.webp" alt="YAZVEB" width={64} height={64} />
          <div>
            <h1>Bağlantı kurulamadı</h1>
            <p>{sorun === "eksik" ? "Sunucu bağlantısı yapılandırılmamış." : sorun}</p>
          </div>
        </div>

        {yerel ? (
          <p>
            <code>uygulama/.env</code> dosyasına Supabase panelindeki
            <b> Project Settings → API </b> bölümünden iki değeri yaz:
          </p>
        ) : (
          <p>
            Bu site yayında; <code>.env</code> dosyası yok. Değerleri
            <b> barındırma panelinde </b> (Vercel → Settings → Environment
            Variables) tanımla:
          </p>
        )}

        <pre className="kod">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...`}
        </pre>

        <p className="soluk">
          {yerel
            ? "Üstteki Project URL, alttaki Publishable key. Yer değiştirirse uygulama açılır ama hiçbir istek çalışmaz."
            : "Değişkenleri ekledikten sonra yeniden dağıtman şart; değerler derleme sırasında pakete gömülür."}
        </p>
      </div>
    </div>
  );
}
