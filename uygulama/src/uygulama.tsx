import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { sorun, yapilandirildi } from "./veri/supabase";
import { OturumSaglayici, useGorunum, useOturum } from "./veri/oturum";
import { KipBaglami, kipOku, kipYaz, type GirisKipi } from "./veri/kip";
import {
  GezinmeBaglami,
  odulDegisti,
  UST_SEKME,
  type Gezinme,
  type Gorunum,
  type OdulBolumu,
  type Sekme,
  type YonetimBolumu,
} from "./veri/gezinme";
import Giris from "./ekranlar/Giris";
import Ana from "./ekranlar/Ana";
import Sohbet from "./ekranlar/Sohbet";
import Etkinlikler from "./ekranlar/Etkinlikler";
import Topluluk from "./ekranlar/Topluluk";
import Asistan from "./ekranlar/Asistan";
import Oduller from "./ekranlar/Oduller";
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
// Notlar: dosya yükleme ve doğrulama pencereleriyle birlikte, sekme açılınca iner.
const Notlar = lazy(() => import("./ekranlar/Notlar"));

/** <site>/isletme — giriş istemez; kasadaki çalışan kendi telefonunda açar. */
const ISLETME_SAYFASI =
  typeof location !== "undefined" && /^\/isletme\/?$/.test(location.pathname);

/**
 * Gezinme çubuğu: dört sekme, ortada tarama.
 *
 * Etkinlikte ayakta, tek elle, kalabalıkta QR okutan kişi için tarama her
 * ekrandan TEK dokunuş uzakta ve başparmağın doğal durduğu yerde: çubuğun
 * ortasında. Sekme değil, eylem: basınca tarayıcı açılır, bulunduğun ekran
 * değişmez.
 */
const SEKMELER: { anahtar: Sekme; ad: string; simge: SimgeAdi }[] = [
  { anahtar: "ana", ad: "Ana", simge: "ev" },
  { anahtar: "etkinlik", ad: "Etkinlikler", simge: "etkinlik" },
  { anahtar: "notlar", ad: "Notlar", simge: "kitap" },
  { anahtar: "odul", ad: "Ödüller", simge: "odul" },
];

/**
 * Yönetim görünümünde çubuk: aynı dört yer, yöneticinin işine göre.
 * "Ana" yapılacaklar paneline, "Ödüller" yönetim ekranına dönüşür; ortada
 * tarama yerine PERDE QR — etkinlikte yöneticinin en sık yaptığı iş QR
 * göstermek, okutmak değil.
 */
const SEKMELER_YONETIM: typeof SEKMELER = [
  { anahtar: "ana", ad: "Panel", simge: "grafik" },
  { anahtar: "etkinlik", ad: "Etkinlikler", simge: "etkinlik" },
  { anahtar: "odul", ad: "Yönetim", simge: "ayar" },
  { anahtar: "topluluk", ad: "Topluluk", simge: "topluluk" },
];

/** Çubuktaki sütun: tarama 2. sütunda. Sekme çubukta yoksa (üyede Topluluk) -1. */
function sutun(sekmeler: typeof SEKMELER, s: Sekme) {
  const i = sekmeler.findIndex((x) => x.anahtar === s);
  return i < 0 ? -1 : i < 2 ? i : i + 1;
}

/** Eski ekranın geri çekilme süresi. temel.css → .sahne[data-asama="cik"] ile aynı. */
const CIKIS_MS = 200;

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
 * Sekmeler arası sinematik geçiş.
 *
 * Gösterge yeni sekmeye HEMEN kayar (kullanıcı tıklamasının karşılığını
 * anında görsün); içerik ise önce geri çekilir, sonra yenisi öğelerini
 * sırayla getirir. Hızlı art arda tıklamada son tıklanan kazanır.
 */
function Ekranlar() {
  const { gorunum } = useGorunum();
  const yonetimde = gorunum === "yonetim";
  const [hedef, setHedef] = useState<Gorunum>("ana");
  const [gorunen, setGorunen] = useState<Gorunum>("ana");
  const [asama, setAsama] = useState<"gir" | "cik">("gir");
  const [odulBolumu, setOdulBolumu] = useState<OdulBolumu | undefined>(undefined);
  const [asistanSorusu, setAsistanSorusu] = useState<string | undefined>(undefined);
  const [tarama, setTarama] = useState(false);
  const [perde, setPerde] = useState(false);
  // HUB bir görünüm: açık bırakılırsa uygulama bir dahaki açılışta HUB'da açılır.
  const [hubAcik, setHubAcik] = useState(hubTercihi);
  const [yonetimBolumu, setYonetimBolumu] = useState<YonetimBolumu>("ozet");
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Zamanlayıcı içinden okunacak güncel görünüm (durum güncelleyicisinde yan etki olmasın).
  const gorunenRef = useRef<Gorunum>("ana");
  useEffect(() => { gorunenRef.current = gorunen; }, [gorunen]);

  const git = useCallback<Gezinme["git"]>((g, secenek) => {
    setHedef(g);
    if (g === "odul") {
      setOdulBolumu(secenek?.bolum);
      setYonetimBolumu(secenek?.yonetim ?? "ozet");
    }
    if (g === "asistan") setAsistanSorusu(secenek?.soru);
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    if (gorunenRef.current === g) {
      // Aynı ekran (belki yalnızca bölüm değişti) ya da çıkış yarıda kesildi.
      setAsama("gir");
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGorunen(g);
      return;
    }
    setAsama("cik");
    zamanlayici.current = setTimeout(() => {
      setGorunen(g);
      setAsama("gir");
    }, CIKIS_MS);
  }, []);

  const tara = useCallback(() => setTarama(true), []);
  const hubAc = useCallback(() => { hubTercihiYaz(true); setHubAcik(true); }, []);

  // Görünüm değişince (üye ↔ yönetim) başa dön: aynı sekme artık başka bir ekran.
  const ilkGorunum = useRef(gorunum);
  useEffect(() => {
    if (ilkGorunum.current === gorunum) return;
    ilkGorunum.current = gorunum;
    git("ana");
  }, [gorunum, git]);
  const gezinme = useMemo(() => ({ git, tara, hubAc }), [git, tara, hubAc]);

  useEffect(() => () => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
  }, []);

  const secili = UST_SEKME[hedef];
  const sekmeler = yonetimde ? SEKMELER_YONETIM : SEKMELER;

  return (
    <GezinmeBaglami.Provider value={gezinme}>
      <div className="kabuk">
        <main className="sahne" data-asama={asama} key={gorunen}>
          {gorunen === "ana" && (yonetimde
            ? <Suspense fallback={<Acilis />}><Panel /></Suspense>
            : <Ana />)}
          {gorunen === "asistan" && <Asistan ilkSoru={asistanSorusu} onGeri={() => git("ana")} />}
          {gorunen === "etkinlik" && <Etkinlikler />}
          {gorunen === "odul" && (yonetimde
            ? <Suspense fallback={<Acilis />}><YonetimSayfasi gomulu ilkBolum={yonetimBolumu} /></Suspense>
            : <Oduller bolum={odulBolumu} />)}
          {gorunen === "notlar" && <Suspense fallback={<Acilis />}><Notlar /></Suspense>}
          {gorunen === "topluluk" && <Topluluk />}
          {gorunen === "sohbet" && <Sohbet onGeri={() => git("topluluk")} />}
        </main>

        <nav
          className="gezinme cam"
          aria-label="Ana gezinme"
          style={{ "--i": Math.max(0, sutun(sekmeler, secili)), "--adet": 5 } as CSSProperties}
          data-gosterge={sutun(sekmeler, secili) < 0 ? "yok" : undefined}
        >
          <span className="gezinme-gosterge" aria-hidden="true" />
          {/* Yalnızca masaüstü kenar çubuğunda görünür. */}
          <div className="gezinme-marka" aria-hidden="true">
            <img src="/logo-128.webp" alt="" width={32} height={32} />
            <span><b>YAZVEB</b><small>Yapay Zekâ ve Veri Bilimi</small></span>
          </div>
          {sekmeler.slice(0, 2).map((s) => <SekmeDugmesi key={s.anahtar} s={s} secili={secili} git={git} />)}
          <button
            className="gezinme-tara"
            onClick={yonetimde ? () => setPerde(true) : tara}
            aria-label={yonetimde ? "Perdeye QR yansıt" : "QR tara ya da kısa kod gir"}
            data-ipucu={yonetimde ? "Perde QR" : "QR tara"}
            data-ipucu-yon="sag"
          >
            <span className="gezinme-tara-yuz">
              <Simge ad={yonetimde ? "qr" : "tara"} boyut={22} />
              <span className="gezinme-tara-etiket">{yonetimde ? "Perde QR" : "QR tara"}</span>
            </span>
          </button>
          {sekmeler.slice(2).map((s) => <SekmeDugmesi key={s.anahtar} s={s} secili={secili} git={git} />)}
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

function SekmeDugmesi({ s, secili, git }: {
  s: (typeof SEKMELER)[number];
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
