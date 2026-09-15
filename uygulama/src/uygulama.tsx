import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { sorun, yapilandirildi } from "./veri/supabase";
import { OturumSaglayici, useOturum } from "./veri/oturum";
import Giris from "./ekranlar/Giris";
import Sohbet from "./ekranlar/Sohbet";
import Etkinlikler from "./ekranlar/Etkinlikler";
import Topluluk from "./ekranlar/Topluluk";
import Asistan from "./ekranlar/Asistan";
import Simge, { type SimgeAdi } from "./tasarim/Simge";

type Sekme = "asistan" | "sohbet" | "etkinlik" | "topluluk";

const SEKMELER: { anahtar: Sekme; ad: string; simge: SimgeAdi }[] = [
  { anahtar: "asistan", ad: "Asistan", simge: "asistan" },
  { anahtar: "sohbet", ad: "Sohbet", simge: "sohbet" },
  { anahtar: "etkinlik", ad: "Etkinlikler", simge: "etkinlik" },
  { anahtar: "topluluk", ad: "Topluluk", simge: "topluluk" },
];

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
  const [secili, setSecili] = useState<Sekme>("asistan");
  const [gorunen, setGorunen] = useState<Sekme>("asistan");
  const [asama, setAsama] = useState<"gir" | "cik">("gir");
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  const git = useCallback((s: Sekme) => {
    setSecili(s);
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    const azHareket = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (azHareket) {
      setGorunen(s);
      return;
    }
    setAsama("cik");
    zamanlayici.current = setTimeout(() => {
      setGorunen(s);
      setAsama("gir");
    }, CIKIS_MS);
  }, []);

  useEffect(() => () => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
  }, []);

  const sira = SEKMELER.findIndex((s) => s.anahtar === secili);

  return (
    <div className="kabuk">
      <main className="sahne" data-asama={asama} key={gorunen}>
        {gorunen === "asistan" && <Asistan />}
        {gorunen === "sohbet" && <Sohbet />}
        {gorunen === "etkinlik" && <Etkinlikler />}
        {gorunen === "topluluk" && <Topluluk />}
      </main>

      <nav
        className="gezinme cam"
        aria-label="Ana gezinme"
        style={{ "--i": sira } as CSSProperties}
      >
        <span className="gezinme-gosterge" aria-hidden="true" />
        {SEKMELER.map((s) => (
          <button
            key={s.anahtar}
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
        ))}
      </nav>
    </div>
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
