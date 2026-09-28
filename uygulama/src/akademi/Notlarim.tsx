import { useEffect, useState } from "react";
import Simge from "../tasarim/Simge";
import { Bolum, Bos, SatirIskeleti, Satirlar } from "../tasarim/Dunya";
import { OdulHatasi } from "../veri/odul";
import { pano, type BenimNotum, type Notlarim as NotlarimVerisi, type NotOzeti } from "../veri/pano";
import { turAdi } from "../veri/pano_bicim";

/** Kendi notların: onay durumu, kaç kişinin işine yaradı, kazandığın puan. */
export default function Notlarim({ onAc, onPaylas }: { onAc: (n: NotOzeti) => void; onPaylas: () => void }) {
  const [veri, setVeri] = useState<NotlarimVerisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    pano.notlarim().then(setVeri).catch((h) => setHata(h instanceof OdulHatasi ? h.message : "Notların alınamadı."));
  }, []);

  if (hata) return <p className="bildirim" role="alert">{hata}</p>;
  if (!veri) return <SatirIskeleti adet={3} />;

  const oran = veri.hafta.tavan > 0 ? Math.min(1, veri.hafta.kazanilan / veri.hafta.tavan) : 0;
  return (
    <>
      <div className="notlarim-ozet gir">
        <div>
          <span className="etiket">Bu hafta notlardan</span>
          <b className="rakam">{veri.hafta.kazanilan} <small>/ {veri.hafta.tavan} XP</small></b>
        </div>
        <div>
          <span className="etiket">Toplam</span>
          <b className="rakam">{veri.toplam} <small>XP</small></b>
        </div>
        <span className="ilerleme-cubugu" style={{ ["--oran" as string]: oran }} role="progressbar"
              aria-label="Haftalık not puanı" aria-valuemin={0} aria-valuemax={veri.hafta.tavan} aria-valuenow={veri.hafta.kazanilan}><i /></span>
      </div>
      {veri.liste.length === 0 ? (
        <Bos simge="kalem" baslik="Henüz not paylaşmadın." aciklama="Puanın çoğu, notun başkasının işine yaradıkça gelir."
             eylem={<button className="dugme cizgili" onClick={onPaylas}><Simge ad="arti" boyut={16} /> Not paylaş</button>} />
      ) : (
        <Bolum etiket="Paylaştıkların" sag={<span className="etiket rakam">{veri.liste.length}</span>} sira={4}>
          <Satirlar className="not-satirlari">
            {veri.liste.map((n) => (
              <div key={n.id} className="satir-dunya">
                <button className="satir-dugme not-satiri" onClick={() => onAc(n)}>
                  <span className="satir-govde">
                    <span className="not-satiri-ust">
                      <span className="not-tur" data-tur={n.tur}>{turAdi(n.tur)}</span>
                      <NotDurumu n={n} />
                    </span>
                    <span className="satir-baslik">{n.baslik}</span>
                    <span className="satir-aciklama">{n.ders_kodu ? `${n.ders_kodu} · ` : ""}{n.ders_adi}</span>
                  </span>
                  <span className="satir-deger not-satiri-sag rakam">
                    <span aria-label={`${n.yararli} kişinin işine yaradı`}><Simge ad="yildiz" boyut={13} /> {n.yararli}</span>
                    <small>{n.acilma} açılma</small>
                    {n.xp > 0 && <span className="not-xp">+{n.xp} XP</span>}
                  </span>
                </button>
              </div>
            ))}
          </Satirlar>
        </Bolum>
      )}
    </>
  );
}

function NotDurumu({ n }: { n: BenimNotum }) {
  if (n.durum === "gizli") return <span className="not-durum uyari">İncelemede</span>;
  if (!n.onaylandi) {
    const kalan = n.onay_zamani ? Math.max(0, new Date(n.onay_zamani).getTime() - Date.now()) : 0;
    const saat = Math.ceil(kalan / 3_600_000);
    return <span className="not-durum">{n.sikayet ? "Şikayet inceleniyor" : saat > 0 ? `Onaya ${saat} sa` : "Onaylanıyor"}</span>;
  }
  return <span className="not-durum onayli">Onaylandı{n.sinav_oncesi ? " · sınav öncesi" : ""}</span>;
}
