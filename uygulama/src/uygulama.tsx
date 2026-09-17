import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { sorun, yapilandirildi } from "./veri/supabase";
import { OturumSaglayici, useOturum } from "./veri/oturum";
import {
  GezinmeBaglami,
  odulDegisti,
  UST_SEKME,
  type Gezinme,
  type Gorunum,
  type OdulBolumu,
  type Sekme,
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
  { anahtar: "odul", ad: "Ödüller", simge: "odul" },
  { anahtar: "topluluk", ad: "Topluluk", simge: "topluluk" },
];

/** Çubuktaki sütun sırası: tarama 2. sütunda. */
const SUTUN: Record<Sekme, number> = { ana: 0, etkinlik: 1, odul: 3, topluluk: 4 };

/** Eski ekranın geri çekilme süresi. temel.css → .sahne[data-asama="cik"] ile aynı. */
const CIKIS_MS = 200;

export default function Uygulama() {
  return (
    <>
      <div className="atmosfer" aria-hidden="true" />
      {yapilandirildi ? (
        <OturumSaglayici>
          <Kabuk />
        </OturumSaglayici>
      ) : (
        <Yapilandirma />
      )}
    </>
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
  const [hedef, setHedef] = useState<Gorunum>("ana");
  const [gorunen, setGorunen] = useState<Gorunum>("ana");
  const [asama, setAsama] = useState<"gir" | "cik">("gir");
  const [odulBolumu, setOdulBolumu] = useState<OdulBolumu | undefined>(undefined);
  const [tarama, setTarama] = useState(false);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Zamanlayıcı içinden okunacak güncel görünüm (durum güncelleyicisinde yan etki olmasın).
  const gorunenRef = useRef<Gorunum>("ana");
  useEffect(() => { gorunenRef.current = gorunen; }, [gorunen]);

  const git = useCallback<Gezinme["git"]>((g, secenek) => {
    setHedef(g);
    if (g === "odul") setOdulBolumu(secenek?.bolum);
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
  const gezinme = useMemo(() => ({ git, tara }), [git, tara]);

  useEffect(() => () => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
  }, []);

  const secili = UST_SEKME[hedef];

  return (
    <GezinmeBaglami.Provider value={gezinme}>
      <div className="kabuk">
        <main className="sahne" data-asama={asama} key={gorunen}>
          {gorunen === "ana" && <Ana />}
          {gorunen === "asistan" && <Asistan onGeri={() => git("ana")} />}
          {gorunen === "etkinlik" && <Etkinlikler />}
          {gorunen === "odul" && <Oduller bolum={odulBolumu} />}
          {gorunen === "topluluk" && <Topluluk />}
          {gorunen === "sohbet" && <Sohbet onGeri={() => git("topluluk")} />}
        </main>

        <nav
          className="gezinme cam"
          aria-label="Ana gezinme"
          style={{ "--i": SUTUN[secili], "--adet": 5 } as CSSProperties}
        >
          <span className="gezinme-gosterge" aria-hidden="true" />
          {SEKMELER.slice(0, 2).map((s) => <SekmeDugmesi key={s.anahtar} s={s} secili={secili} git={git} />)}
          <button
            className="gezinme-tara"
            onClick={tara}
            aria-label="QR tara ya da kısa kod gir"
            data-ipucu="QR tara"
            data-ipucu-yon="sag"
          >
            <span className="gezinme-tara-yuz"><Simge ad="tara" boyut={22} /></span>
          </button>
          {SEKMELER.slice(2).map((s) => <SekmeDugmesi key={s.anahtar} s={s} secili={secili} git={git} />)}
        </nav>

        {tarama && (
          <Tarayici
            mod={{ tur: "gorev" }}
            onKapat={() => setTarama(false)}
            onDegisti={odulDegisti}
          />
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
