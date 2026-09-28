import { useMemo, type CSSProperties } from "react";
import { girisAlintisi, type AlintiSeti } from "../veri/alintilar";
import Ag from "./Ag";

/**
 * Girişte bir söz — kelime kelime, yumuşakça belirir; ardından sahibi.
 *
 * Bekletmez: ekranın geri kalanı hemen kullanılabilir, söz yalnızca yerinde
 * açılır (≈1 sn). Her açılışta sıradaki söz (bkz. veri/alintilar.ts).
 * Hareket azaltma tercihinde animasyonsuz görünür.
 *
 * `yalin`: kart değil, selamlamanın altında sessiz bir satır (üye Ana'sı).
 * Kartlı biçim yönetim paneli ve işletme sayfasında kalır.
 */
export default function AlintiKarti({ set, className, style, yalin = false }: {
  set: AlintiSeti;
  className?: string;
  style?: CSSProperties;
  yalin?: boolean;
}) {
  const alinti = useMemo(() => girisAlintisi(set), [set]);
  const kelimeler = alinti.soz.split(" ");

  return (
    <figure className={"alinti" + (yalin ? " yalin" : "") + (className ? " " + className : "")} data-set={set} style={style}>
      {!yalin && <Ag className="alinti-ag" />}
      {!yalin && (
        <svg className="alinti-isaret" viewBox="0 0 32 24" aria-hidden="true" focusable="false">
          <path d="M0 24V14C0 6 4.5 1.2 12 0l1.4 3.4C9 4.8 6.8 7.6 6.6 11H12v13H0zm18 0V14c0-8 4.5-12.8 12-14l1.4 3.4C27 4.8 24.8 7.6 24.6 11H30v13H18z" />
        </svg>
      )}
      <blockquote>
        <p>
          {kelimeler.map((k, i) => (
            <span key={i} className="alinti-kelime" style={{ ["--i" as string]: i }}>{k}{" "}</span>
          ))}
        </p>
      </blockquote>
      <figcaption style={{ ["--gecikme" as string]: `${kelimeler.length * 45 + 250}ms` }}>
        <span className="alinti-cizgi" aria-hidden="true" />
        {alinti.kim}{alinti.not ? <span className="soluk"> · {alinti.not}</span> : null}
      </figcaption>
    </figure>
  );
}
