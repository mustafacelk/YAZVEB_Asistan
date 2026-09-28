import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import Simge, { type SimgeAdi } from "./Simge";

/**
 * Dünyaların ortak yapı taşları (TASARIM.md §3).
 *
 * Her ekran aynı hiyerarşiyi izler: önce amaç (başlık + tek cümle), sonra
 * tek ana eylem, sonra destek bilgisi. Varsayılan içerik birimi kart değil
 * SATIR: ilgili satırlar tek bir yüzeyde, ince çizgilerle ayrılır.
 */

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/** Dünyanın giriş başlığı: etiket, başlık, tek cümle, en fazla bir eylem. */
export function DunyaBasi({ etiket, baslik, aciklama, eylem }: {
  etiket: ReactNode;
  baslik: string;
  aciklama?: ReactNode;
  eylem?: ReactNode;
}) {
  return (
    <header className="dunya-basi">
      <div className="dunya-basi-metin">
        <span className="etiket gir">{etiket}</span>
        <h1 className="gir" style={kademe(1)}>{baslik}</h1>
        {aciklama && <p className="dunya-aciklama gir" style={kademe(2)}>{aciklama}</p>}
      </div>
      {eylem && <div className="dunya-basi-eylem gir" style={kademe(2)}>{eylem}</div>}
    </header>
  );
}

/**
 * Alt sayfa başlığı: solda geri, üstte hangi dünyada olduğun. Açılınca
 * başlığa odaklanır; ekran okuyucu yeni sayfaya geldiğini duyar.
 */
export function AltBasi({ ust, baslik, aciklama, onGeri, eylem }: {
  ust: string;
  baslik: string;
  aciklama?: ReactNode;
  onGeri: () => void;
  eylem?: ReactNode;
}) {
  const baslikRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { baslikRef.current?.focus({ preventScroll: true }); }, [baslik]);
  return (
    <header className="alt-basi">
      <button className="alt-geri gir" onClick={onGeri} aria-label={`${ust} sayfasına dön`}>
        <Simge ad="geri" boyut={18} />
        <span>{ust}</span>
      </button>
      <div className="alt-basi-satir">
        <div className="dunya-basi-metin">
          <h1 ref={baslikRef} tabIndex={-1} className="gir" style={kademe(1)}>{baslik}</h1>
          {aciklama && <p className="dunya-aciklama gir" style={kademe(2)}>{aciklama}</p>}
        </div>
        {eylem && <div className="dunya-basi-eylem gir" style={kademe(2)}>{eylem}</div>}
      </div>
    </header>
  );
}

/** Etiketli bölüm; `sag` bölüm başlığının sağında küçük bir eylem ya da sayı. */
export function Bolum({ etiket, sag, children, className, sira = 3 }: {
  etiket?: ReactNode;
  sag?: ReactNode;
  children: ReactNode;
  className?: string;
  sira?: number;
}) {
  return (
    <section className={"dunya-bolum gir" + (className ? " " + className : "")} style={kademe(sira)}>
      {(etiket || sag) && (
        <div className="dunya-bolum-basi">
          {etiket && <span className="etiket">{etiket}</span>}
          {sag}
        </div>
      )}
      {children}
    </section>
  );
}

/** Aynı yüzeyi paylaşan satırlar (ayarlar listesi gibi). */
export function Satirlar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={"satirlar" + (className ? " " + className : "")}>{children}</div>;
}

/**
 * Liste satırı. `onClick` varsa düğme olur ve sağda ok belirir. `canli`
 * satırın önünde nabız atan bir nokta: şu an olan bir şey.
 */
export function Satir({ simge, baslik, aciklama, deger, onClick, canli, eylem, tehlike, etiketi }: {
  simge?: SimgeAdi | ReactNode;
  baslik: ReactNode;
  aciklama?: ReactNode;
  /** Sağda kısa değer: sayı, durum. */
  deger?: ReactNode;
  onClick?: () => void;
  canli?: boolean;
  /** Satırın kendi eylemi (ör. "QR okut"); satırın geri kalanı yine tıklanabilir olabilir. */
  eylem?: ReactNode;
  tehlike?: boolean;
  /** Ekran okuyucu için ek açıklama. */
  etiketi?: string;
}) {
  // "Şu an" işareti simgenin üstünde nabız atar; başlığın akışını bozmaz.
  const ikon = typeof simge === "string"
    ? <span className="satir-ikon" data-canli={canli || undefined} aria-hidden="true"><Simge ad={simge as SimgeAdi} boyut={18} /></span>
    : simge ? <span className="satir-ikon" data-canli={canli || undefined} aria-hidden="true">{simge}</span> : null;
  const govde = (
    <>
      {ikon}
      <span className="satir-govde">
        <span className="satir-baslik">{baslik}</span>
        {aciklama && <span className="satir-aciklama">{aciklama}</span>}
      </span>
      {deger !== undefined && deger !== null && deger !== false && <span className="satir-deger">{deger}</span>}
      {onClick && !eylem && <Simge ad="ileri" boyut={16} />}
    </>
  );
  return (
    <div className={"satir-dunya" + (tehlike ? " tehlike" : "") + (eylem ? " eylemli" : "")}>
      {onClick
        ? <button className="satir-dugme" onClick={onClick} aria-label={etiketi}>{govde}</button>
        : <div className="satir-dugme durgun" aria-label={etiketi}>{govde}</div>}
      {eylem && <div className="satir-eylem">{eylem}</div>}
    </div>
  );
}

/** Boş durum: ne olmadığı, neden ve (varsa) tek bir eylem. */
export function Bos({ simge, baslik, aciklama, eylem }: {
  simge: SimgeAdi;
  baslik: string;
  aciklama?: ReactNode;
  eylem?: ReactNode;
}) {
  return (
    <div className="bos gir">
      <Simge ad={simge} boyut={28} />
      <b>{baslik}</b>
      {aciklama && <span>{aciklama}</span>}
      {eylem}
    </div>
  );
}

/** Yükleniyor iskeleti: satır biçiminde, içerik gelince yerini alır. */
export function SatirIskeleti({ adet = 3 }: { adet?: number }) {
  return (
    <div className="satirlar" aria-label="Yükleniyor" role="status">
      {Array.from({ length: adet }, (_, i) => (
        <div key={i} className="satir-dunya">
          <div className="satir-dugme durgun">
            <span className="satir-ikon iskelet-kutu" />
            <span className="satir-govde">
              <span className="iskelet" style={{ width: `${60 - i * 12}%` }} />
              <span className="iskelet ince" style={{ width: `${40 - i * 6}%` }} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
