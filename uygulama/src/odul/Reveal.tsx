import { useEffect, useState } from "react";
import Simge, { odulIkonu } from "../tasarim/Simge";
import { tarih, titret } from "../veri/odul";

type Kazanim = {
  id: string;
  sponsor: string;
  baslik: string;
  tur: string;
  ikon: string;
  aciklama: string | null;
  kod: string;
  son_kullanma: string;
};

type Asama = "karar" | "gerilim" | "kapanis" | "goster";

/**
 * Sürpriz ödül açılışı — uygulamanın en özel anı.
 *
 *   karar    ekran kısa süre kararır                 150 ms
 *   gerilim  kapalı kart + "YAZVEB ödülü", bir nefes  450 ms
 *   kapanis  kart yatayda kapanır                    150 ms
 *   goster   ödül yüzü açılır, "Ödüllerime eklendi"
 *
 * NEDEN BU KADAR KISA
 * ───────────────────
 * İlk sürüm 1,55 saniye bekletiyordu. Beklenti anı değerlidir ama sonuç
 * zaten sunucuda belli; uzatılmış bekleme yapay gerilimdir ve kasada ya da
 * kalabalıkta ayakta duran kişiyi oyalar. Toplam 750 ms: merak hissi kalır,
 * bekletme kalmaz. Ekrana dokunmak animasyonu anında bitirir.
 *
 * NEDEN 3D ÇEVİRME DEĞİL
 * ──────────────────────
 * İlk sürüm kartı `rotateY` + `backface-visibility` ile çeviriyordu. Önizlemede
 * görüldü: Chrome opaklık animasyonu sırasında 3D bağlamı düzleştiriyor ve
 * ödül yüzü "gerilim" aşamasında tersten görünüyordu — sürpriz açılmadan
 * bozuluyordu. Artık ödül yüzü, açılış anına kadar DOM'da HİÇ yok. Hiçbir
 * tarayıcı tuhaflığı gösteremez.
 *
 * Konfeti, parlama, titreşen yazı yok. Az hareket tercihinde doğrudan sonuç.
 */
export default function Reveal({
  kazanim,
  onGoster,
  onKapat,
}: {
  kazanim: Kazanim;
  onGoster: () => void;
  onKapat: () => void;
}) {
  const azHareket = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [asama, setAsama] = useState<Asama>(azHareket ? "goster" : "karar");

  useEffect(() => {
    if (azHareket) return;
    const zamanlar = [
      setTimeout(() => setAsama("gerilim"), 150),
      setTimeout(() => setAsama("kapanis"), 600),
      setTimeout(() => { setAsama((a) => (a === "goster" ? a : "goster")); titret(22); }, 750),
    ];
    return () => zamanlar.forEach(clearTimeout);
  }, [azHareket]);

  const acik = asama === "goster";

  return (
    <div className="reveal" data-asama={asama} role="dialog" aria-modal="true"
         aria-label={acik ? `${kazanim.sponsor}: ${kazanim.baslik}` : "Ödül açılıyor"}
         onClick={() => { if (!acik) setAsama("goster"); }}>
      <div className="reveal-perde" aria-hidden="true" />

      <p className="reveal-ust etiket" aria-hidden={acik}>YAZVEB ödülü</p>

      <div className="reveal-sahne">
        {acik ? (
          <div className="reveal-kart reveal-on">
            <span className="etiket">{kazanim.sponsor}</span>
            <div className="reveal-ikon"><Simge ad={odulIkonu(kazanim.ikon)} boyut={44} /></div>
            <h2>{kazanim.baslik}</h2>
            {kazanim.aciklama && <p className="soluk">{kazanim.aciklama}</p>}
            <p className="etiket rakam">Son kullanım · {tarih(kazanim.son_kullanma)}</p>
            <p className="reveal-nasil soluk">İşletmede "Ödülü göster"e dokun, ekranı çalışana göster.</p>
          </div>
        ) : (
          <div className="reveal-kart reveal-arka" aria-hidden="true">
            <img src="/logo-128.webp" alt="" width={56} height={56} />
          </div>
        )}
      </div>

      <div className="reveal-alt" aria-live="polite">
        {acik && (
          <>
            <p className="reveal-eklendi"><Simge ad="tik" boyut={16} /> Ödüllerime eklendi</p>
            <div className="basari-dugmeleri">
              <button className="dugme birincil genis" onClick={onGoster}>Ödülü göster</button>
              <button className="dugme genis" onClick={onKapat}>Sonra kullanırım</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
