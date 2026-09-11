import { useState } from "react";
import { sorun, yapilandirildi } from "./veri/supabase";
import { OturumSaglayici, useOturum } from "./veri/oturum";
import Giris from "./ekranlar/Giris";
import Sohbet from "./ekranlar/Sohbet";
import Etkinlikler from "./ekranlar/Etkinlikler";
import Topluluk from "./ekranlar/Topluluk";
import Asistan from "./ekranlar/Asistan";

type Sekme = "asistan" | "sohbet" | "etkinlik" | "topluluk";

const SEKMELER: { anahtar: Sekme; ad: string; simge: string }[] = [
  { anahtar: "asistan", ad: "Asistan", simge: "◉" },
  { anahtar: "sohbet", ad: "Sohbet", simge: "◍" },
  { anahtar: "etkinlik", ad: "Etkinlik", simge: "◆" },
  { anahtar: "topluluk", ad: "Topluluk", simge: "◎" },
];

export default function Uygulama() {
  if (!yapilandirildi) return <Yapilandirma />;
  return (
    <OturumSaglayici>
      <Kabuk />
    </OturumSaglayici>
  );
}

function Kabuk() {
  const { oturum, profil, yukleniyor } = useOturum();
  const [sekme, setSekme] = useState<Sekme>("asistan");

  if (yukleniyor) return <Acilis />;
  if (!oturum) return <Giris />;
  // Oturum var ama profil henüz gelmediyse (tetikleyici yeni yazıyor olabilir)
  // boş ekran yerine açılış göster.
  if (!profil) return <Acilis not="Profil hazırlanıyor…" />;

  return (
    <div className="kabuk">
      <main className="govde">
        {sekme === "asistan" && <Asistan />}
        {sekme === "sohbet" && <Sohbet />}
        {sekme === "etkinlik" && <Etkinlikler />}
        {sekme === "topluluk" && <Topluluk />}
      </main>

      <nav className="alt-cubuk" aria-label="Ana gezinme">
        {SEKMELER.map((s) => (
          <button
            key={s.anahtar}
            className={sekme === s.anahtar ? "etkin" : ""}
            onClick={() => setSekme(s.anahtar)}
            aria-current={sekme === s.anahtar ? "page" : undefined}
          >
            <span className="simge" aria-hidden="true">{s.simge}</span>
            <span className="etiket">{s.ad}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Acilis({ not }: { not?: string }) {
  return (
    <div className="acilis">
      <div className="marka-nokta buyuk" />
      <p>{not ?? "YAZVEB"}</p>
    </div>
  );
}

/**
 * Anahtarlar tanımsızken boş beyaz ekran yerine ne yapılacağını söyler.
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
      <div className="giris-kart">
        <div className="marka">
          <span className="marka-nokta" />
          <h1>YAZVEB</h1>
        </div>
        <p className="uyari">
          {sorun === "eksik" ? "Sunucu bağlantısı yapılandırılmamış." : sorun}
        </p>

        {yerel ? (
          <p className="sessiz">
            <code>uygulama/.env</code> dosyasına Supabase panelindeki
            <b> Project Settings → API </b> bölümünden iki değeri yaz:
          </p>
        ) : (
          <p className="sessiz">
            Bu site yayında; <code>.env</code> dosyası yok. Değerleri
            <b> barındırma panelinde </b> (Vercel → Settings → Environment
            Variables) tanımla:
          </p>
        )}

        <pre className="kod">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...`}
        </pre>

        {yerel ? (
          <p className="sessiz ufak-yazi">
            Üstteki <b>Project URL</b>, alttaki <b>Publishable key</b>. İkisini
            karıştırmak kolay; yer değiştirirse uygulama açılır ama hiçbir istek
            çalışmaz.
          </p>
        ) : (
          <p className="sessiz ufak-yazi">
            Değişkenleri ekledikten sonra <b>yeniden dağıtman şart</b>. Bu
            değerler derleme sırasında pakete gömülür; sonradan eklemek
            yayındaki paketi değiştirmez.
          </p>
        )}

        <p className="sessiz">
          Ayrıntılar için <code>uygulama/README.md</code>.
        </p>
      </div>
    </div>
  );
}
