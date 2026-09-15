/**
 * Uygulamanın tek ikon seti.
 *
 * Hepsi 24'lük ızgarada, 1.5 çizgi kalınlığında, yuvarlak uçlu. Boyut
 * dışarıdan `boyut` ile verilir; renk `currentColor`'dan gelir. Emoji ya da
 * karışık kaynaklı ikon kullanılmaz — optik ağırlıkları tutmuyor.
 */

const YOLLAR = {
  asistan: (
    <>
      <circle cx="12" cy="12" r="7.25" />
      <circle cx="12" cy="12" r="2.25" />
    </>
  ),
  sohbet: (
    <>
      <path d="M4.75 6.75a2 2 0 0 1 2-2h10.5a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H10l-4 3.25v-3.25h0.75" />
      <path d="M8.75 9.25h6.5M8.75 12.25h4" />
    </>
  ),
  etkinlik: (
    <>
      <rect x="4.75" y="5.75" width="14.5" height="13.5" rx="2" />
      <path d="M4.75 10.25h14.5M8.75 3.75v3M15.25 3.75v3" />
    </>
  ),
  topluluk: (
    <>
      <circle cx="9.25" cy="9" r="3" />
      <path d="M3.75 18.75c.6-2.9 2.8-4.5 5.5-4.5s4.9 1.6 5.5 4.5" />
      <path d="M15.25 6.1a3 3 0 0 1 0 5.8M17.25 14.6c1.5.6 2.6 2 3 4.15" />
    </>
  ),
  mikrofon: (
    <>
      <rect x="9" y="3.75" width="6" height="10.5" rx="3" />
      <path d="M6 11.25a6 6 0 0 0 12 0M12 17.25v3" />
    </>
  ),
  gonder: <path d="M12 18.5V5.75M6.75 11 12 5.75 17.25 11" />,
  durdur: <rect x="7.75" y="7.75" width="8.5" height="8.5" rx="1.5" />,
  sesAcik: (
    <>
      <path d="M4.75 9.75h3l4.5-3.75v12l-4.5-3.75h-3z" />
      <path d="M15.75 9a4.25 4.25 0 0 1 0 6M18.25 6.75a7.5 7.5 0 0 1 0 10.5" />
    </>
  ),
  sesKapali: (
    <>
      <path d="M4.75 9.75h3l4.5-3.75v12l-4.5-3.75h-3z" />
      <path d="m16 9.75 4.5 4.5M20.5 9.75 16 14.25" />
    </>
  ),
  arti: <path d="M12 5.75v12.5M5.75 12h12.5" />,
  kalem: <path d="M14.75 5.75l3.5 3.5M5.75 18.25l.9-4.1 9.3-9.3a1.75 1.75 0 0 1 2.5 0l1 1a1.75 1.75 0 0 1 0 2.5l-9.3 9.3z" />,
  cop: (
    <>
      <path d="M5.25 7.25h13.5M9.75 7.25V5.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v1.75" />
      <path d="M7 7.25l.8 11a1.5 1.5 0 0 0 1.5 1.5h5.4a1.5 1.5 0 0 0 1.5-1.5l.8-11" />
    </>
  ),
  kapat: <path d="M7 7l10 10M17 7 7 17" />,
  geri: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  yeni: (
    <>
      <path d="M12.25 4.75H7.5a2.75 2.75 0 0 0-2.75 2.75v9a2.75 2.75 0 0 0 2.75 2.75h9a2.75 2.75 0 0 0 2.75-2.75v-4.75" />
      <path d="M17.5 4.25l2.25 2.25-7 7-3 .75.75-3z" />
    </>
  ),
  konum: (
    <>
      <path d="M12 20.25s-6-5.2-6-10.25a6 6 0 0 1 12 0c0 5.05-6 10.25-6 10.25z" />
      <circle cx="12" cy="10" r="2" />
    </>
  ),
  cikis: <path d="M14.25 4.75h3a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2h-3M10.25 8.25 6.5 12l3.75 3.75M6.75 12h8.5" />,
} as const;

export type SimgeAdi = keyof typeof YOLLAR;

export default function Simge({ ad, boyut = 20 }: { ad: SimgeAdi; boyut?: number }) {
  return (
    <svg
      className="simge"
      width={boyut}
      height={boyut}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {YOLLAR[ad]}
    </svg>
  );
}
