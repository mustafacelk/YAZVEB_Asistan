import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Simge from "../tasarim/Simge";
import { AltBasi, Bolum, Bos, Satir, SatirIskeleti, Satirlar } from "../tasarim/Dunya";
import { useGorunum, useOturum } from "../veri/oturum";
import { ROL_ADI } from "../veri/supabase";
import { bashar } from "../veri/bicim";
import { ODUL_DEGISTI, useGezinme, type BenBolumu } from "../veri/gezinme";
import {
  odul,
  OdulHatasi,
  type Donem,
  type KazanimOzeti,
  type Liderlik,
  type Profil,
  type Sponsor,
} from "../veri/odul";
import { kimlik, type KimlikDurumu } from "../veri/kimlik";
import { sinifAdi } from "../veri/pano_bicim";
import { Cuzdan, Gecmis, IlerlemeAyrinti, Siralama } from "../ben/Cuzdan";
import IlerlemeSatiri from "../ben/IlerlemeSatiri";
import { GorunumSecici, ProfilFormu, VeriOzeti } from "../ben/Hesap";
import KimlikKarti from "../kimlik/KimlikKarti";
import Tarayici, { type TaramaModu } from "../odul/Tarayici";
import OdulGoster from "../odul/OdulGoster";
import { SponsorDetay, SponsorKarti } from "../odul/SponsorKarti";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

const BASLIK: Record<BenBolumu, { baslik: string; aciklama: string }> = {
  oduller: { baslik: "Ödüllerim", aciklama: "Kazandığın ödüller. İşletmede \"Göster\"e dokun, çalışan onaylasın." },
  sponsorlar: { baslik: "Sponsorlar", aciklama: "Puanın arttıkça kilidi açılan yerel işletmeler ve ödülleri." },
  siralama: { baslik: "Sıralama", aciklama: "Bu haftanın ve tüm zamanların en aktifleri." },
  gecmis: { baslik: "İlerleme", aciklama: "Seviye yolun ve kazandığın her puanın kaynağı." },
  kimlik: { baslik: "Öğrenci kimliği", aciklama: "Üniversite e-postanla doğrulama; notları açmanın ve paylaşmanın kapısı." },
  profil: { baslik: "Profil", aciklama: "Görünen adın ve açılış görünümün." },
  veri: { baslik: "Gizlilik ve veriler", aciklama: "Neyi, neden tutuyoruz; nasıl kapatırsın." },
};

/**
 * Ben — kişinin kendi alanı: kimliği, ilerlemesi, cüzdanı, hesabı.
 *
 * Giriş sayfası sade: kim olduğun, tek satırlık ilerleme, sonra iki grup
 * satır (Cüzdan, Hesap). Her satır bir alt sayfa açar; ayrıntı orada.
 * XP burada görünür ama bağırmaz (TASARIM.md §2, kural 3).
 */
export default function Ben({ bolum }: { bolum?: BenBolumu }) {
  const { profil: hesap, yetkiliMi, cikis } = useOturum();
  const { gorunum, gorunumSec } = useGorunum();
  const { git, geri } = useGezinme();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [cuzdan, setCuzdan] = useState<KazanimOzeti[] | null>(null);
  const [kim, setKim] = useState<KimlikDurumu | null>(null);
  const [hata, setHata] = useState<string | null>(null);

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
    kimlik.durum().then(setKim).catch(() => setKim(null));
    window.addEventListener(ODUL_DEGISTI, tazele);
    return () => window.removeEventListener(ODUL_DEGISTI, tazele);
  }, [tazele]);

  if (bolum) {
    const b = BASLIK[bolum];
    return (
      <div className="sayfa ben">
        <div className="sutun">
          <AltBasi ust="Ben" baslik={b.baslik} aciklama={b.aciklama} onGeri={geri} />
          {hata && <p className="bildirim" role="alert">{hata}</p>}
          <BenAltSayfa bolum={bolum} profil={profil} cuzdan={cuzdan} onTazele={tazele} />
        </div>
      </div>
    );
  }

  const aktif = cuzdan?.filter((z) => z.durum === "aktif").length ?? 0;
  return (
    <div className="sayfa ben">
      <div className="sutun">
        <header className="ben-kimlik gir">
          <span className="monogram buyuk" aria-hidden="true">{bashar(hesap?.ad_soyad || hesap?.kullanici_adi)}</span>
          <div className="ben-kimlik-metin">
            <h1>{hesap?.ad_soyad || "@" + hesap?.kullanici_adi}</h1>
            <p className="ben-kimlik-alt">
              <span>@{hesap?.kullanici_adi}</span>
              {hesap && hesap.rol !== "uye" && <span className={"rozet rol-" + hesap.rol}>{ROL_ADI[hesap.rol]}</span>}
            </p>
            {kim && (kim.dogrulandi ? (
              <p className="ben-dogrulama dogrulandi">
                <Simge ad="tik" boyut={14} />
                <span>{kim.universite}{kim.bolum ? ` · ${kim.bolum}` : ""}{kim.sinif ? ` · ${sinifAdi(kim.sinif)}` : ""}</span>
              </p>
            ) : (
              <button className="ben-dogrulama" onClick={() => git("ben", { bolum: "kimlik" })}>
                <Simge ad="kalkan" boyut={14} />
                <span>{kim.suresi_doldu ? "Doğrulamanı yenile" : "Öğrenciliğini doğrula"}</span>
                <Simge ad="ileri" boyut={14} />
              </button>
            ))}
          </div>
        </header>

        {hata && <p className="bildirim" role="alert">{hata}</p>}

        {profil ? <IlerlemeSatiri profil={profil} onAc={() => git("ben", { bolum: "gecmis" })} /> : !hata && (
          <div className="iskelet" style={{ width: "60%", height: 40, marginBottom: 32 }} />
        )}

        <Bolum etiket="Cüzdan" sira={3}>
          <Satirlar>
            <Satir simge="hediye" baslik="Ödüllerim" onClick={() => git("ben", { bolum: "oduller" })}
                   deger={aktif > 0 ? <span className="sayac rakam">{aktif}</span> : cuzdan?.length ? "Hepsi kullanıldı" : undefined} />
            <Satir simge="kilit" baslik="Sponsorlar" onClick={() => git("ben", { bolum: "sponsorlar" })}
                   deger={profil ? <span className="rakam">{profil.acik_sponsor}/{profil.toplam_sponsor} açık</span> : undefined} />
            <Satir simge="grafik" baslik="Sıralama" onClick={() => git("ben", { bolum: "siralama" })} />
            <Satir simge="liste" baslik="İlerleme ve puan geçmişi" onClick={() => git("ben", { bolum: "gecmis" })} />
          </Satirlar>
        </Bolum>

        <Bolum etiket="Hesap" sira={4}>
          <Satirlar>
            <Satir simge="kalkan" baslik="Öğrenci kimliği" onClick={() => git("ben", { bolum: "kimlik" })}
                   deger={kim ? (kim.dogrulandi ? "Doğrulandı" : "Doğrulanmadı") : undefined} />
            <Satir simge="kalem" baslik="Profil" onClick={() => git("ben", { bolum: "profil" })}
                   deger={hesap?.ad_soyad || undefined} />
            <Satir simge="liste" baslik="Gizlilik ve veriler" onClick={() => git("ben", { bolum: "veri" })} />
            {yetkiliMi && (gorunum === "yonetim" ? (
              <Satir simge="kisi" baslik="Üye görünümüne geç" aciklama="Uygulamayı bir üyenin gördüğü gibi kullan"
                     onClick={() => gorunumSec("uye")} />
            ) : (
              <Satir simge="ayar" baslik="Yönetim görünümüne geç" aciklama="QR görevleri, sponsorlar, notlar, şikayetler"
                     onClick={() => gorunumSec("yonetim")} />
            ))}
          </Satirlar>
        </Bolum>

        <div className="ben-cikis gir" style={kademe(5)}>
          <button className="dugme tehlike" onClick={cikis}><Simge ad="cikis" boyut={16} /> Çıkış yap</button>
        </div>
      </div>
    </div>
  );
}

function BenAltSayfa({ bolum, profil, cuzdan, onTazele }: {
  bolum: BenBolumu;
  profil: Profil | null;
  cuzdan: KazanimOzeti[] | null;
  onTazele: () => void;
}) {
  const { git } = useGezinme();
  const [gosterilen, setGosterilen] = useState<string | null>(null);

  switch (bolum) {
    case "oduller":
      return (
        <>
          {cuzdan === null ? <SatirIskeleti /> : (
            <Cuzdan liste={cuzdan} onGoster={setGosterilen} onKesfet={() => git("ben", { bolum: "sponsorlar" })} />
          )}
          {gosterilen && <OdulGoster kazanimId={gosterilen} onKapat={() => setGosterilen(null)} onDegisti={onTazele} />}
        </>
      );
    case "sponsorlar":
      return <SponsorlarBolumu onTazele={onTazele} onOdulGoster={setGosterilen} gosterilen={gosterilen} onGosterKapat={() => setGosterilen(null)} />;
    case "siralama":
      return profil ? <SiralamaBolumu profil={profil} onTazele={onTazele} /> : <SatirIskeleti />;
    case "gecmis":
      return profil ? (
        <>
          <IlerlemeAyrinti profil={profil} />
          <Bolum etiket="Puan geçmişi" sira={4}><Gecmis profil={profil} /></Bolum>
        </>
      ) : <SatirIskeleti />;
    case "kimlik":
      return <KimlikKarti />;
    case "profil":
      return <ProfilBolumu />;
    case "veri":
      return <VeriOzeti acik />;
  }
}

function ProfilBolumu() {
  const { yetkiliMi } = useOturum();
  return (
    <div className="yigin gir">
      <ProfilFormu />
      {yetkiliMi && <GorunumSecici />}
    </div>
  );
}

function SponsorlarBolumu({ onTazele, onOdulGoster, gosterilen, onGosterKapat }: {
  onTazele: () => void;
  onOdulGoster: (id: string) => void;
  gosterilen: string | null;
  onGosterKapat: () => void;
}) {
  const [sponsorlar, setSponsorlar] = useState<Sponsor[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [detay, setDetay] = useState<Sponsor | null>(null);
  const [tarama, setTarama] = useState<TaramaModu | null>(null);

  const yukle = useCallback(() => {
    odul.sponsorlar().then(setSponsorlar).catch((h) => setHata(h instanceof OdulHatasi ? h.message : "Sponsorlar alınamadı."));
  }, []);
  useEffect(() => { yukle(); }, [yukle]);

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
      {gosterilen && <OdulGoster kazanimId={gosterilen} onKapat={onGosterKapat} onDegisti={onTazele} />}
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
