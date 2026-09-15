import { memo, useEffect, useRef, useState } from "react";
import { kureKur, type Durum, type KureDenetim } from "./sahne";
import { seviye } from "./olcer";

/**
 * Küre tuvali. Durum değişikliği React'ten gelir ama yalnızca bir
 * değişken atar — tuval yeniden kurulmaz, kare döngüsü kesilmez.
 *
 * TUVAL NEDEN JSX'TE DEĞİL
 * ────────────────────────
 * Temizlikte WebGL bağlamı bilerek bırakılıyor (tarayıcı aynı anda ancak
 * birkaç bağlam tutar; sekme değiştikçe birikmesin). Bırakılmış bağlamı
 * olan bir tuvalden bir daha çizim alınamaz. React aynı tuvali yeniden
 * kullanırsa — geliştirme modundaki çift kurulum ya da hızlı yeniden
 * bağlanma — küre sessizce ölü kalıyordu. Her kurulum kendi tuvalini yaratır.
 *
 * WebGL yoksa aynı yerde durağan bir halka görünür; boş bir delik kalmaz.
 */
function Kure({
  durum,
  olcek = 1,
  className,
}: {
  durum: Durum;
  /** Görünen boyut oranı; CSS ile küçültüldüğünde nokta boyutu telafi edilir. */
  olcek?: number;
  className?: string;
}) {
  const kutuRef = useRef<HTMLDivElement | null>(null);
  const denetimRef = useRef<KureDenetim | null>(null);
  const durumRef = useRef(durum);
  const olcekRef = useRef(olcek);
  olcekRef.current = olcek;
  const [destekYok, setDestekYok] = useState(false);

  durumRef.current = durum;

  useEffect(() => {
    const kutu = kutuRef.current;
    if (!kutu) return;
    const tuval = document.createElement("canvas");
    kutu.appendChild(tuval);

    const d = kureKur(tuval, seviye);
    if (!d) {
      tuval.remove();
      setDestekYok(true);
      return;
    }
    d.durum(durumRef.current);
    d.olcek(olcekRef.current);
    denetimRef.current = d;
    return () => {
      d.birak();
      tuval.remove();
      denetimRef.current = null;
    };
  }, []);

  useEffect(() => {
    denetimRef.current?.durum(durum);
  }, [durum]);

  useEffect(() => {
    denetimRef.current?.olcek(olcek);
  }, [olcek]);

  return (
    <div
      ref={kutuRef}
      className={"kure" + (className ? " " + className : "")}
      data-durum={durum}
      aria-hidden="true"
    >
      {destekYok && <div className="kure-yedek" />}
    </div>
  );
}

export default memo(Kure);
