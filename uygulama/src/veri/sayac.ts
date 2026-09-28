import { useEffect, useRef, useState } from "react";

/** Sayı değişince yumuşakça sayar (az hareket tercihinde anında). */
export function useSayac(hedef: number) {
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
