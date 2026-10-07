import { useCallback, useEffect, useState } from "react";
import Simge from "../tasarim/Simge";
import { Bolum, Bos, Satir, SatirIskeleti, Satirlar } from "../tasarim/Dunya";
import { supabase, type Etkinlik } from "../veri/supabase";
import { OdulHatasi } from "../veri/odul";
import {
  acikIsZamani,
  ekip,
  gunEkle,
  sinavHaftasi,
  type AcikIsTaslagi,
  type EkipKodu,
  type HavuzYonetimi as HavuzVerisi,
  type Pano,
  type UstlenmeDurumu,
  type YonetimAcikIsi,
} from "../veri/ekip";
import Pencere from "./Pencere";

const USTLENME_ADI: Record<UstlenmeDurumu, string> = {
  ustlendi: "Üstlendi",
  teslim: "Yaptım dedi",
  onaylandi: "Onaylandı",
  birakti: "Bıraktı",
  olmadi: "Olmadı",
};

/**
 * Gönüllü havuzu — liderlerin tarafı (YAZVEB Yeni Yönetim Yapısı §4).
 *
 *   • Her ekip lideri ayda en az 2 açık iş çıkarır; ilk ay 8 iş yeter.
 *   • Açık işlerin çoğu saha dışı olmalı (sahada 25 kişi sınırı).
 *   • Sponsor ya da konuşmacıyla temas açık iş olarak verilmez.
 *   • Tamamlanan iş adıyla anılır; iki üç iş tamamlayan boşalan koltuğa ilk aday.
 *   • Gönüllüde kaçan teslim kaydı tutulmaz ("Olmadı" kimseye gösterilmez).
 */
export default function HavuzYonetimi({ pano }: { pano: Pano }) {
  const [v, setV] = useState<HavuzVerisi | null>(null);
  const [etkinlikler, setEtkinlikler] = useState<Etkinlik[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState<number | "yeni" | null>(null);

  const yukle = useCallback(async () => {
    try {
      setV(await ekip.havuzYonetim());
      setHata(null);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Havuz yüklenemedi.");
    }
  }, []);
  useEffect(() => {
    yukle();
    supabase.from("etkinlikler").select("*")
      .gte("baslangic", new Date(Date.now() - 86_400_000).toISOString())
      .order("baslangic", { ascending: true }).limit(20)
      .then(({ data }) => setEtkinlikler((data as Etkinlik[] | null) ?? []));
  }, [yukle]);

  if (hata) return <p className="bildirim" role="alert">{hata}</p>;
  if (!v) return <SatirIskeleti adet={3} />;

  const acikIsler = v.isler.filter((a) => a.durum === "acik" && a.tarih >= pano.bugun);
  const gecmis = v.isler.filter((a) => !(a.durum === "acik" && a.tarih >= pano.bugun));
  const secili = typeof acik === "number" ? v.isler.find((a) => a.id === acik) ?? null : null;
  const calismaEkipleri = pano.ekipler.filter((e) => e.kod !== "cekirdek");

  return (
    <>
      {v.sinav && <p className="bildirim bilgi gir">{v.sinav} haftası: havuza yeni iş yazılmıyor.</p>}

      <div className="havuz-ay gir" aria-label="Bu ay açılan açık işler">
        <span className="etiket">Bu ay açılan işler · hedef ekip başına {v.hedef}</span>
        <div className="cipler">
          {calismaEkipleri.map((e) => {
            const n = v.ay[e.kod] ?? 0;
            return (
              <span key={e.kod} className="cip havuz-ay-cip" data-eksik={n < v.hedef || undefined}>
                {e.ad} <b className="rakam">{n}/{v.hedef}</b>
              </span>
            );
          })}
        </div>
      </div>

      {v.yonettikleri.length > 0 && !v.sinav && (
        <div className="pano-ust gir">
          <p className="soluk">1–3 saatlik, tek seferlik işler. Çoğu saha dışı olsun.</p>
          <button className="dugme birincil" onClick={() => setAcik("yeni")}><Simge ad="arti" boyut={16} /> Açık iş yaz</button>
        </div>
      )}

      <Bolum etiket="Açık işler" sira={3} sag={<span className="etiket rakam">{acikIsler.length}</span>}>
        {acikIsler.length === 0 ? (
          <Bos simge="yildiz" baslik="Havuzda açık iş yok."
               aciklama="Fırsat bülteni için yarışma bulmak, fotoğraflardan seçki, afiş metninde hata aramak, kayıt masasında bir saat…" />
        ) : (
          <Satirlar>{acikIsler.map((a) => <HavuzSatiri key={a.id} a={a} bugun={pano.bugun} onAc={() => setAcik(a.id)} />)}</Satirlar>
        )}
      </Bolum>

      {gecmis.length > 0 && (
        <Bolum etiket="Kapanan ve geçmiş işler" sira={4}>
          <Satirlar>{gecmis.map((a) => <HavuzSatiri key={a.id} a={a} bugun={pano.bugun} onAc={() => setAcik(a.id)} />)}</Satirlar>
        </Bolum>
      )}

      <Bolum etiket="Koltuk için ilk adaylar" sira={5}>
        <p className="soluk kucuk havuz-aciklama">
          Kadroda olmayan, en çok işi tamamlayan gönüllüler. İki üç iş tamamlayan, boşalan koltuk için deneme görevi yerine yaptığı işlerle değerlendirilir.
        </p>
        {v.adaylar.length === 0 ? <p className="soluk">Henüz onaylanmış gönüllü işi yok.</p> : (
          <Satirlar>
            {v.adaylar.map((k) => (
              <Satir key={k.id} simge={k.tamamlanan >= 2 ? "yildiz" : "kisi"} baslik={k.ad}
                     aciklama={`@${k.kullanici_adi} · son iş ${tarihKisa(k.son)}`}
                     deger={<span className={"rakam" + (k.tamamlanan >= 2 ? " aday-isareti" : "")}>{k.tamamlanan} iş{k.tamamlanan >= 2 ? " · ilk aday" : ""}</span>} />
            ))}
          </Satirlar>
        )}
      </Bolum>

      {(acik === "yeni" || secili) && (
        <AcikIsPenceresi key={acik} pano={pano} is={secili} etkinlikler={etkinlikler}
                         yonettikleri={v.yonettikleri} onKapat={() => setAcik(null)} onDegisti={yukle} />
      )}
    </>
  );
}

function HavuzSatiri({ a, bugun, onAc }: { a: YonetimAcikIsi; bugun: string; onAc: () => void }) {
  const bekleyen = a.ustlenenler.filter((u) => u.durum === "ustlendi" || u.durum === "teslim").length;
  const yaptim = a.ustlenenler.filter((u) => u.durum === "teslim").length;
  return (
    <Satir
      simge={a.durum === "iptal" ? "kapat" : a.saha ? "konum" : "yildiz"}
      canli={yaptim > 0}
      baslik={a.baslik}
      aciklama={<span className="rakam">{a.ekip_adi} · {acikIsZamani(a, bugun)}{a.etkinlik ? ` · ${a.etkinlik.baslik}` : ""}</span>}
      deger={
        <span className="havuz-deger">
          <span className="rakam">{a.dolu}/{a.kontenjan}</span>
          {yaptim > 0 ? <small className="uyari-metin">{yaptim} onay bekliyor</small>
            : a.durum !== "acik" ? <small>{a.durum === "iptal" ? "İptal" : "Kapandı"}</small>
            : bekleyen > 0 ? <small>üstlenildi</small> : null}
        </span>
      }
      onClick={onAc}
    />
  );
}

function AcikIsPenceresi({ pano, is, etkinlikler, yonettikleri, onKapat, onDegisti }: {
  pano: Pano;
  is: YonetimAcikIsi | null;
  etkinlikler: Etkinlik[];
  yonettikleri: EkipKodu[];
  onKapat: () => void;
  onDegisti: () => void;
}) {
  const yonetir = is ? yonettikleri.includes(is.ekip) : yonettikleri.length > 0;
  const duzenlenebilir = yonetir && (!is || (is.durum === "acik" && is.tarih >= pano.bugun));
  const [t, setT] = useState<AcikIsTaslagi>({
    id: is?.id,
    baslik: is?.baslik ?? "",
    aciklama: is?.aciklama ?? "",
    ekip: is?.ekip ?? (yonettikleri.find((e) => e !== "cekirdek") ?? yonettikleri[0] ?? "etkinlik"),
    sure_saat: is?.sure_saat ?? 1,
    tarih: is?.tarih ?? gunEkle(pano.bugun, 3),
    saat: is?.saat?.slice(0, 5) ?? "",
    etkinlik_id: is?.etkinlik_id ?? null,
    saha: is?.saha ?? false,
    kontenjan: is?.kontenjan ?? 1,
  });
  const [mesaj, setMesaj] = useState<{ metin: string; hata?: boolean } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const sinav = sinavHaftasi(t.tarih, pano.sinav);
  const temas = /(sponsor|konuşmacı|konusmaci|konuk)/i.test(`${t.baslik} ${t.aciklama}`);

  async function calistir<T>(f: () => Promise<T>, sonra?: (r: T) => string | null, kapat = false) {
    setMesgul(true);
    setMesaj(null);
    try {
      const r = await f();
      const m = sonra?.(r) ?? null;
      onDegisti();
      if (kapat && !m) onKapat();
      else if (m) setMesaj({ metin: m });
    } catch (h) {
      setMesaj({ metin: h instanceof OdulHatasi ? h.message : "Olmadı, tekrar dene.", hata: true });
    } finally {
      setMesgul(false);
    }
  }

  return (
    <Pencere baslik={is ? (duzenlenebilir ? "Açık işi düzenle" : is.baslik) : "Açık iş yaz"} onKapat={onKapat}>
      <div className="yigin">
        {duzenlenebilir ? (
          <form className="yigin" onSubmit={(e) => {
            e.preventDefault();
            calistir(() => ekip.acikIsKaydet({ ...t, saat: t.saat || undefined, etkinlik_id: t.etkinlik_id || null }), undefined, true);
          }}>
            <label className="alan">
              <span className="etiket">İş</span>
              <input className="girdi" value={t.baslik} maxLength={120} autoFocus={!is}
                     placeholder="Örn. Kayıt masasında bir saat"
                     onChange={(e) => setT({ ...t, baslik: e.target.value })} />
            </label>
            <label className="alan">
              <span className="etiket">Ne yapılacak <i>(isteğe bağlı)</i></span>
              <textarea className="girdi" rows={2} maxLength={600} value={t.aciklama}
                        onChange={(e) => setT({ ...t, aciklama: e.target.value })} />
            </label>
            {temas && (
              <p className="bildirim bilgi">Sponsor ya da konuşmacıyla temas açık iş olarak verilmez; o iş Dış İlişkiler'de kalır.</p>
            )}
            <div className="alan-ikili">
              <label className="alan">
                <span className="etiket">Ekip</span>
                <select className="girdi" value={t.ekip} onChange={(e) => setT({ ...t, ekip: e.target.value as EkipKodu })}>
                  {pano.ekipler.filter((e) => yonettikleri.includes(e.kod)).map((e) => <option key={e.kod} value={e.kod}>{e.ad}</option>)}
                </select>
              </label>
              <label className="alan">
                <span className="etiket">Süre</span>
                <select className="girdi" value={t.sure_saat} onChange={(e) => setT({ ...t, sure_saat: Number(e.target.value) })}>
                  <option value={1}>1 saat</option><option value={2}>2 saat</option><option value={3}>3 saat</option>
                </select>
              </label>
            </div>
            <div className="alan-ikili">
              <label className="alan">
                <span className="etiket">Gün</span>
                <input className="girdi" type="date" value={t.tarih} min={pano.bugun} onChange={(e) => setT({ ...t, tarih: e.target.value })} />
              </label>
              <label className="alan">
                <span className="etiket">Saat <i>(isteğe bağlı)</i></span>
                <input className="girdi" type="time" value={t.saat} onChange={(e) => setT({ ...t, saat: e.target.value })} />
              </label>
            </div>
            {sinav && <p className="bildirim">{sinav} haftasında havuza iş yazılmaz.</p>}
            <label className="alan">
              <span className="etiket">Etkinlik <i>(isteğe bağlı)</i></span>
              <select className="girdi" value={t.etkinlik_id ?? ""} onChange={(e) => setT({ ...t, etkinlik_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Bir etkinliğe bağlı değil</option>
                {etkinlikler.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.baslik} · {new Date(e.baslangic).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  </option>
                ))}
              </select>
            </label>
            <div className="alan-ikili">
              <label className="alan">
                <span className="etiket">Kaç kişi</span>
                <input className="girdi" type="number" min={1} max={10} value={t.kontenjan}
                       onChange={(e) => setT({ ...t, kontenjan: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
              </label>
              <label className="onay-kutusu">
                <input type="checkbox" checked={t.saha} onChange={(e) => setT({ ...t, saha: e.target.checked })} />
                <span>Sahada <small className="soluk">(25 kişilik sınıra sayılır)</small></span>
              </label>
            </div>
            <div className="pencere-dip">
              <button type="submit" className="dugme birincil" disabled={mesgul || t.baslik.trim().length < 3 || !!sinav}>
                {is ? "Kaydet" : "Havuza ekle"}
              </button>
            </div>
          </form>
        ) : is && (
          <dl className="is-ayrinti">
            <div><dt className="etiket">Ekip</dt><dd>{is.ekip_adi}</dd></div>
            <div><dt className="etiket">Ne zaman</dt><dd className="rakam">{acikIsZamani(is, pano.bugun)}</dd></div>
            {is.etkinlik && <div><dt className="etiket">Etkinlik</dt><dd>{is.etkinlik.baslik}</dd></div>}
            {is.aciklama && <div><dt className="etiket">Ne yapılacak</dt><dd>{is.aciklama}</dd></div>}
          </dl>
        )}

        {is && (
          <section className="is-bolum">
            <span className="etiket">Üstlenenler · {is.dolu}/{is.kontenjan}</span>
            {is.ustlenenler.length === 0 ? <p className="soluk">Henüz kimse üstlenmedi.</p> : (
              <ul className="ustlenenler">
                {is.ustlenenler.map((u) => (
                  <li key={u.id}>
                    <span className="ustlenen-ad">
                      <b>{u.ad}</b>
                      <small className="soluk">{USTLENME_ADI[u.durum]}{u.durum === "onaylandi" && u.xp > 0 ? ` · +${u.xp} XP` : ""}</small>
                    </span>
                    {yonetir && (u.durum === "ustlendi" || u.durum === "teslim") && (
                      <span className="havuz-eylemler">
                        <button className="dugme birincil" disabled={mesgul}
                                onClick={() => calistir(() => ekip.karar(is.id, u.id, "onayla"),
                                  (r) => `${u.ad} adına kayda geçti${r.xp > 0 ? `, +${r.xp} XP` : " (haftalık puan tavanı dolu)"}.`)}>
                          Onayla
                        </button>
                        <button className="dugme" disabled={mesgul}
                                onClick={() => calistir(() => ekip.karar(is.id, u.id, "olmadi"), () => "Kayıt tutulmadı; yer yeniden açıldı.")}>
                          Olmadı
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {is && yonetir && (
          <div className="pencere-dip">
            {is.durum === "acik" ? (
              <>
                <button className="dugme" disabled={mesgul} onClick={() => calistir(() => ekip.acikIsKapat(is.id, "kapandi"), undefined, true)}>
                  Kapat
                </button>
                <button className="dugme tehlike" disabled={mesgul} onClick={() => calistir(() => ekip.acikIsKapat(is.id, "iptal"), undefined, true)}>
                  İptal et
                </button>
              </>
            ) : is.tarih >= pano.bugun && (
              <button className="dugme" disabled={mesgul} onClick={() => calistir(() => ekip.acikIsKapat(is.id, "acik"), undefined, true)}>
                Yeniden aç
              </button>
            )}
          </div>
        )}

        {mesaj && <p className={"bildirim" + (mesaj.hata ? "" : " bilgi")} role="status">{mesaj.metin}</p>}
      </div>
    </Pencere>
  );
}

function tarihKisa(t: string) {
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}
