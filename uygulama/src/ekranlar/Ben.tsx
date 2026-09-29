import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Simge from "../tasarim/Simge";
import { AltBasi, Bolum, Satir, Satirlar } from "../tasarim/Dunya";
import { useGorunum, useOturum } from "../veri/oturum";
import { ROL_ADI } from "../veri/supabase";
import { bashar } from "../veri/bicim";
import { ODUL_DEGISTI, useGezinme, type BenBolumu } from "../veri/gezinme";
import { odul, OdulHatasi, type Profil } from "../veri/odul";
import { kimlik, type KimlikDurumu } from "../veri/kimlik";
import { sinifAdi } from "../veri/pano_bicim";
import IlerlemeSatiri from "../ben/IlerlemeSatiri";
import { GorunumSecici, ProfilFormu, VeriOzeti } from "../ben/Hesap";
import KimlikKarti from "../kimlik/KimlikKarti";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

const BASLIK: Record<BenBolumu, { baslik: string; aciklama: string }> = {
  kimlik: { baslik: "Öğrenci kimliği", aciklama: "Üniversite e-postanla doğrulama; notları açmanın ve paylaşmanın kapısı." },
  profil: { baslik: "Profil", aciklama: "Görünen adın ve açılış görünümün." },
  veri: { baslik: "Gizlilik ve veriler", aciklama: "Neyi, neden tutuyoruz; nasıl kapatırsın." },
};

/**
 * Ben — kişinin kendi alanı: kimliği ve hesabı.
 *
 * Ödüller, sponsorlar ve sıralama artık kendi dünyasında (Ödüller sekmesi);
 * burada yalnızca oraya giden tek satır var — alışkanlıkla buraya bakan
 * yolunu bulsun. XP burada görünür ama bağırmaz (TASARIM.md §2, kural 3).
 */
export default function Ben({ bolum }: { bolum?: BenBolumu }) {
  const { profil: hesap, yetkiliMi, cikis } = useOturum();
  const { gorunum, gorunumSec } = useGorunum();
  const { git, geri } = useGezinme();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [kim, setKim] = useState<KimlikDurumu | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const tazele = useCallback(async () => {
    try {
      setProfil(await odul.profil());
      setHata(null);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Yüklenemedi.");
    }
  }, []);

  useEffect(() => {
    if (bolum) return;   // alt sayfalar puanı göstermiyor
    tazele();
    kimlik.durum().then(setKim).catch(() => setKim(null));
    window.addEventListener(ODUL_DEGISTI, tazele);
    return () => window.removeEventListener(ODUL_DEGISTI, tazele);
  }, [bolum, tazele]);

  if (bolum) {
    const b = BASLIK[bolum];
    return (
      <div className="sayfa ben">
        <div className="sutun">
          <AltBasi ust="Ben" baslik={b.baslik} aciklama={b.aciklama} onGeri={geri} />
          {bolum === "kimlik" && <KimlikKarti />}
          {bolum === "profil" && (
            <div className="yigin gir">
              <ProfilFormu />
              {yetkiliMi && <GorunumSecici />}
            </div>
          )}
          {bolum === "veri" && <VeriOzeti acik />}
        </div>
      </div>
    );
  }

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

        {profil ? <IlerlemeSatiri profil={profil} onAc={() => git("odul", { odul: "gecmis" })} /> : !hata && (
          <div className="iskelet" style={{ width: "60%", height: 40, marginBottom: 32 }} />
        )}

        <Bolum sira={3}>
          <Satirlar>
            <Satir simge="hediye" baslik="Ödüller ve sponsorlar" aciklama="Bekleyen ödüllerin, sponsor kilitleri, sıralama"
                   onClick={() => git("odul")}
                   deger={profil && profil.aktif_odul > 0 ? <span className="sayac rakam">{profil.aktif_odul}</span> : undefined} />
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
