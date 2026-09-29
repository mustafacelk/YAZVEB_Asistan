import { useCallback, useEffect, useState } from "react";
import Simge, { odulIkonu } from "../tasarim/Simge";
import { AltBasi, Bolum, Bos, DunyaBasi, Satir, SatirIskeleti, Satirlar } from "../tasarim/Dunya";
import { ODUL_DEGISTI, useGezinme, type OdulBolumu } from "../veri/gezinme";
import {
  odul,
  OdulHatasi,
  sonKullanimEtiketi,
  tarih,
  type Donem,
  type KazanimOzeti,
  type Liderlik,
  type Profil,
  type Sponsor,
} from "../veri/odul";
import { Cuzdan, Gecmis, IlerlemeAyrinti, Siralama } from "../ben/Cuzdan";
import IlerlemeSatiri from "../ben/IlerlemeSatiri";
import Tarayici, { type TaramaModu } from "../odul/Tarayici";
import OdulGoster from "../odul/OdulGoster";
import { SponsorDetay, SponsorKarti } from "../odul/SponsorKarti";

const BASLIK: Record<OdulBolumu, { baslik: string; aciklama: string }> = {
  cuzdan: { baslik: "Ödüllerim", aciklama: "Kazandığın bütün ödüller. İşletmede \"Göster\"e dokun, çalışan onaylasın." },
  siralama: { baslik: "Sıralama", aciklama: "Bu haftanın ve tüm zamanların en aktifleri." },
  gecmis: { baslik: "İlerleme", aciklama: "Seviye yolun ve kazandığın her puanın kaynağı." },
};

/** Ödüller dünyasında bekleyen ödül satırı en fazla bu kadar; fazlası "Tümü"nde. */
const EN_FAZLA_AKTIF = 3;

/**
 * Ödüller — puanın karşılığı: bekleyen ödüller, sponsorlar, sıralama.
 *
 * Eskiden Ben › Cüzdan'ın altında iki satırdı ve bulunmuyordu. Topluluğun
 * geliri sponsorlar; üyenin puan toplamasının sebebi ödüller. İkisi de
 * çubukta kendi sekmesini hak ediyor (TASARIM.md §2).
 *
 * Sıra: önce elindeki (kasada gösterilecek ödül, tek dokunuşla "Göster"),
 * sonra açabileceklerin (sponsorlar, kilit ilerlemesiyle), sonra gerisi.
 */
export default function Oduller({ bolum }: { bolum?: OdulBolumu }) {
  const { git, geri } = useGezinme();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [cuzdan, setCuzdan] = useState<KazanimOzeti[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [gosterilen, setGosterilen] = useState<string | null>(null);

  const tazele = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([odul.profil(), odul.cuzdan()]);
      setProfil(p);
      setCuzdan(c);
      setHata(null);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    tazele();
    window.addEventListener(ODUL_DEGISTI, tazele);
    return () => window.removeEventListener(ODUL_DEGISTI, tazele);
  }, [tazele]);

  const goster = gosterilen && (
    <OdulGoster kazanimId={gosterilen} onKapat={() => setGosterilen(null)} onDegisti={tazele} />
  );

  if (bolum) {
    const b = BASLIK[bolum];
    return (
      <div className="sayfa oduller">
        <div className="sutun">
          <AltBasi ust="Ödüller" baslik={b.baslik} aciklama={b.aciklama} onGeri={geri} />
          {hata && <p className="bildirim" role="alert">{hata}</p>}
          {bolum === "cuzdan" && (cuzdan === null ? <SatirIskeleti /> : (
            <Cuzdan liste={cuzdan} onGoster={setGosterilen} onKesfet={() => git("odul")} />
          ))}
          {bolum === "siralama" && (profil ? <SiralamaBolumu profil={profil} onTazele={tazele} /> : <SatirIskeleti />)}
          {bolum === "gecmis" && (profil ? (
            <>
              <IlerlemeAyrinti profil={profil} />
              <Bolum etiket="Puan geçmişi" sira={4}><Gecmis profil={profil} /></Bolum>
            </>
          ) : <SatirIskeleti />)}
          {goster}
        </div>
      </div>
    );
  }

  const aktif = (cuzdan ?? []).filter((z) => z.durum === "aktif")
    .sort((a, b) => a.son_kullanma.localeCompare(b.son_kullanma));

  return (
    <div className="sayfa oduller">
      <div className="sutun">
        <DunyaBasi
          etiket="Cüzdan"
          baslik="Ödüller"
          aciklama="Etkinliklerde puan topla, yerel işletmelerin kilidini aç, ödülünü kasada göster."
        />

        {hata && <p className="bildirim" role="alert">{hata}</p>}

        {profil ? <IlerlemeSatiri profil={profil} onAc={() => git("odul", { odul: "gecmis" })} /> : !hata && (
          <div className="iskelet" style={{ width: "60%", height: 40, marginBottom: 32 }} />
        )}

        <Bolum
          etiket="Ödüllerin"
          sira={3}
          sag={cuzdan && cuzdan.length > 0 && (
            <button className="metin-dugme baglanti" onClick={() => git("odul", { odul: "cuzdan" })}>
              Tümü <span className="rakam">({cuzdan.length})</span>
            </button>
          )}
        >
          {cuzdan === null ? <SatirIskeleti adet={1} /> : aktif.length === 0 ? (
            <p className="oduller-bos">
              Bekleyen ödülün yok. Kilidi açık bir sponsorun kasasındaki QR'yi okuttuğunda ödülün burada belirir.
            </p>
          ) : (
            <Satirlar>
              {aktif.slice(0, EN_FAZLA_AKTIF).map((z) => (
                <Satir
                  key={z.id}
                  simge={<Simge ad={odulIkonu(z.ikon)} boyut={18} />}
                  baslik={z.baslik}
                  aciklama={<span className="rakam">{z.sponsor} · {sonKullanimEtiketi(z.son_kullanma) ?? `Son kullanım ${tarih(z.son_kullanma)}`}</span>}
                  eylem={<button className="dugme birincil" onClick={() => setGosterilen(z.id)}>Göster</button>}
                />
              ))}
              {aktif.length > EN_FAZLA_AKTIF && (
                <Satir simge="hediye" baslik={`${aktif.length - EN_FAZLA_AKTIF} ödül daha`}
                       onClick={() => git("odul", { odul: "cuzdan" })} />
              )}
            </Satirlar>
          )}
        </Bolum>

        <Bolum
          etiket="Sponsorlar"
          sira={4}
          sag={profil && <span className="etiket rakam">{profil.acik_sponsor}/{profil.toplam_sponsor} kilit açık</span>}
        >
          <SponsorIzgarasi onTazele={tazele} onOdulGoster={setGosterilen} />
        </Bolum>

        <Bolum etiket="Daha fazla" sira={5}>
          <Satirlar>
            <Satir simge="grafik" baslik="Sıralama" aciklama="Bu haftanın en aktifleri"
                   onClick={() => git("odul", { odul: "siralama" })} />
            <Satir simge="liste" baslik="İlerleme ve puan geçmişi" aciklama="Seviye yolun, her puanın kaynağı"
                   onClick={() => git("odul", { odul: "gecmis" })} />
            <Satir simge="etkinlik" baslik="Nasıl puan kazanılır?" aciklama="Etkinlikte QR okut, ders notu paylaş"
                   onClick={() => git("etkinlik")} />
          </Satirlar>
        </Bolum>

        {goster}
      </div>
    </div>
  );
}

/** Sponsorlar: kilit ilerlemesiyle ızgara; detayda işletmedeki QR okutulur. */
function SponsorIzgarasi({ onTazele, onOdulGoster }: {
  onTazele: () => void;
  onOdulGoster: (id: string) => void;
}) {
  const [sponsorlar, setSponsorlar] = useState<Sponsor[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [detay, setDetay] = useState<Sponsor | null>(null);
  const [tarama, setTarama] = useState<TaramaModu | null>(null);

  const yukle = useCallback(() => {
    odul.sponsorlar().then(setSponsorlar).catch((h) => setHata(h instanceof OdulHatasi ? h.message : "Sponsorlar alınamadı."));
  }, []);
  useEffect(() => {
    yukle();
    window.addEventListener(ODUL_DEGISTI, yukle);
    return () => window.removeEventListener(ODUL_DEGISTI, yukle);
  }, [yukle]);

  return (
    <>
      {hata && <p className="bildirim" role="alert">{hata}</p>}
      {sponsorlar === null ? (!hata && (
        <div className="sponsor-izgara" aria-label="Yükleniyor">
          {[0, 1].map((i) => <div key={i} className="iskelet" style={{ height: 150 }} />)}
        </div>
      )) : sponsorlar.length === 0 ? (
        <Bos simge="kilit" baslik="Sponsor ağı hazırlanıyor." aciklama="İlk sponsorlar eklendiğinde kilitlerini burada açacaksın." />
      ) : (
        <div className="sponsor-izgara">
          {sponsorlar.map((s, i) => <SponsorKarti key={s.id} sponsor={s} sira={i} onAc={() => setDetay(s)} />)}
        </div>
      )}
      {detay && (
        <SponsorDetay sponsor={detay} onKapat={() => setDetay(null)}
                      onTara={(s) => { setDetay(null); setTarama({ tur: "sponsor", sponsor: s }); }} />
      )}
      {tarama && (
        <Tarayici mod={tarama} onKapat={() => setTarama(null)} onDegisti={() => { onTazele(); yukle(); }}
                  onOdulGoster={onOdulGoster} />
      )}
    </>
  );
}

function SiralamaBolumu({ profil, onTazele }: { profil: Profil; onTazele: () => void }) {
  const [donem, setDonem] = useState<Donem>("hafta");
  const [veri, setVeri] = useState<Liderlik | null>(null);
  useEffect(() => {
    odul.liderlik(donem).then(setVeri).catch(() => setVeri({ acik: false }));
  }, [donem, profil.xp, profil.gizli]);
  return (
    <Siralama veri={veri} donem={donem} onDonem={setDonem} gizli={profil.gizli}
              onGizlilik={async (g) => { await odul.gizlilik(g).catch(() => {}); onTazele(); }} />
  );
}
