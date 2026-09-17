import { createPortal } from "react-dom";
import { useEffect, useState, type CSSProperties } from "react";
import Simge, { odulIkonu } from "../tasarim/Simge";
import { hedefCumlesi, odul, sayi, tarih, type KampanyaDurumu, type Sponsor } from "../veri/odul";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/** Sponsor logosu; yoksa baş harf. Logo sunucuda doğrulanmış raster veri adresidir. */
export function SponsorLogo({ sponsor, boyut = 48 }: { sponsor: Pick<Sponsor, "ad" | "logo">; boyut?: number }) {
  return sponsor.logo ? (
    <img className="sponsor-logo" src={sponsor.logo} alt="" width={boyut} height={boyut} />
  ) : (
    <span className="sponsor-logo sponsor-logo-harf" style={{ width: boyut, height: boyut }} aria-hidden="true">
      {sponsor.ad.slice(0, 1).toLocaleUpperCase("tr")}
    </span>
  );
}

/**
 * Kıtlık dili. Ucuz kırmızı uyarı değil: tek bir ince çizgi, küçük büyük
 * harfli etiket ve SON ÖDÜL'de yavaş bir nefes.
 */
export function KampanyaEtiketi({ k }: { k: KampanyaDurumu }) {
  switch (k.durum) {
    case "yok":
      return <span className="kampanya-etiketi soluk">Kampanya yok</span>;
    case "yakinda":
      return <span className="kampanya-etiketi">Yakında · {tarih(k.baslangic)}</span>;
    case "bitti":
      return <span className="kampanya-etiketi soluk">Kampanya bitti</span>;
    case "tukendi":
      return <span className="kampanya-etiketi" data-kitlik="tukendi">Tükendi</span>;
    case "son":
      return <span className="kampanya-etiketi" data-kitlik="son">Son ödül</span>;
    case "az":
      return <span key={k.kalan} className="kampanya-etiketi" data-kitlik="az">Son {k.kalan} ödül</span>;
    default:
      return (
        <span className="kampanya-etiketi">
          {k.surpriz ? "Sürpriz ödül" : "Ödül"}
          {k.sinirsiz ? "" : ` · ${sayi(k.kalan ?? 0)} kaldı`}
        </span>
      );
  }
}

export function SponsorKarti({ sponsor, sira, onAc }: { sponsor: Sponsor; sira: number; onAc: () => void }) {
  const { kilit, kampanya } = sponsor;
  const ilerleme = kilit.acik ? 1 : kilit.gerekli_xp > 0
    ? Math.min(1, 1 - kilit.eksik_xp / kilit.gerekli_xp) : 0;

  return (
    <button
      className="sponsor-karti gir"
      data-kilitli={!kilit.acik}
      data-kitlik={"durum" in kampanya ? kampanya.durum : "yok"}
      style={kademe(Math.min(sira + 2, 10))}
      onClick={onAc}
      aria-label={`${sponsor.ad}, ${kilit.acik ? "kilit açık" : "kilitli"}`}
    >
      <div className="sponsor-karti-ust">
        <SponsorLogo sponsor={sponsor} />
        <span className="sponsor-kilit" aria-hidden="true">
          <Simge ad={kilit.acik ? "kilitAcik" : "kilit"} boyut={16} />
        </span>
      </div>
      <h3>{sponsor.ad}</h3>
      {kilit.acik ? (
        <KampanyaEtiketi k={kampanya} />
      ) : (
        <>
          <span className="kampanya-etiketi soluk rakam">
            {kilit.eksik_xp > 0 ? `${sayi(kilit.eksik_xp)} XP kaldı` : `${kilit.eksik_etkinlik} etkinlik kaldı`}
          </span>
          <div className="ilerleme-cubugu ince" style={{ ["--oran" as string]: ilerleme }}><i /></div>
        </>
      )}
    </button>
  );
}

export function SponsorDetay({ sponsor: ilk, onKapat, onTara }: {
  sponsor: Sponsor;
  onKapat: () => void;
  onTara: (s: Sponsor) => void;
}) {
  const [sponsor, setSponsor] = useState(ilk);

  // Detay açılınca güncel durum çekilir (görüntüleme de sunucuda sayılır).
  useEffect(() => {
    let gecerli = true;
    odul.sponsorDetay(ilk.id).then((s) => { if (gecerli && s) setSponsor(s); }).catch(() => {});
    return () => { gecerli = false; };
  }, [ilk.id]);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [onKapat]);

  const { kilit, kampanya } = sponsor;
  const aktifKampanya = kampanya.durum === "aktif" || kampanya.durum === "az" || kampanya.durum === "son";
  const taranabilir = kilit.acik && aktifKampanya && "hak" in kampanya && kampanya.hak > 0;

  let engel: string | null = null;
  if (!kilit.acik) engel = hedefCumlesi({ ...kilit, sponsor: sponsor.ad });
  else if (kampanya.durum === "tukendi") engel = "Bu kampanyanın ödülleri bitti. Yeni kampanya açıldığında burada görünür.";
  else if (kampanya.durum === "bitti") engel = "Kampanya sona erdi. Yeni kampanyalar burada görünecek.";
  else if (kampanya.durum === "yok") engel = "Bu sponsorun şu an aktif bir kampanyası yok.";
  else if (kampanya.durum === "yakinda") engel = `Kampanya ${tarih(kampanya.baslangic)} tarihinde başlıyor.`;
  else if ("hak" in kampanya && kampanya.hak === 0) engel = "Bu kampanyadaki hakkını kullandın. Ödülün Ödüllerim'de.";

  return createPortal(
    <div className="katman" onClick={onKapat}>
      <div className="pencere sponsor-detay" role="dialog" aria-modal="true" aria-labelledby="sponsor-baslik"
           onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <div className="sponsor-detay-kimlik">
            <SponsorLogo sponsor={sponsor} boyut={56} />
            <div>
              <h2 id="sponsor-baslik">{sponsor.ad}</h2>
              <span className={"etiket" + (kilit.acik ? " sinyal" : "")}>
                {kilit.acik ? "Kilit açık" : "Kilitli"}
              </span>
            </div>
          </div>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        </div>

        {sponsor.aciklama && <p className="sponsor-aciklama">{sponsor.aciklama}</p>}
        {(sponsor.adres || sponsor.website) && (
          <div className="sponsor-baglantilar">
            {sponsor.adres && <span><Simge ad="konum" boyut={14} /> {sponsor.adres}</span>}
            {sponsor.website && (
              <a href={sponsor.website} target="_blank" rel="noopener noreferrer">
                <Simge ad="disBaglanti" boyut={14} /> {new URL(sponsor.website).hostname}
              </a>
            )}
          </div>
        )}

        {!kilit.acik && (
          <section className="sponsor-bolum">
            <span className="etiket">Kilidi açmak için</span>
            <ul className="kilit-sartlari">
              {kilit.gerekli_xp > 0 && (
                <li data-tamam={kilit.eksik_xp === 0}>
                  <Simge ad={kilit.eksik_xp === 0 ? "tik" : "yildiz"} boyut={16} />
                  {sayi(kilit.gerekli_xp)} XP{kilit.gerekli_seviye ? ` · ${kilit.gerekli_seviye}` : ""}
                </li>
              )}
              {kilit.gerekli_etkinlik > 0 && (
                <li data-tamam={kilit.eksik_etkinlik === 0}>
                  <Simge ad={kilit.eksik_etkinlik === 0 ? "tik" : "etkinlik"} boyut={16} />
                  {kilit.gerekli_etkinlik} etkinliğe katılım
                </li>
              )}
            </ul>
          </section>
        )}

        {kilit.acik && "ad" in kampanya && (
          <section className="sponsor-bolum">
            <div className="ilerleme-satiri">
              <span className="etiket">{kampanya.ad}</span>
              <KampanyaEtiketi k={kampanya} />
            </div>
            {"hak" in kampanya && aktifKampanya && (
              <p className="sponsor-hak">
                {kampanya.hak > 0
                  ? `${kampanya.hak} ödül hakkın var.`
                  : "Hakkını kullandın."}
              </p>
            )}
            {"oduller" in kampanya && kampanya.oduller && kampanya.oduller.length > 0 && (
              <>
              <span className="etiket">{kampanya.surpriz && kampanya.oduller.length > 1 ? "Olası ödüller" : "Ödül"}</span>
              {kampanya.surpriz && kampanya.oduller.length > 1 && (
                // Ne kazanılabileceği açık; sürpriz olan yalnızca hangisinin çıkacağı.
                <p className="soluk">Hangisinin çıkacağı QR'yi okuttuğunda belli olur. Sayılar gerçek kalan stoktur.</p>
              )}
              <ul className="kampanya-kalemleri">
                {kampanya.oduller.map((o, i) => (
                  <li key={i} data-bitti={o.kalan === 0}>
                    <Simge ad={odulIkonu(o.ikon)} boyut={18} />
                    <span>{o.baslik}</span>
                    <span className="rakam soluk">{o.toplam === null ? "Sınırsız" : o.kalan === 0 ? "Bitti" : `${o.kalan} kaldı`}</span>
                  </li>
                ))}
              </ul>
              </>
            )}
            {"bitis" in kampanya && aktifKampanya && (
              <p className="etiket soluk">Bitiş · {tarih(kampanya.bitis)}</p>
            )}
          </section>
        )}

        {taranabilir && (
          // Kasada "şimdi ne yapacağım?" sorusu kalmasın.
          <section className="sponsor-bolum">
            <span className="etiket">Nasıl alırsın</span>
            <ol className="nasil-adimlari">
              <li>İşletmeye git{sponsor.adres ? ` (${sponsor.adres})` : ""}.</li>
              <li>Kasadaki YAZVEB QR'sini okut; ödülün o an açılır.</li>
              <li>"Ödülü göster" ekranını çalışana göster, çalışan onaylar.</li>
            </ol>
          </section>
        )}

        {engel && <p className="bildirim bilgi">{engel}</p>}

        <div className="pencere-dip">
          <button className="dugme birincil genis" disabled={!taranabilir} onClick={() => onTara(sponsor)}>
            <Simge ad="tara" boyut={18} /> İşletmedeki QR'yi okut
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
