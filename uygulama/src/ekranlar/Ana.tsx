import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase, type Etkinlik } from "../veri/supabase";
import { useGorunum, useOturum } from "../veri/oturum";
import { ODUL_DEGISTI, useGezinme } from "../veri/gezinme";
import { bashar, selamAdi } from "../veri/bicim";
import { odul, sayi, sonKullanimEtiketi, type EtkinlikOzeti, type KazanimOzeti, type Profil } from "../veri/odul";
import { pano, type PanoOzeti } from "../veri/pano";
import { sinavMetni } from "../veri/pano_bicim";
import { bugunListesi, durumCumlesi, type BugunOgesi } from "../veri/bugun";
import { acikIsZamani, bugunGunu, ekip, teslimEtiketi, type EkipOzeti } from "../veri/ekip";
import Simge from "../tasarim/Simge";
import { Bolum, Satir, SatirIskeleti, Satirlar } from "../tasarim/Dunya";
import IlerlemeSatiri from "../ben/IlerlemeSatiri";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

type EtkinlikOgesi = Extract<BugunOgesi, { tur: "etkinlik" }>;

/**
 * Ana — "bugün kampüste benim için ne var?" sorusunu beş saniyede yanıtlar
 * (TASARIM.md §2). Dört blok, tek birincil eylem:
 *
 *   1. Selam    ad + bugünün tek cümlelik özeti; sağda Topluluk ve profil
 *   2. Sıradaki  en yakın etkinlik — sürüyorsa "QR okut" (ekranın birincil eylemi)
 *   3. Bugün    şu an önemli olan diğer şeyler (en fazla üç satır)
 *   4. İlerleme seviye ve puan, tek satır
 *
 * Asistan her ekranın sağ altındaki düğmede; 3D HUB Ben'de; takvimin
 * tamamı, sponsorlar, sıralama, notlar kendi dünyalarında.
 */
export default function Ana() {
  const { profil: hesap, yetkiliMi } = useOturum();
  const { uyari, gorunumSec } = useGorunum();
  const { git, tara } = useGezinme();
  // "Yönetici" seçip üye hesabıyla girildiyse: bir kez söylenir, seçim üyeye çekilir.
  const [kipUyarisi, setKipUyarisi] = useState(uyari);
  useEffect(() => { if (uyari) gorunumSec("uye"); }, [uyari, gorunumSec]);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [bugun, setBugun] = useState<BugunOgesi[] | null>(null);
  const [notlar, setNotlar] = useState<PanoOzeti | null>(null);

  const yukle = useCallback(async () => {
    const [p, liste, oz, cz, not, ek] = await Promise.all([
      odul.profil().catch(() => null),
      supabase
        .from("etkinlikler")
        .select("*")
        // Birkaç saat önce başlamış olan da gelsin: "şu an sürüyor" olabilir.
        .gte("baslangic", new Date(Date.now() - 12 * 3_600_000).toISOString())
        .lte("baslangic", new Date(Date.now() + 8 * 86_400_000).toISOString())
        .order("baslangic", { ascending: true })
        .limit(10),
      odul.etkinlikOzeti().catch((): EtkinlikOzeti[] => []),
      odul.cuzdan().catch((): KazanimOzeti[] => []),
      // Notlar kurulmamışsa sessizce yok sayılır.
      pano.ozet().catch((): PanoOzeti | null => null),
      // Gönüllü ve pano işleri; ekip modülü kurulmamışsa yok sayılır.
      ekip.ozet().catch((): EkipOzeti | null => null),
    ]);
    setProfil(p);
    setNotlar(not);
    setBugun(bugunListesi({
      etkinlikler: (liste.data as Etkinlik[] | null) ?? [],
      ozet: oz,
      cuzdan: cz,
      sinav: not,
      ekip: ek,
    }));
  }, []);

  useEffect(() => {
    yukle();
    window.addEventListener(ODUL_DEGISTI, yukle);
    return () => window.removeEventListener(ODUL_DEGISTI, yukle);
  }, [yukle]);

  const ad = selamAdi(hesap?.ad_soyad, hesap?.kullanici_adi);
  const siradaki = bugun?.find((o): o is EtkinlikOgesi => o.tur === "etkinlik");
  const digerleri = bugun?.filter((o) => o.tur !== "etkinlik") ?? [];
  // Akademi'de bu hafta paylaşılan notlar: sınav satırı yoksa Bugün'e tek satır.
  const yeniNot = notlar && notlar.bu_hafta > 0 && !digerleri.some((o) => o.tur === "sinav") ? notlar.bu_hafta : 0;

  return (
    <div className="sayfa ana">
      <div className="sutun">
        <header className="ana-ust gir">
          <div className="ana-selam-grup">
            <h1 className="ana-selam">{ad ? `Merhaba, ${ad}.` : "Merhaba."}</h1>
            <p className="ana-durum" aria-live="polite">
              {bugun === null ? " " : durumCumlesi(bugun)}
            </p>
          </div>
          <div className="ana-ust-eylemler">
            {yetkiliMi && (
              <button className="ikon-dugme" onClick={() => gorunumSec("yonetim")}
                      aria-label="Yönetim görünümüne geç" data-ipucu="Yönetim" data-ipucu-yon="alt">
                <Simge ad="ayar" />
              </button>
            )}
            <button className="ikon-dugme" onClick={() => git("topluluk")}
                    aria-label="Topluluk: genel sohbet ve üyeler" data-ipucu="Topluluk" data-ipucu-yon="alt">
              <Simge ad="sohbet" />
            </button>
            <button className="ana-profil" onClick={() => git("ben")} aria-label="Profilin">
              <span className="monogram" aria-hidden="true">{bashar(hesap?.ad_soyad || hesap?.kullanici_adi)}</span>
            </button>
          </div>
        </header>

        {kipUyarisi && (
          <p className="bildirim bilgi ana-uyari gir" role="status">
            {kipUyarisi}{" "}
            <button className="metin-dugme baglanti satir-ici" onClick={() => setKipUyarisi(null)}>Tamam</button>
          </p>
        )}

        {bugun === null ? (
          <div className="siradaki-kart" aria-hidden="true">
            <div className="iskelet" style={{ width: "40%" }} />
            <div className="iskelet" style={{ width: "70%", height: 20 }} />
          </div>
        ) : siradaki && <SiradakiKart oge={siradaki} onTara={tara} />}

        <Bolum etiket="Bugün" sira={2}>
          {bugun === null ? <SatirIskeleti adet={2} /> : digerleri.length === 0 && !yeniNot ? (
            siradaki ? (
              <p className="ana-sakin">Başka bekleyen bir şey yok.</p>
            ) : (
              <div className="ana-sakin-kutu">
                <p className="ana-sakin">Bugün önünde bekleyen bir şey yok.</p>
                <button className="dugme cizgili" onClick={() => git("akademi")}>
                  <Simge ad="kitap" boyut={16} /> Derslerine göz at
                </button>
              </div>
            )
          ) : (
            <Satirlar>
              {digerleri.map((o) => <BugunSatiri key={o.tur} oge={o} />)}
              {yeniNot > 0 && (
                <Satir simge="kitap" baslik={`Bu hafta ${sayi(yeniNot)} yeni not`}
                       aciklama={notlar?.bolum ? `${notlar.bolum} ve diğer bölümler` : "Akademi'de"}
                       onClick={() => git("akademi")} />
              )}
            </Satirlar>
          )}
        </Bolum>

        {profil && (
          <Bolum etiket="İlerlemen" sira={3} className="ana-yan">
            <IlerlemeSatiri profil={profil} onAc={() => git("odul")} />
          </Bolum>
        )}
      </div>
    </div>
  );
}

/**
 * Sıradaki etkinlik: Ana'nın tek kartı. Sürüyorsa ve puanlıysa ekranın
 * birincil eylemi burada (QR okut); değilse ikincil "Takvim".
 */
function SiradakiKart({ oge: o, onTara }: { oge: EtkinlikOgesi; onTara: () => void }) {
  const { git } = useGezinme();
  const t = new Date(o.etkinlik.baslangic);
  const bugun = t.toDateString() === new Date().toDateString();
  const saat = t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const gun = bugun ? "Bugün" : t.toLocaleDateString("tr-TR", { weekday: "long" });
  const qrGerek = o.canli && o.puan > 0 && !o.katildi;

  return (
    <article className="siradaki-kart gir" data-canli={o.canli || undefined} style={kademe(1)}
             aria-label={`${o.canli ? "Şu an sürüyor" : "Sıradaki etkinlik"}: ${o.etkinlik.baslik}`}>
      <div className="siradaki-ust">
        <div className="siradaki-tarih" aria-hidden="true">
          <b className="rakam">{t.getDate()}</b>
          <small>{t.toLocaleDateString("tr-TR", { month: "short" })}</small>
        </div>
        <div className="siradaki-metin">
          <span className="siradaki-ust-satir">
            {o.canli ? <><i className="canli-nokta" aria-hidden="true" /><b>Şu an sürüyor</b></> : "Sıradaki etkinlik"}
          </span>
          <h2>{o.etkinlik.baslik}</h2>
          <p className="rakam">{gun} {saat}{o.etkinlik.yer ? ` · ${o.etkinlik.yer}` : ""}</p>
        </div>
      </div>
      <div className="siradaki-eylemler">
        {qrGerek ? (
          <button className="dugme birincil genis" onClick={onTara}>
            <Simge ad="tara" boyut={18} /> QR okut · <span className="rakam">+{sayi(o.puan)} XP</span>
          </button>
        ) : (
          <>
            {o.katildi ? (
              <span className="siradaki-durum"><Simge ad="tik" boyut={16} /> Katıldın, puanın işlendi</span>
            ) : o.puan > 0 ? (
              <span className="xp-cipi rakam" title="Etkinlikte QR'yi okutunca kazanacağın puan">Kapıda QR ile +{sayi(o.puan)} XP</span>
            ) : null}
            <button className="dugme cizgili" onClick={() => git("etkinlik")} style={{ marginLeft: "auto" }}>
              Takvim <Simge ad="ileri" boyut={16} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function BugunSatiri({ oge: o }: { oge: BugunOgesi }) {
  const { git } = useGezinme();

  if (o.tur === "gonullu") {
    return (
      <Satir
        simge="yildiz"
        canli={o.fark === 0}
        baslik={o.is.baslik}
        aciklama={<span className="rakam">Gönüllü işin · {acikIsZamani(o.is, bugunGunu())}</span>}
        deger={<span className="xp-cipi rakam">+{o.is.xp} XP</span>}
        onClick={() => git("etkinlik")}
      />
    );
  }

  if (o.tur === "ekip_isi") {
    const t = teslimEtiketi(o.is.teslim, bugunGunu());
    return (
      <Satir
        simge="liste"
        baslik={o.is.baslik}
        aciklama={<span>
          <span className="teslim rakam" data-ton={t.ton}>{t.metin}</span>
          {o.digerleri > 0 ? ` · ${o.digerleri} iş daha` : " · ekip panosu"}
        </span>}
        onClick={() => git("ekip")}
      />
    );
  }

  if (o.tur === "odul") {
    const ilk = o.aktif[0];
    return (
      <Satir
        simge="hediye"
        baslik={o.aktif.length === 1 ? `${ilk.sponsor}: ${ilk.baslik}` : `${o.aktif.length} ödülün kullanılmayı bekliyor`}
        aciklama={sonKullanimEtiketi(ilk.son_kullanma) ?? "İşletmede göstererek kullanabilirsin."}
        onClick={() => git("odul")}
      />
    );
  }

  if (o.tur === "sinav") {
    return (
      <Satir
        simge="kitap"
        baslik={sinavMetni(o.sinav)}
        aciklama={o.notSayisi ? `${o.bolum}: ${o.notSayisi} not seni bekliyor.` : "Bölümünün notlarına bak, sen de paylaş."}
        onClick={() => git("akademi")}
      />
    );
  }

  return null;
}
