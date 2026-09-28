import { useState } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import { BolumOnerileri } from "../kimlik/Dogrulama";
import { OdulHatasi } from "../veri/odul";
import { pano } from "../veri/pano";
import {
  boyutEtiketi, donemEtiketi, dosyaTuru, kunyeHatasi, puanOzeti, simdikiDonem, SINIFLAR, TURLER, YARIYILLAR,
  type Kunye, type NotTuru, type PuanAyari, type Sinif,
} from "../veri/pano_bicim";

/**
 * Not paylaşma: dosya + künye. Künye veritabanıyla aynı kuralla denetlenir;
 * üniversite doğrulanan e-postadan gelir, burada sorulmaz.
 */
export default function PaylasPenceresi({ ayar, sinavOncesi, varsayilan, onKapat, onPaylasildi, onDogrula }: {
  ayar: PuanAyari;
  sinavOncesi: boolean;
  varsayilan: { bolum: string; sinif: Sinif | ""; ders_adi?: string; ders_kodu?: string };
  onKapat: () => void;
  onPaylasildi: (mesaj: string) => void;
  onDogrula: () => void;
}) {
  const donem = simdikiDonem();
  const [k, setK] = useState<Kunye>({
    baslik: "", ders_adi: varsayilan.ders_adi ?? "", ders_kodu: varsayilan.ders_kodu ?? "",
    bolum: varsayilan.bolum, sinif: varsayilan.sinif,
    tur: "ders_notu", yil: donem.yil, yariyil: donem.yariyil, hoca: "", aciklama: "",
  });
  const [dosya, setDosya] = useState<File | null>(null);
  const [onay, setOnay] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [islemde, setIslemde] = useState(false);
  const yaz = <A extends keyof Kunye>(a: A, v: Kunye[A]) => setK((x) => ({ ...x, [a]: v }));
  const yillar = [donem.yil, donem.yil - 1, donem.yil - 2, donem.yil - 3, donem.yil - 4];

  const turu = dosya ? dosyaTuru(dosya.name, dosya.type) : null;

  async function gonder() {
    setHata(null);
    if (!dosya) { setHata("Bir dosya seç (PDF ya da fotoğraf)."); return; }
    if (!turu) { setHata("Yalnızca PDF, JPG, PNG ya da WEBP."); return; }
    if (dosya.size > ayar.azami_bayt) { setHata(`Dosya en fazla ${Math.round(ayar.azami_bayt / 1048576)} MB olabilir.`); return; }
    const h = kunyeHatasi(k);
    if (h) { setHata(h); return; }
    if (!onay) { setHata("Notun sana ait olduğunu onayla."); return; }
    setIslemde(true);
    try {
      const r = await pano.paylas(k, dosya, turu);
      if (r.durum === "tamam") {
        const taban = Math.round(ayar.taban_xp * (r.sinav_oncesi ? Number(ayar.sinav_carpani) : 1));
        onPaylasildi(`Notun yayında. ${ayar.onay_saat} saat içinde şikayet gelmezse +${taban} XP kazanacaksın.`);
      } else if (r.durum === "dogrulama_gerekli") {
        onDogrula();
      } else {
        setHata(r.mesaj);
      }
    } catch (e) {
      setHata(e instanceof OdulHatasi ? e.message : "Paylaşılamadı.");
    } finally {
      setIslemde(false);
    }
  }

  return createPortal(
    <div className="katman" onClick={islemde ? undefined : onKapat}>
      <div className="pencere paylas-penceresi" role="dialog" aria-modal="true" aria-labelledby="paylas-baslik" onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <h2 id="paylas-baslik">Not paylaş</h2>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat" disabled={islemde}><Simge ad="kapat" /></button>
        </div>
        <form className="yigin" onSubmit={(e) => { e.preventDefault(); gonder(); }}>
          <label className="dosya-sec" data-secili={!!dosya}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                   onChange={(e) => setDosya(e.target.files?.[0] ?? null)} />
            <Simge ad={dosya ? "tik" : "arti"} boyut={20} />
            <span>
              <b>{dosya ? dosya.name : "Dosya seç"}</b>
              <small className="soluk">{dosya ? `${boyutEtiketi(dosya.size)}${turu ? "" : " · desteklenmeyen tür"}` :
                `PDF ya da fotoğraf, en fazla ${Math.round(ayar.azami_bayt / 1048576)} MB`}</small>
            </span>
          </label>

          <div className="secici" role="tablist" aria-label="Not türü"
               style={{ ["--secim" as string]: TURLER.findIndex((t) => t.deger === k.tur), ["--adet" as string]: TURLER.length }}>
            <span className="secici-gosterge" aria-hidden="true" />
            {TURLER.map((t) => (
              <button key={t.deger} type="button" role="tab" aria-selected={k.tur === t.deger}
                      onClick={() => yaz("tur", t.deger as NotTuru)}>{t.kisa}</button>
            ))}
          </div>

          <label className="alan">
            <span className="etiket">Başlık</span>
            <input className="girdi" value={k.baslik} maxLength={120} onChange={(e) => yaz("baslik", e.target.value)}
                   placeholder={k.tur === "cikmis_cozum" ? "2025 vize soruları ve çözümleri" : "1-5. hafta ders notları"} />
          </label>
          <div className="alan-ikili">
            <label className="alan">
              <span className="etiket">Ders adı</span>
              <input className="girdi" value={k.ders_adi} maxLength={100} onChange={(e) => yaz("ders_adi", e.target.value)} placeholder="Veri Yapıları" />
            </label>
            <label className="alan">
              <span className="etiket">Ders kodu <i>(varsa)</i></span>
              <input className="girdi" value={k.ders_kodu} maxLength={20} autoCapitalize="characters"
                     onChange={(e) => yaz("ders_kodu", e.target.value)} placeholder="BM 203" />
            </label>
          </div>
          <div className="alan-ikili">
            <label className="alan">
              <span className="etiket">Bölüm</span>
              <input className="girdi" list="bolum-onerileri" value={k.bolum} maxLength={80} onChange={(e) => yaz("bolum", e.target.value)} />
            </label>
            <label className="alan">
              <span className="etiket">Sınıf</span>
              <select className="girdi buyuk-secim" value={k.sinif} onChange={(e) => yaz("sinif", e.target.value as Sinif | "")}>
                <option value="">Seç</option>
                {SINIFLAR.map((s) => <option key={s.deger} value={s.deger}>{s.ad}</option>)}
              </select>
            </label>
          </div>
          <BolumOnerileri />
          <div className="alan-ikili">
            <label className="alan">
              <span className="etiket">Dönem</span>
              <select className="girdi buyuk-secim" value={`${k.yil}-${k.yariyil}`}
                      onChange={(e) => { const [y, d] = e.target.value.split("-"); setK((x) => ({ ...x, yil: Number(y), yariyil: d as Kunye["yariyil"] })); }}>
                {yillar.flatMap((y) => YARIYILLAR.map((d) => (
                  <option key={`${y}-${d.deger}`} value={`${y}-${d.deger}`}>{donemEtiketi(y, d.deger)}</option>
                )))}
              </select>
            </label>
            <label className="alan">
              <span className="etiket">Hoca <i>(isteğe bağlı)</i></span>
              <input className="girdi" value={k.hoca} maxLength={80} onChange={(e) => yaz("hoca", e.target.value)} />
            </label>
          </div>
          <label className="alan">
            <span className="etiket">Açıklama <i>(isteğe bağlı)</i></span>
            <textarea className="girdi" rows={2} maxLength={500} value={k.aciklama} onChange={(e) => yaz("aciklama", e.target.value)}
                      placeholder="Hangi konuları kapsıyor, el yazısı mı, eksik var mı?" />
          </label>

          <label className="onay-kutusu">
            <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} />
            <span>Bu not bana ait. Hocanın slaytı, kitap sayfası ya da başkasının notu değil.</span>
          </label>
          <p className="soluk puan-ozeti">{puanOzeti(ayar, sinavOncesi)}</p>

          {hata && <p className="bildirim" role="alert">{hata}</p>}
          <button type="submit" className="dugme birincil genis" disabled={islemde}>
            {islemde ? "Yükleniyor…" : "Paylaş"}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
