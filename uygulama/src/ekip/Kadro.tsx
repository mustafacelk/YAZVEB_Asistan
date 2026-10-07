import { useEffect, useState } from "react";
import Simge from "../tasarim/Simge";
import { Bolum, Satir, Satirlar } from "../tasarim/Dunya";
import { OdulHatasi } from "../veri/odul";
import { ekip, type KadroUyesi, type Kisi, type Pano } from "../veri/ekip";
import Pencere from "./Pencere";

/**
 * Kadro — 17 rol, 24 koltuk (Görev Tanımları). Her ekipte rol rol koltuklar;
 * boş koltuk da görünür ("koltuğu boş bırak; gönüllü havuzundan dolar").
 * Kaçtı sayısı eşiğe ulaşınca görüşme işareti: otomatik rol devri değil,
 * işin ağırlığına ve nedenine bakılan bir konuşma.
 */
export default function Kadro({ p, onDegisti }: { p: Pano; onDegisti: () => void }) {
  const [pencere, setPencere] = useState<KadroUyesi | "yeni" | null>(null);
  const toplam = p.roller.reduce((t, r) => t + r.kontenjan, 0);
  const deneme = p.kadro.filter((k) => k.durum === "deneme").length;

  return (
    <>
      <div className="pano-ust gir">
        <p className="pano-ozet-cumlesi">
          <b className="rakam">{p.kadro.length}</b>/{toplam} koltuk dolu
          {deneme > 0 && <> · <b className="rakam">{deneme}</b> kişi deneme sürecinde</>}
        </p>
        {p.ben.tam_yetki && (
          <button className="dugme birincil" onClick={() => setPencere("yeni")}><Simge ad="arti" boyut={16} /> Kadroya ekle</button>
        )}
      </div>

      {p.ekipler.map((e, ei) => {
        const roller = p.roller.filter((r) => r.ekip === e.kod);
        if (!roller.length) return null;
        return (
          <Bolum key={e.kod} etiket={e.ad} sira={ei + 3}>
            <Satirlar>
              {roller.flatMap((r) => {
                const kisiler = p.kadro.filter((k) => k.rol === r.kod);
                const bos = Math.max(0, r.kontenjan - kisiler.length);
                return [
                  ...kisiler.map((k) => (
                    <Satir
                      key={k.id}
                      simge={r.lider || r.cekirdek ? "yildiz" : "kisi"}
                      baslik={<>{k.ad}{k.durum === "deneme" && <span className="rozet deneme-rozeti">Deneme</span>}</>}
                      aciklama={<span>{r.ad}{k.acik > 0 && <span className="rakam"> · {k.acik} açık iş</span>}
                        {k.geciken > 0 && <span className="rakam uyari-metin"> · {k.geciken} gecikmede</span>}</span>}
                      deger={k.kacti > 0 && (
                        <span className={"kacti-rozeti rakam" + (k.kacti >= p.ayarlar.kacti_esigi ? " gorusme" : "")}
                              title="Haber verilmeden kaçan teslim (dönem içinde)">
                          {k.kacti >= p.ayarlar.kacti_esigi ? `Görüşme · ${k.kacti} kaçtı` : `${k.kacti} kaçtı`}
                        </span>
                      )}
                      onClick={p.ben.tam_yetki ? () => setPencere(k) : undefined}
                    />
                  )),
                  ...Array.from({ length: bos }, (_, i) => (
                    <Satir key={`${r.kod}-bos-${i}`} simge="kisi" baslik={<span className="soluk">Boş koltuk</span>}
                           aciklama={`${r.ad} · haftada ${r.saat} saat`} />
                  )),
                ];
              })}
            </Satirlar>
          </Bolum>
        );
      })}

      <p className="pano-sinav soluk gir">
        Haftalık süreler beklentidir, taahhüt değil; sınav haftalarında sıfırlanır. Kaçtı sayımı {tarihKisa(p.ayarlar.donem_baslangic)} itibarıyla.
      </p>

      {pencere && (
        <KadroPenceresi key={pencere === "yeni" ? "yeni" : pencere.id} p={p} kisi={pencere === "yeni" ? null : pencere}
                        onKapat={() => setPencere(null)} onDegisti={onDegisti} />
      )}
    </>
  );
}

function KadroPenceresi({ p, kisi, onKapat, onDegisti }: {
  p: Pano;
  kisi: KadroUyesi | null;
  onKapat: () => void;
  onDegisti: () => void;
}) {
  const [ara, setAra] = useState("");
  const [sonuclar, setSonuclar] = useState<(Kisi & { kadroda: boolean; gonullu: number })[]>([]);
  const [secilen, setSecilen] = useState<Kisi | null>(kisi);
  const [rol, setRol] = useState(kisi?.rol ?? "");
  const [durum, setDurum] = useState<"deneme" | "kesin">(kisi?.durum ?? "deneme");
  const [mesaj, setMesaj] = useState<{ metin: string; hata?: boolean } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [cikarOnay, setCikarOnay] = useState(false);

  // Kişi arama: yazmayı bırakınca (300 ms). Boşken en çok gönüllü işi olanlar gelir.
  useEffect(() => {
    if (kisi) return;
    const z = setTimeout(() => {
      ekip.kisiAra(ara.trim()).then(setSonuclar).catch(() => setSonuclar([]));
    }, 300);
    return () => clearTimeout(z);
  }, [ara, kisi]);

  async function calistir(f: () => Promise<unknown>) {
    setMesgul(true);
    setMesaj(null);
    try {
      await f();
      onDegisti();
      onKapat();
    } catch (h) {
      setMesaj({ metin: h instanceof OdulHatasi ? h.message : "Olmadı, tekrar dene.", hata: true });
    } finally {
      setMesgul(false);
    }
  }

  const doluluk = (kod: string) => p.kadro.filter((k) => k.rol === kod && k.id !== secilen?.id).length;

  return (
    <Pencere baslik={kisi ? kisi.ad : "Kadroya ekle"} onKapat={onKapat}>
      <div className="yigin">
        {!kisi && (
          <>
            <label className="alan">
              <span className="etiket">Kişi</span>
              <input className="girdi" value={ara} autoFocus placeholder="Ad ya da kullanıcı adı" maxLength={60}
                     onChange={(e) => { setAra(e.target.value); setSecilen(null); }} />
            </label>
            {!secilen && (
              <ul className="kisi-sonuclari">
                {sonuclar.map((s) => (
                  <li key={s.id}>
                    <button type="button" disabled={s.kadroda} onClick={() => setSecilen(s)}>
                      <b>{s.ad}</b>
                      <small className="soluk">@{s.kullanici_adi}{s.gonullu > 0 ? ` · ${s.gonullu} gönüllü işi` : ""}{s.kadroda ? " · zaten kadroda" : ""}</small>
                    </button>
                  </li>
                ))}
                {sonuclar.length === 0 && <li className="soluk">Sonuç yok.</li>}
              </ul>
            )}
            {secilen && <p className="secilen-kisi"><Simge ad="tik" boyut={14} /> {secilen.ad} <small className="soluk">@{secilen.kullanici_adi}</small></p>}
          </>
        )}

        <label className="alan">
          <span className="etiket">Rol</span>
          <select className="girdi" value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="">Seç</option>
            {p.ekipler.map((e) => (
              <optgroup key={e.kod} label={e.ad}>
                {p.roller.filter((r) => r.ekip === e.kod).map((r) => (
                  <option key={r.kod} value={r.kod}>{r.ad} ({doluluk(r.kod)}/{r.kontenjan})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {rol && doluluk(rol) >= (p.roller.find((r) => r.kod === rol)?.kontenjan ?? 1) && (
          <p className="bildirim bilgi">Bu rolün koltukları dolu. Yine de eklenebilir; belgedeki sayılar bir başlangıç önerisi.</p>
        )}
        <div className="durum-secici" role="group" aria-label="Durum">
          <button type="button" className="cip" aria-pressed={durum === "deneme"} onClick={() => setDurum("deneme")}>Deneme sürecinde</button>
          <button type="button" className="cip" aria-pressed={durum === "kesin"} onClick={() => setDurum("kesin")}>Rolü kesinleşti</button>
        </div>

        {mesaj && <p className={"bildirim" + (mesaj.hata ? "" : " bilgi")} role="alert">{mesaj.metin}</p>}

        <div className="pencere-dip">
          {kisi && (
            <button type="button" className="dugme tehlike" disabled={mesgul}
                    onClick={() => cikarOnay ? calistir(() => ekip.kadroCikar(kisi.id)) : setCikarOnay(true)}>
              {cikarOnay ? "Çıkarılsın mı?" : "Kadrodan çıkar"}
            </button>
          )}
          <button type="button" className="dugme birincil" disabled={mesgul || !secilen || !rol}
                  onClick={() => secilen && calistir(() => ekip.kadroKaydet(secilen.id, rol, durum))}>
            Kaydet
          </button>
        </div>
      </div>
    </Pencere>
  );
}

function tarihKisa(gun: string) {
  const [y, a, g] = gun.slice(0, 10).split("-").map(Number);
  return new Date(y, a - 1, g).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}
