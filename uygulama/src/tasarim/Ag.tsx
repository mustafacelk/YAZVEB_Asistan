import { memo } from "react";

/**
 * Süsleme: yapay sinir ağını anımsatan düğüm ve bağlantılar.
 *
 * Topluluğun konusunu tek bakışta söyleyen tek görsel dil bu; fotoğraf ya da
 * hazır çizim yok. Bilerek sade: ince çizgiler, yavaşça nabız atan birkaç
 * düğüm. Hiçbir bilgi taşımaz (aria-hidden), hareket azaltma tercihinde durur.
 * Koordinatlar sabit: her açılışta aynı, ekran okuyucuya ve düzene yük yok.
 */
const DUGUMLER: [number, number][] = [
  [18, 62], [46, 30], [52, 88], [84, 58], [112, 22], [118, 96], [150, 60], [176, 30], [182, 92], [210, 58],
];
const BAGLAR: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [3, 4], [3, 5], [4, 6], [5, 6], [6, 7], [6, 8], [7, 9], [8, 9], [2, 5],
];

function Ag({ className }: { className?: string }) {
  return (
    <svg className={"ag" + (className ? " " + className : "")} viewBox="0 0 228 118" aria-hidden="true" focusable="false">
      <g className="ag-baglar">
        {BAGLAR.map(([a, b], i) => (
          <line key={i} x1={DUGUMLER[a][0]} y1={DUGUMLER[a][1]} x2={DUGUMLER[b][0]} y2={DUGUMLER[b][1]}
                style={{ ["--i" as string]: i }} />
        ))}
      </g>
      <g className="ag-dugumler">
        {DUGUMLER.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3.2 : 2.2} style={{ ["--i" as string]: i }} />
        ))}
      </g>
    </svg>
  );
}

export default memo(Ag);
