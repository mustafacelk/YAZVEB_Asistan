import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { supabase, type Etkinlik } from "../veri/supabase";
import { useOturum } from "../veri/oturum";
import Simge from "../tasarim/Simge";
import { odul, sayi, type EtkinlikOzeti } from "../veri/odul";
import { ODUL_DEGISTI } from "../veri/gezinme";
import { suruyorMu } from "../veri/bicim";

type Taslak = {
  id?: number;
  baslik: string;
  aciklama: string;
  yer: string;
  baslangic: string;   // datetime-local biçimi
};

const BOS: Taslak = { baslik: "", aciklama: "", yer: "", baslangic: "" };

/** Silme onayının açık kalma süresi. */
const ONAY_MS = 3000;

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Etkinlik takvimi.
 *
 * Kim ne yapabilir:
 *   üye      → yalnızca görür
 *   yönetici → ekler, kendi ve diğer yöneticilerin kayıtlarını düzenler/siler
 *   başkan   → her şeyi yapar; dokunduğu kayıt kilitlenir ve yöneticiler
 *              o kayda bir daha dokunamaz
 *
 * Buradaki kontroller yalnızca düğmeleri gizler. Kural veritabanında.
 *
 * "Bu etkinliğe gelirsem ne olur?" — puan görevi olan etkinlikte kazanılacak
 * XP, katıldığın geçmiş etkinlikte "Katıldın" yazar. Katılmadığın geçmiş
 * etkinlikte hiçbir şey: kaçırdın demek yok.
 */
export default function Etkinlikler() {
  const { yetkiliMi, baskanMi } = useOturum();
  const [ozet, setOzet] = useState<Map<number, EtkinlikOzeti>>(new Map());
  const [liste, setListe] = useState<Etkinlik[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [taslak, setTaslak] = useState<Taslak | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    let gecerli = true;
    (async () => {
      const { data, error } = await supabase
        .from("etkinlikler")
        .select("*")
        .order("baslangic", { ascending: true });
      if (!gecerli) return;
      if (error) setHata("Etkinlikler yüklenemedi.");
      else setListe(data as Etkinlik[]);
      setYukleniyor(false);
    })();

    const kanal = supabase
      .channel("etkinlik-akisi")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "etkinlikler" },
        () => tazele(),
      )
      .subscribe();

    const ozetiAl = () =>
      odul.etkinlikOzeti().then((l) => { if (gecerli) setOzet(new Map(l.map((o) => [o.etkinlik_id, o]))); });
    ozetiAl();
    window.addEventListener(ODUL_DEGISTI, ozetiAl);

    return () => {
      gecerli = false;
      supabase.removeChannel(kanal);
      window.removeEventListener(ODUL_DEGISTI, ozetiAl);
    };
  }, []);

  // Pencere açıkken Esc kapatır.
  useEffect(() => {
    if (!taslak) return;
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") setTaslak(null); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [taslak]);

  async function tazele() {
    const { data } = await supabase
      .from("etkinlikler")
      .select("*")
      .order("baslangic", { ascending: true });
    if (data) setListe(data as Etkinlik[]);
  }

  /** Bu kaydı bu kullanıcı değiştirebilir mi? Kuralın arayüzdeki yansıması. */
  function duzenlenebilir(e: Etkinlik) {
    if (baskanMi) return true;
    return yetkiliMi && !e.baskan_kilidi;
  }

  async function kaydet() {
    if (!taslak) return;
    setHata(null);
    const govde = {
      baslik: taslak.baslik.trim(),
      aciklama: taslak.aciklama.trim() || null,
      yer: taslak.yer.trim() || null,
      baslangic: taslak.baslangic ? new Date(taslak.baslangic).toISOString() : "",
    };
    if (!govde.baslik || !taslak.baslangic) {
      setHata("Başlık ve tarih gerekli.");
      return;
    }

    setKaydediliyor(true);
    const { error } = taslak.id
      ? await supabase.from("etkinlikler").update(govde).eq("id", taslak.id)
      : await supabase.from("etkinlikler").insert(govde);
    setKaydediliyor(false);

    if (error) {
      // En olası sebep: yönetici, başkanın kilitlediği kaydı düzenlemeye
      // çalıştı. Veritabanı reddetti — arayüz bunu anlaşılır şekilde söyler.
      setHata(
        taslak.id
          ? "Bu etkinliği değiştirme yetkin yok. Başkanın düzenlediği kayıtlar kilitlidir."
          : "Etkinlik eklenemedi. Yetkin olmayabilir.",
      );
      return;
    }
    setTaslak(null);
    tazele();
  }

  async function sil(e: Etkinlik) {
    const { error } = await supabase.from("etkinlikler").delete().eq("id", e.id);
    if (error) setHata("Silinemedi. Başkanın kilitlediği kayıtlar korunur.");
    else tazele();
  }

  const simdi = Date.now();
  // Sürmekte olan etkinlik "geçmiş" sayılmaz: tam o an QR okutuluyor.
  const yaklasan = liste.filter((e) => new Date(e.baslangic).getTime() >= simdi || suruyorMu(e, simdi));
  const gecmis = liste
    .filter((e) => new Date(e.baslangic).getTime() < simdi && !suruyorMu(e, simdi))
    .reverse();

  return (
    <div className="sayfa">
      <div className="sutun">
        <header className="sayfa-basi">
          <div>
            <span className="etiket gir">Takvim</span>
            <h1 className="gir" style={kademe(1)}>Etkinlikler</h1>
            <p className="sayfa-aciklama gir" style={kademe(2)}>Katıldığın etkinlikte QR'yi okut, yanında yazan puanı kazan.</p>
          </div>
          <div className="sayfa-basi-eylem">
            {yetkiliMi && (
              // Yalnızca yetkiliye görünür ve ikincil: ekranın asıl işi takvimi görmek.
              <button className="dugme cizgili gir" style={kademe(3)} onClick={() => { setHata(null); setTaslak({ ...BOS }); }}>
                <Simge ad="arti" boyut={16} />
                Yeni etkinlik
              </button>
            )}
          </div>
        </header>

        {hata && !taslak && <p className="bildirim" role="alert">{hata}</p>}

        {yukleniyor && (
          <div className="yigin" aria-label="Yükleniyor">
            {[70, 45, 60].map((g, i) => (
              <div key={i} className="iskelet" style={{ width: g + "%" }} />
            ))}
          </div>
        )}

        {!yukleniyor && liste.length === 0 && (
          <div className="bos gir">
            <Simge ad="etkinlik" boyut={28} />
            <b>Takvim boş.</b>
            <span>{yetkiliMi ? "İlk etkinliği sen ekle." : "Yeni etkinlikler burada görünecek."}</span>
          </div>
        )}

        {yaklasan.length > 0 && (
          <section>
            <div className="bolum-basi gir" style={kademe(2)}>
              <span className="etiket">Yaklaşan</span>
              <span className="etiket rakam">{yaklasan.length}</span>
            </div>
            {yaklasan.map((e, i) => (
              <Satir
                key={e.id}
                etkinlik={e}
                sira={i + 3}
                siradaki={i === 0}
                ozet={ozet.get(e.id)}
                duzenlenebilir={duzenlenebilir(e)}
                onDuzenle={() => { setHata(null); setTaslak(taslagaCevir(e)); }}
                onSil={() => sil(e)}
              />
            ))}
          </section>
        )}

        {gecmis.length > 0 && (
          <section>
            <div className="bolum-basi">
              <span className="etiket">Geçmiş</span>
              <span className="etiket rakam">{gecmis.length}</span>
            </div>
            {gecmis.map((e) => (
              <Satir
                key={e.id}
                etkinlik={e}
                gecmis
                ozet={ozet.get(e.id)}
                duzenlenebilir={duzenlenebilir(e)}
                onDuzenle={() => { setHata(null); setTaslak(taslagaCevir(e)); }}
                onSil={() => sil(e)}
              />
            ))}
          </section>
        )}
      </div>

      {/* Pencere body'ye taşınır: sahne katmanı kendi yığın bağlamını
          kuruyor ve içindeki hiçbir şey gezinme çubuğunun üstüne çıkamıyor. */}
      {taslak && createPortal(
        <div className="katman" onClick={() => setTaslak(null)}>
          <div
            className="pencere"
            role="dialog"
            aria-modal="true"
            aria-labelledby="etkinlik-pencere-baslik"
            onClick={(o) => o.stopPropagation()}
          >
            <div className="pencere-basi">
              <h2 id="etkinlik-pencere-baslik">{taslak.id ? "Etkinliği düzenle" : "Yeni etkinlik"}</h2>
              <button className="ikon-dugme" onClick={() => setTaslak(null)} aria-label="Kapat">
                <Simge ad="kapat" />
              </button>
            </div>
            <form
              className="yigin"
              onSubmit={(o) => { o.preventDefault(); kaydet(); }}
            >
              <label className="alan">
                <span className="etiket">Başlık</span>
                <input
                  className="girdi"
                  value={taslak.baslik}
                  onChange={(o) => setTaslak({ ...taslak, baslik: o.target.value })}
                  maxLength={120}
                  autoFocus
                />
              </label>
              <label className="alan">
                <span className="etiket">Tarih ve saat</span>
                <input
                  className="girdi"
                  type="datetime-local"
                  value={taslak.baslangic}
                  onChange={(o) => setTaslak({ ...taslak, baslangic: o.target.value })}
                />
              </label>
              <label className="alan">
                <span className="etiket">Yer <i>(isteğe bağlı)</i></span>
                <input
                  className="girdi"
                  value={taslak.yer}
                  onChange={(o) => setTaslak({ ...taslak, yer: o.target.value })}
                  maxLength={120}
                />
              </label>
              <label className="alan">
                <span className="etiket">Açıklama <i>(isteğe bağlı)</i></span>
                <textarea
                  className="girdi"
                  rows={4}
                  value={taslak.aciklama}
                  onChange={(o) => setTaslak({ ...taslak, aciklama: o.target.value })}
                  maxLength={2000}
                />
              </label>
              {hata && <p className="bildirim" role="alert">{hata}</p>}
              <div className="pencere-dip">
                <button type="button" className="dugme" onClick={() => setTaslak(null)}>Vazgeç</button>
                <button type="submit" className="dugme birincil" disabled={kaydediliyor}>
                  {kaydediliyor ? "Kaydediliyor" : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Satir({
  etkinlik,
  duzenlenebilir,
  gecmis,
  siradaki,
  ozet,
  sira = 0,
  onDuzenle,
  onSil,
}: {
  etkinlik: Etkinlik;
  duzenlenebilir: boolean;
  gecmis?: boolean;
  siradaki?: boolean;
  ozet?: EtkinlikOzeti;
  sira?: number;
  onDuzenle: () => void;
  onSil: () => void;
}) {
  // Silme iki adımlı: ilk dokunuş onay ister, 3 sn içinde ikinci dokunuş siler.
  const [onay, setOnay] = useState(false);
  const zaman = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (zaman.current) clearTimeout(zaman.current); }, []);

  const t = new Date(etkinlik.baslangic);
  return (
    <article className={"etkinlik gir" + (gecmis ? " gecmis" : "")} style={kademe(Math.min(sira, 8))}>
      <div className="etkinlik-tarih">
        <b>{t.toLocaleDateString("tr-TR", { day: "2-digit" })}</b>
        <span className="etiket">{t.toLocaleDateString("tr-TR", { month: "short" })}</span>
      </div>

      <div className="etkinlik-govde">
        {(siradaki || ozet) && (
          <span className="etkinlik-ust">
            {siradaki && (
              <span className="etiket siradaki">{suruyorMu(etkinlik) ? "Şu an" : "Sıradaki"}</span>
            )}
            {ozet?.katildi ? (
              <span className="xp-cipi katildi"><Simge ad="tik" boyut={14} /> Katıldın</span>
            ) : !gecmis && ozet && ozet.puan > 0 ? (
              <span className="xp-cipi rakam" title="Etkinlikte QR'yi okutunca kazanacağın puan">+{sayi(ozet.puan)} XP</span>
            ) : null}
          </span>
        )}
        <h3>
          {etkinlik.baslik}
          {etkinlik.baskan_kilidi && (
            <span className="rozet rol-baskan" title="Başkan tarafından düzenlendi; yöneticiler değiştiremez">
              Başkan
            </span>
          )}
        </h3>
        <div className="etkinlik-meta">
          <span className="rakam">
            {t.toLocaleDateString("tr-TR", { weekday: "long" })} ·{" "}
            {t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {etkinlik.yer && (
            <span>
              <Simge ad="konum" boyut={14} />
              {etkinlik.yer}
            </span>
          )}
        </div>
        {etkinlik.aciklama && <p className="etkinlik-aciklama">{etkinlik.aciklama}</p>}
      </div>

      {duzenlenebilir && (
        <div className="etkinlik-eylem">
          <button className="ikon-dugme kucuk" onClick={onDuzenle} aria-label="Düzenle" data-ipucu="Düzenle">
            <Simge ad="kalem" boyut={16} />
          </button>
          <button
            className={"ikon-dugme kucuk" + (onay ? " onay-sil" : "")}
            onClick={() => {
              if (onay) {
                if (zaman.current) clearTimeout(zaman.current);
                setOnay(false);
                onSil();
                return;
              }
              setOnay(true);
              zaman.current = setTimeout(() => setOnay(false), ONAY_MS);
            }}
            aria-label={onay ? `"${etkinlik.baslik}" silinsin mi? Onaylamak için tekrar dokun` : "Sil"}
            data-ipucu={onay ? "Silmek için tekrar" : "Sil"}
          >
            <Simge ad="cop" boyut={16} />
          </button>
        </div>
      )}
    </article>
  );
}

function taslagaCevir(e: Etkinlik): Taslak {
  // datetime-local yerel saat bekler; ISO'daki Z'yi doğrudan veremeyiz.
  const t = new Date(e.baslangic);
  const yerel = new Date(t.getTime() - t.getTimezoneOffset() * 60000);
  return {
    id: e.id,
    baslik: e.baslik,
    aciklama: e.aciklama ?? "",
    yer: e.yer ?? "",
    baslangic: yerel.toISOString().slice(0, 16),
  };
}
