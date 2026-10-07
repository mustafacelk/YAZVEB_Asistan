import { useState } from "react";
import Simge from "../tasarim/Simge";
import { Bolum, Satir, Satirlar } from "../tasarim/Dunya";
import { OdulHatasi } from "../veri/odul";
import { odulDegisti } from "../veri/gezinme";
import { acikIsZamani, bugunGunu, ekip, type AcikIs, type BenimUstlenmem, type Havuz } from "../veri/ekip";

/**
 * Gönüllü havuzu — üyenin gördüğü taraf (Etkinlikler'in içinde).
 *
 * Belgeden: "Koltuk alamayan, haftada üç saat ayıramayan ya da henüz bir şey
 * bilmeyen üyenin de yapabileceği bir şey olmalı." Başvuru, deneme görevi,
 * taahhüt yok: gör, üstlen, yap. Bırakmak serbest ve kayıt tutulmaz.
 * Lider onaylayınca iş adıyla anılır ve ölçülü XP kazandırır.
 */
export default function GonulluHavuzu({ havuz, etkinlik, onEtkinlikTemizle, onDegisti }: {
  havuz: Havuz | null;
  /** Bir etkinliğin işlerine süzülmüşse o etkinliğin kimliği ve adı. */
  etkinlik?: { id: number; baslik: string } | null;
  onEtkinlikTemizle?: () => void;
  onDegisti: () => void;
}) {
  const [islemde, setIslemde] = useState<number | null>(null);
  const [mesaj, setMesaj] = useState<{ metin: string; hata?: boolean } | null>(null);
  const bugun = bugunGunu();

  if (!havuz) return null;

  const aktiflerim = havuz.benim.filter((u) => (u.durum === "ustlendi" || u.durum === "teslim") && u.is_durumu !== "iptal");
  // Dolan iş üyeye gösterilmez: "Dolu" yazan bir düğme yalnızca kalabalık.
  const acik = havuz.isler.filter((a) => !a.benim || a.benim === "birakti" || a.benim === "olmadi")
    .filter((a) => a.dolu < a.kontenjan)
    .filter((a) => !etkinlik || a.etkinlik?.id === etkinlik.id);

  async function yap(id: number, f: () => Promise<{ durum: string }>, basari: Record<string, string>) {
    setIslemde(id);
    setMesaj(null);
    try {
      const r = await f();
      const metin = basari[r.durum];
      if (metin) setMesaj({ metin, hata: r.durum !== "tamam" });
      onDegisti();
      odulDegisti();
    } catch (h) {
      setMesaj({ metin: h instanceof OdulHatasi ? h.message : "Olmadı, tekrar dene.", hata: true });
    } finally {
      setIslemde(null);
    }
  }

  return (
    <Bolum
      etiket="Gönüllü ol"
      className="gonullu-havuzu"
      sira={4}
      sag={havuz.tamamlanan > 0 && <span className="etiket rakam">{havuz.tamamlanan} iş tamamladın</span>}
    >
      <p className="havuz-aciklama soluk">
        Etkinliklerde 1–3 saatlik, tek seferlik işler. Başvuru yok: üstlen, yap; lider onaylayınca adınla anılır ve puanı gelir.
      </p>

      {havuz.sinav && (
        <p className="bildirim bilgi">{havuz.sinav} haftası: yeni iş yazılmıyor. Sınavlarında başarılar.</p>
      )}
      {mesaj && <p className={"bildirim" + (mesaj.hata ? "" : " bilgi")} role="status">{mesaj.metin}</p>}

      {aktiflerim.length > 0 && (
        <Satirlar className="havuz-benim">
          {aktiflerim.map((u) => (
            <UstlendigimSatir key={u.is_id} u={u} bugun={bugun} islemde={islemde === u.is_id}
              onYaptim={() => yap(u.is_id, () => ekip.yaptim(u.is_id), { tamam: "Harika. Lider onaylayınca puanın gelecek." })}
              onBirak={() => yap(u.is_id, () => ekip.birak(u.is_id), { tamam: "Bıraktın; yer başkasına açıldı. Sorun yok." })} />
          ))}
        </Satirlar>
      )}

      {etkinlik && (
        <div className="havuz-suzgec">
          <span className="cip" aria-pressed="true">{etkinlik.baslik}</span>
          <button className="metin-dugme baglanti" onClick={onEtkinlikTemizle}>Bütün işler</button>
        </div>
      )}

      {acik.length === 0 ? (
        <p className="havuz-bos soluk">
          {etkinlik ? "Bu etkinlik için açık iş kalmadı." : "Şu an açık iş yok. Ekip liderleri yeni iş yazınca burada görünür."}
        </p>
      ) : (
        <Satirlar>
          {acik.map((a) => (
            <AcikIsSatiri key={a.id} a={a} bugun={bugun} islemde={islemde === a.id}
              onUstlen={() => yap(a.id, () => ekip.ustlen(a.id), {
                tamam: "Üstlendin. Yukarıda, işin günü gelince Ana ekranda da görünecek.",
                dolu: "Az önce doldu; başka bir işe bak.",
                kapali: "Bu iş kapandı.",
                gecti: "Bu işin tarihi geçti.",
                zaten: "Bu işi zaten üstlendin.",
              })} />
          ))}
        </Satirlar>
      )}
    </Bolum>
  );
}

function AcikIsSatiri({ a, bugun, islemde, onUstlen }: { a: AcikIs; bugun: string; islemde: boolean; onUstlen: () => void }) {
  const dolu = a.dolu >= a.kontenjan;
  return (
    <Satir
      simge={a.saha ? "konum" : "yildiz"}
      baslik={a.baslik}
      aciklama={
        <span className="havuz-ust">
          <span className="rakam">{acikIsZamani(a, bugun)}</span>
          <span>{a.ekip_adi}{a.etkinlik ? ` · ${a.etkinlik.baslik}` : ""}{a.saha ? " · sahada" : ""}</span>
          {a.aciklama && <span className="havuz-not">{a.aciklama}</span>}
        </span>
      }
      deger={<span className="havuz-deger"><span className="xp-cipi rakam">+{a.xp} XP</span>
        <small className="rakam">{a.kontenjan - a.dolu > 0 ? `${a.kontenjan - a.dolu} yer` : "dolu"}</small></span>}
      eylem={
        <button className="dugme birincil" onClick={onUstlen} disabled={islemde || dolu}>
          {dolu ? "Dolu" : "Üstlen"}
        </button>
      }
    />
  );
}

function UstlendigimSatir({ u, bugun, islemde, onYaptim, onBirak }: {
  u: BenimUstlenmem; bugun: string; islemde: boolean; onYaptim: () => void; onBirak: () => void;
}) {
  const teslim = u.durum === "teslim";
  return (
    <Satir
      simge={teslim ? "saat" : "tik"}
      canli={!teslim && u.tarih === bugun}
      baslik={u.baslik}
      aciklama={<span className="rakam">{teslim ? "Onay bekliyor · " : "Senin işin · "}{acikIsZamani(u, bugun)}</span>}
      eylem={
        <span className="havuz-eylemler">
          {!teslim && <button className="dugme birincil" onClick={onYaptim} disabled={islemde}><Simge ad="tik" boyut={14} /> Yaptım</button>}
          <button className="dugme" onClick={onBirak} disabled={islemde}>Bırak</button>
        </span>
      }
    />
  );
}
