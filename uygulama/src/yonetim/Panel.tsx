import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase, ROL_ADI, type Etkinlik } from "../veri/supabase";
import { useGorunum, useOturum } from "../veri/oturum";
import { ODUL_DEGISTI, useGezinme } from "../veri/gezinme";
import { bashar, selamAdi } from "../veri/bicim";
import { sayi, tarihSaat } from "../veri/odul";
import Simge from "../tasarim/Simge";
import AlintiKarti from "../tasarim/AlintiKarti";
import { CanliQrPenceresi, QrPenceresi } from "./QrKod";
import { panoYonetim, yonetim, type YGorev, type YOzet, type YSponsor } from "./veri";
import { dikkatListesi, etkinlikGorevleri, odakEtkinlik, suruyor, type Dikkat } from "./oncelik";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;
const ONEM_ADI = ["Şimdi", "Bu hafta", "Bilgi"] as const;
/** Etkinlik sırasında sayılar canlı kalsın: perdedeki okutmalar panelde de artsın. */
const TAZELEME_MS = 30_000;

/**
 * Yönetim paneli — yöneticinin açılış ekranı.
 *
 * Üye "burada benim için ne var?" diye sorar; yönetici "şu an bir şey
 * yanlış mı, ne yapmam gerek?". Öncelik sırası bu yüzden farklı:
 *
 *   1. Şimdi / sıradaki etkinlik ve QR'si — etkinlik anında en çok gereken
 *      tek şey perdeye QR yansıtmak; bir dokunuş.
 *   2. Dikkat isteyenler — eksik QR görevi, PIN'siz sponsor, biten stok.
 *      Her satır bir eksik ve onu gideren yer. Boşsa "her şey yolunda".
 *   3. Son 30 gün — birkaç sayı; ayrıntısı Yönetim sekmesinde.
 *   4. Hızlı geçişler.
 *
 * Yetki ekranda değil veritabanında: bu sayfadaki her veri odul_yonetim_*
 * fonksiyonlarından gelir ve onlar yetkisiz çağrıyı reddeder.
 */
export default function Panel() {
  const { profil, rol } = useOturum();
  const { gorunumSec } = useGorunum();
  const { git } = useGezinme();
  const [veri, setVeri] = useState<{
    etkinlikler: Etkinlik[]; gorevler: YGorev[]; sponsorlar: YSponsor[]; ozet: YOzet | null;
  } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [perde, setPerde] = useState<YGorev | null>(null);
  const [simdi, setSimdi] = useState(Date.now());
  // Açık şikayet sayısı (Notlar kurulmamışsa null: satır görünmez).
  const [sikayet, setSikayet] = useState<number | null>(null);

  const yukle = useCallback(async () => {
    try {
      const [etk, gorevler, sponsorlar, ozet] = await Promise.all([
        supabase.from("etkinlikler").select("*")
          .gte("baslangic", new Date(Date.now() - 24 * 3_600_000).toISOString())
          .order("baslangic", { ascending: true }).limit(30),
        yonetim.gorevler(),
        yonetim.sponsorlar(),
        yonetim.ozet().catch(() => null),
      ]);
      setVeri({ etkinlikler: (etk.data as Etkinlik[] | null) ?? [], gorevler, sponsorlar, ozet });
      panoYonetim.moderasyon().then((l) => setSikayet(l.length)).catch(() => setSikayet(null));
      setSimdi(Date.now());
      setHata(null);
    } catch {
      setHata("Yönetim verisi alınamadı. Bağlantını kontrol et.");
    }
  }, []);

  useEffect(() => {
    yukle();
    const z = setInterval(() => { if (!document.hidden) yukle(); }, TAZELEME_MS);
    window.addEventListener(ODUL_DEGISTI, yukle);
    return () => { clearInterval(z); window.removeEventListener(ODUL_DEGISTI, yukle); };
  }, [yukle]);

  const odak = veri ? odakEtkinlik(veri.etkinlikler, simdi) : null;
  const odakGorevleri = odak && veri ? etkinlikGorevleri(odak, veri.gorevler, simdi) : [];
  const dikkat = veri ? dikkatListesi(veri.etkinlikler, veri.gorevler, veri.sponsorlar, simdi) : [];
  const ad = selamAdi(profil?.ad_soyad, profil?.kullanici_adi);

  const dikkatAc = (d: Dikkat) =>
    git("odul", { yonetim: d.eylem === "gorev" ? "gorevler" : "sponsorlar" });

  return (
    <div className="sayfa panel">
      <div className="sutun">
        <header className="sayfa-basi">
          <div>
            <span className="etiket gir">YAZVEB · {rol ? ROL_ADI[rol] : "Yönetim"}</span>
            <h1 className="gir" style={kademe(1)}>{ad ? `Merhaba, ${ad}.` : "Yönetim paneli"}</h1>
            <p className="sayfa-aciklama gir" style={kademe(2)}>Topluluğun bugünkü durumu ve yapılacaklar.</p>
          </div>
          <div className="sayfa-basi-eylem gir" style={kademe(2)}>
            <button className="dugme cizgili" onClick={() => gorunumSec("uye")}>Üye görünümü</button>
            {/* Hesap (profil, öğrenci kimliği, çıkış) Ben'de; yönetim çubuğunda yok. */}
            <button className="ana-profil" onClick={() => git("ben")} aria-label="Hesabım" data-ipucu="Hesabım" data-ipucu-yon="alt">
              {bashar(profil?.ad_soyad || profil?.kullanici_adi)}
            </button>
          </div>
        </header>

        <AlintiKarti set="yonetim" className="gir" style={kademe(2)} />

        {hata && <p className="bildirim" role="alert">{hata}</p>}

        {/* 1 · Şimdi / sıradaki etkinlik */}
        <section className="ana-bolum gir" style={kademe(3)} aria-labelledby="panel-etkinlik">
          <div className="bolum-basi yakin">
            <span className="etiket" id="panel-etkinlik">
              {odak && suruyor(odak, simdi)
                ? <span className="canli-etiket"><i aria-hidden="true" />Şu an</span>
                : "Sıradaki etkinlik"}
            </span>
            <button className="metin-dugme baglanti" onClick={() => git("etkinlik")}>
              Takvim <Simge ad="ileri" boyut={14} />
            </button>
          </div>
          {!veri ? (
            <div className="yigin" aria-label="Yükleniyor">
              <div className="iskelet" style={{ width: "70%" }} />
              <div className="iskelet" style={{ width: "45%" }} />
            </div>
          ) : !odak ? (
            <div className="panel-bos">
              <p className="soluk">Planlanmış etkinlik yok.</p>
              <button className="dugme birincil" onClick={() => git("etkinlik")}>
                <Simge ad="arti" boyut={16} /> Etkinlik ekle
              </button>
            </div>
          ) : (
            <article className="panel-etkinlik">
              <b>{odak.baslik}</b>
              <span className="soluk rakam">
                {tarihSaat(odak.baslangic)}{odak.yer ? ` · ${odak.yer}` : ""}
              </span>
              {odakGorevleri.length === 0 ? (
                <div className="panel-uyari">
                  <p>Bu etkinliğin QR görevi yok; gelenler puan alamaz.</p>
                  <button className="dugme birincil" onClick={() => git("odul", { yonetim: "gorevler" })}>
                    <Simge ad="qr" boyut={16} /> QR görevi oluştur
                  </button>
                </div>
              ) : (
                <ul className="panel-gorevler">
                  {odakGorevleri.map((g) => (
                    <li key={g.id}>
                      <span className="yonetim-satir-bilgi">
                        <b>{g.baslik}</b>
                        <span className="soluk rakam">
                          +{g.puan} XP · {sayi(g.kullanim_sayisi)} kişi okuttu{g.dinamik ? " · canlı kod" : ""}
                        </span>
                      </span>
                      <button className="dugme birincil" onClick={() => setPerde(g)}>
                        <Simge ad="qr" boyut={16} /> Perdeye yansıt
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}
        </section>

        {/* 2 · Dikkat isteyenler */}
        <section className="ana-bolum gir" style={kademe(4)} aria-labelledby="panel-dikkat">
          <div className="bolum-basi yakin">
            <span className="etiket" id="panel-dikkat">Yapılacaklar</span>
            {dikkat.length > 0 && <span className="etiket rakam">{dikkat.length}</span>}
          </div>
          {veri && dikkat.length === 0 ? (
            <p className="panel-tamam"><Simge ad="tik" boyut={16} /> Her şey yolunda. Eksik görev, PIN ya da stok yok.</p>
          ) : (
            <ul className="dikkat-listesi">
              {dikkat.slice(0, 8).map((d, i) => (
                <li key={i}>
                  <button className="ana-satir" onClick={() => dikkatAc(d)}>
                    <span className="onem-rozet" data-onem={d.onem}>{ONEM_ADI[d.onem]}</span>
                    <span className="ana-satir-govde">
                      <b>{d.baslik}</b>
                      <span className="soluk">{d.ayrinti}</span>
                    </span>
                    <Simge ad="ileri" boyut={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dikkat.length > 8 && <p className="soluk">+{dikkat.length - 8} madde daha; Yönetim sekmesinde.</p>}
        </section>

        {/* 3 · Son 30 gün */}
        {veri?.ozet && (
          <section className="ana-bolum gir" style={kademe(5)} aria-labelledby="panel-sayilar">
            <div className="bolum-basi yakin">
              <span className="etiket" id="panel-sayilar">Topluluk</span>
            </div>
            <div className="yonetim-kutular">
              <Kutu ad="Aktif üye · 30 gün" deger={sayi(veri.ozet.aktif_kullanici)} />
              <Kutu ad="Toplam okutma" deger={sayi(veri.ozet.tarama)} />
              <Kutu ad="Kullanılan ödül" deger={sayi(veri.ozet.sponsorlar.reduce((t, s) => t + s.kullanim, 0))} />
              <Kutu ad="Stoktaki ödül" deger={sayi(veri.ozet.stok_kalan)} />
            </div>
          </section>
        )}

        {/* 4 · Hızlı geçişler */}
        <section className="ana-bolum gir" style={kademe(6)}>
          <div className="satir-yigini">
            <Gecis simge="etkinlik" baslik="Etkinlikler" alt="Ekle, düzenle, takvim" onAc={() => git("etkinlik")} />
            <Gecis simge="qr" baslik="QR görevleri" alt="Oluştur, perdeye yansıt, yenile" onAc={() => git("odul", { yonetim: "gorevler" })} />
            <Gecis simge="hediye" baslik="Sponsorlar ve kampanyalar" alt="PIN, stok, kampanya QR'si" onAc={() => git("odul", { yonetim: "sponsorlar" })} />
            {sikayet !== null && (
              <Gecis simge="kalkan" baslik={sikayet > 0 ? `${sikayet} açık şikayet` : "Şikayetler"}
                     alt={sikayet > 0 ? "Not ya da sohbet mesajı: incele, karar ver" : "Açık şikayet yok"}
                     onAc={() => git("odul", { yonetim: "moderasyon" })} />
            )}
            <Gecis simge="kitap" baslik="Notlar" alt="Sınav dönemleri, sponsorlu ilanlar, puan kuralları"
                   onAc={() => git("odul", { yonetim: "notlar" })} />
            <Gecis simge="tik" baslik="Ödül kullanımları" alt="Kim, hangi ödülü, ne zaman kullandı" onAc={() => git("odul", { yonetim: "kullanimlar" })} />
            <Gecis simge="topluluk" baslik={rol === "baskan" ? "Üyeler ve roller" : "Üyeler ve sohbet"}
                   alt={rol === "baskan" ? "Rol dağıt, sohbeti izle" : "Genel sohbet ve üye listesi"} onAc={() => git("topluluk")} />
          </div>
        </section>
      </div>

      {perde && (perde.dinamik
        ? <CanliQrPenceresi gorevId={perde.id} baslik={perde.baslik} altBaslik={`+${perde.puan} XP`} onKapat={() => setPerde(null)} />
        : <QrPenceresi baslik={perde.baslik} altBaslik={`+${perde.puan} XP`} icerik={`YAZVEB:G:${perde.token}`}
            kisaKod={perde.kisa_kod} onKapat={() => setPerde(null)} />)}
    </div>
  );
}

function Kutu({ ad, deger }: { ad: string; deger: string }) {
  return <div className="yonetim-kutu"><span className="etiket">{ad}</span><b className="rakam">{deger}</b></div>;
}

function Gecis({ simge, baslik, alt, onAc }: {
  simge: Parameters<typeof Simge>[0]["ad"]; baslik: string; alt: string; onAc: () => void;
}) {
  return (
    <button className="ana-satir" onClick={onAc}>
      <span className="ana-satir-ikon"><Simge ad={simge} boyut={20} /></span>
      <span className="ana-satir-govde"><b>{baslik}</b><span className="soluk tek-satir">{alt}</span></span>
      <Simge ad="ileri" boyut={16} />
    </button>
  );
}
