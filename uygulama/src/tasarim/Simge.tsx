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

  // ── Ödül sistemi ──
  odul: (
    <>
      <circle cx="12" cy="9.25" r="5" />
      <path d="M9.25 13.5 8 19.75l4-2.25 4 2.25-1.25-6.25" />
    </>
  ),
  qr: (
    <>
      <rect x="4.75" y="4.75" width="5.5" height="5.5" rx="1" />
      <rect x="13.75" y="4.75" width="5.5" height="5.5" rx="1" />
      <rect x="4.75" y="13.75" width="5.5" height="5.5" rx="1" />
      <path d="M13.75 13.75h2.5v2.5M19.25 13.75v.01M13.75 19.25h.01M16.25 19.25h3v-3" />
    </>
  ),
  tara: (
    <>
      <path d="M4.75 8.75v-2a2 2 0 0 1 2-2h2M15.25 4.75h2a2 2 0 0 1 2 2v2M19.25 15.25v2a2 2 0 0 1-2 2h-2M8.75 19.25h-2a2 2 0 0 1-2-2v-2" />
      <path d="M4.75 12h14.5" />
    </>
  ),
  kilit: (
    <>
      <rect x="5.75" y="10.75" width="12.5" height="8.5" rx="2" />
      <path d="M8.75 10.75V8a3.25 3.25 0 0 1 6.5 0v2.75" />
    </>
  ),
  kilitAcik: (
    <>
      <rect x="5.75" y="10.75" width="12.5" height="8.5" rx="2" />
      <path d="M8.75 10.75V8a3.25 3.25 0 0 1 6.25-1.25" />
    </>
  ),
  alev: <path d="M12 20.25c3.2 0 5.25-2.2 5.25-5.1 0-3.4-3-5.4-3.75-8.9-2 1.3-3 3.2-3 5-1-.5-1.6-1.4-1.85-2.5C7.4 10.2 6.75 12 6.75 15.15c0 2.9 2.05 5.1 5.25 5.1z" />,
  yildiz: <path d="m12 4.75 2.2 4.6 5.05.65-3.7 3.5.95 5-4.5-2.45-4.5 2.45.95-5-3.7-3.5 5.05-.65z" />,
  kahve: (
    <>
      <path d="M5.75 9.75h10v4.5a4.5 4.5 0 0 1-4.5 4.5h-1a4.5 4.5 0 0 1-4.5-4.5z" />
      <path d="M15.75 10.75h1a2.25 2.25 0 0 1 0 4.5h-1.25M8.75 4.75v2M12 4.75v2" />
    </>
  ),
  indirim: (
    <>
      <path d="m7.75 16.25 8.5-8.5" />
      <circle cx="8.5" cy="8.5" r="1.75" />
      <circle cx="15.5" cy="15.5" r="1.75" />
    </>
  ),
  hediye: (
    <>
      <rect x="4.75" y="9.25" width="14.5" height="10" rx="1.5" />
      <path d="M12 9.25v10M4.75 13h14.5M12 9.25c-1.5-3.5-5-3.75-5-1.5 0 1.25 2 1.5 5 1.5zm0 0c1.5-3.5 5-3.75 5-1.5 0 1.25-2 1.5-5 1.5z" />
    </>
  ),
  bilet: (
    <>
      <path d="M4.75 8.25a1.5 1.5 0 0 1 1.5-1.5h11.5a1.5 1.5 0 0 1 1.5 1.5v1.5a2.25 2.25 0 0 0 0 4.5v1.5a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5v-1.5a2.25 2.25 0 0 0 0-4.5z" />
      <path d="M14.25 7v10" strokeDasharray="1.5 2" />
    </>
  ),
  kitap: <path d="M12 7.25c-1.75-1.5-4.5-2-7.25-1.5v12c2.75-.5 5.5 0 7.25 1.5 1.75-1.5 4.5-2 7.25-1.5v-12c-2.75-.5-5.5 0-7.25 1.5zm0 0v12" />,
  saat: (
    <>
      <circle cx="12" cy="12" r="7.25" />
      <path d="M12 8.25V12l2.5 1.75" />
    </>
  ),
  tik: <path d="m6.75 12.25 3.5 3.5 7-7.5" />,
  grafik: <path d="M4.75 19.25h14.5M7.75 16V11M12 16V7.5M16.25 16v-3.5" />,
  ayar: (
    <>
      <path d="M4.75 7.75h9.5M17.25 7.75h2M4.75 16.25h2M9.75 16.25h9.5" />
      <circle cx="15.75" cy="7.75" r="1.75" />
      <circle cx="8.25" cy="16.25" r="1.75" />
    </>
  ),
  liste: <path d="M9.25 7.25h10M9.25 12h10M9.25 16.75h10M5 7.25h.01M5 12h.01M5 16.75h.01" />,
  kalkan: <path d="M12 4.75 5.75 7v4.75c0 3.75 2.6 6.6 6.25 7.5 3.65-.9 6.25-3.75 6.25-7.5V7z" />,
  yenile: <path d="M18.5 9.25A7 7 0 0 0 6 7.5L4.75 9.25M5.5 14.75A7 7 0 0 0 18 16.5l1.25-1.75M4.75 5.25v4h4M19.25 18.75v-4h-4" />,
  yazdir: (
    <>
      <path d="M7.75 9.25V4.75h8.5v4.5M7.75 16.25h-2a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h12.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2" />
      <rect x="7.75" y="13.25" width="8.5" height="6" rx="1" />
    </>
  ),
  disBaglanti: <path d="M13.75 4.75h5.5v5.5M19.25 4.75l-8 8M17.25 13.75v4a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-9.5a1.5 1.5 0 0 1 1.5-1.5h4" />,
  klavye: (
    <>
      <rect x="3.75" y="6.75" width="16.5" height="10.5" rx="2" />
      <path d="M7.25 10.25h.01M10.25 10.25h.01M13.25 10.25h.01M16.25 10.25h.01M8.25 13.75h7.5" />
    </>
  ),
  isik: <path d="M12 4.75v2M12 17.25v2M6.9 6.9l1.4 1.4M15.7 15.7l1.4 1.4M4.75 12h2M17.25 12h2M6.9 17.1l1.4-1.4M15.7 8.3l1.4-1.4" />,
} as const;

/** Ödül kalemlerinde yönetimin seçebileceği ikonlar (veritabanındaki `ikon` değerleri). */
export const ODUL_IKONLARI = ["hediye", "kahve", "indirim", "bilet", "kitap", "yildiz"] as const;

/** Sunucudan gelen ikon adını güvenle ikona çevirir; bilinmeyen ad hediye olur. */
export function odulIkonu(ad: string | null | undefined): SimgeAdi {
  return (ODUL_IKONLARI as readonly string[]).includes(ad ?? "") ? (ad as SimgeAdi) : "hediye";
}

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
