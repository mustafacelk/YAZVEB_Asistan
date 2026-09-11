import { useEffect, useState } from "react";
import { supabase, type Etkinlik } from "../veri/supabase";
import { useOturum } from "../veri/oturum";

type Taslak = {
  id?: number;
  baslik: string;
  aciklama: string;
  yer: string;
  baslangic: string;   // datetime-local biçimi
};

const BOS: Taslak = { baslik: "", aciklama: "", yer: "", baslangic: "" };

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
 */
export default function Etkinlikler() {
  const { yetkiliMi, baskanMi } = useOturum();
  const [liste, setListe] = useState<Etkinlik[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [taslak, setTaslak] = useState<Taslak | null>(null);
  const [hata, setHata] = useState<string | null>(null);

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

    return () => {
      gecerli = false;
      supabase.removeChannel(kanal);
    };
  }, []);

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
      baslangic: new Date(taslak.baslangic).toISOString(),
    };
    if (!govde.baslik || !taslak.baslangic) {
      setHata("Başlık ve tarih gerekli.");
      return;
    }

    const { error } = taslak.id
      ? await supabase.from("etkinlikler").update(govde).eq("id", taslak.id)
      : await supabase.from("etkinlikler").insert(govde);

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
    if (!confirm(`"${e.baslik}" silinsin mi?`)) return;
    const { error } = await supabase.from("etkinlikler").delete().eq("id", e.id);
    if (error) setHata("Silinemedi. Başkanın kilitlediği kayıtlar korunur.");
    else tazele();
  }

  const simdi = Date.now();
  const yaklasan = liste.filter((e) => new Date(e.baslangic).getTime() >= simdi);
  const gecmis = liste
    .filter((e) => new Date(e.baslangic).getTime() < simdi)
    .reverse();

  return (
    <div className="sayfa">
      <header className="sayfa-basi">
        <h2>Etkinlikler</h2>
        {yetkiliMi && (
          <button className="birincil ufak" onClick={() => setTaslak({ ...BOS })}>
            + Yeni
          </button>
        )}
      </header>

      {hata && <p className="uyari" role="alert">{hata}</p>}
      {yukleniyor && <p className="sessiz">Yükleniyor…</p>}

      {!yukleniyor && liste.length === 0 && (
        <p className="sessiz">Henüz etkinlik yok.</p>
      )}

      {yaklasan.length > 0 && (
        <>
          <h3 className="bolum">Yaklaşan</h3>
          {yaklasan.map((e) => (
            <Kart
              key={e.id}
              etkinlik={e}
              duzenlenebilir={duzenlenebilir(e)}
              onDuzenle={() => setTaslak(taslagaCevir(e))}
              onSil={() => sil(e)}
            />
          ))}
        </>
      )}

      {gecmis.length > 0 && (
        <>
          <h3 className="bolum">Geçmiş</h3>
          {gecmis.map((e) => (
            <Kart
              key={e.id}
              etkinlik={e}
              gecmis
              duzenlenebilir={duzenlenebilir(e)}
              onDuzenle={() => setTaslak(taslagaCevir(e))}
              onSil={() => sil(e)}
            />
          ))}
        </>
      )}

      {taslak && (
        <div className="katman" onClick={() => setTaslak(null)}>
          <div className="pencere" onClick={(o) => o.stopPropagation()}>
            <h3>{taslak.id ? "Etkinliği düzenle" : "Yeni etkinlik"}</h3>
            <div className="alan-yigini">
              <label>
                <span>Başlık</span>
                <input
                  value={taslak.baslik}
                  onChange={(o) => setTaslak({ ...taslak, baslik: o.target.value })}
                  maxLength={120}
                />
              </label>
              <label>
                <span>Tarih ve saat</span>
                <input
                  type="datetime-local"
                  value={taslak.baslangic}
                  onChange={(o) => setTaslak({ ...taslak, baslangic: o.target.value })}
                />
              </label>
              <label>
                <span>Yer</span>
                <input
                  value={taslak.yer}
                  onChange={(o) => setTaslak({ ...taslak, yer: o.target.value })}
                  maxLength={120}
                />
              </label>
              <label>
                <span>Açıklama</span>
                <textarea
                  rows={4}
                  value={taslak.aciklama}
                  onChange={(o) => setTaslak({ ...taslak, aciklama: o.target.value })}
                  maxLength={2000}
                />
              </label>
              <div className="pencere-dip">
                <button onClick={() => setTaslak(null)}>Vazgeç</button>
                <button className="birincil" onClick={kaydet}>Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kart({
  etkinlik,
  duzenlenebilir,
  gecmis,
  onDuzenle,
  onSil,
}: {
  etkinlik: Etkinlik;
  duzenlenebilir: boolean;
  gecmis?: boolean;
  onDuzenle: () => void;
  onSil: () => void;
}) {
  const t = new Date(etkinlik.baslangic);
  return (
    <article className={"kart" + (gecmis ? " solgun" : "")}>
      <div className="kart-tarih">
        <b>{t.toLocaleDateString("tr-TR", { day: "2-digit" })}</b>
        <span>{t.toLocaleDateString("tr-TR", { month: "short" })}</span>
      </div>
      <div className="kart-govde">
        <h4>
          {etkinlik.baslik}
          {etkinlik.baskan_kilidi && (
            <span className="rozet rol-baskan" title="Başkan tarafından düzenlendi">
              Başkan
            </span>
          )}
        </h4>
        <p className="kart-ust">
          {t.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          {etkinlik.yer ? " · " + etkinlik.yer : ""}
        </p>
        {etkinlik.aciklama && <p className="kart-metin">{etkinlik.aciklama}</p>}
      </div>
      {duzenlenebilir && (
        <div className="kart-eylem">
          <button onClick={onDuzenle} aria-label="Düzenle" title="Düzenle">✎</button>
          <button onClick={onSil} aria-label="Sil" title="Sil">🗑</button>
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
