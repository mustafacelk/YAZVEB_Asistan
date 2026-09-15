import { useEffect, useState, type CSSProperties } from "react";
import { supabase, ROL_ADI, type Profil, type Rol } from "../veri/supabase";
import { useOturum } from "../veri/oturum";
import Simge from "../tasarim/Simge";

const SIRA: Record<Rol, number> = { baskan: 0, yonetici: 1, uye: 2 };

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Topluluk listesi ve rol yönetimi.
 *
 * Rol değiştirme seçicisi yalnızca başkana görünür. Görünmese bile kural
 * veritabanında: rol_degisimi_denetle tetikleyicisi başkan olmayan her
 * güncellemeyi reddeder, üstelik başkanın kendi rolünü düşürmesini de
 * engeller (topluluk başkansız kalmasın).
 */
export default function Topluluk() {
  const { profil, baskanMi, cikis, profiliTazele } = useOturum();
  const [kisiler, setKisiler] = useState<Profil[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [islemde, setIslemde] = useState<string | null>(null);
  const [adSoyad, setAdSoyad] = useState(profil?.ad_soyad ?? "");
  const [kaydedildi, setKaydedildi] = useState(false);

  useEffect(() => {
    getir();
  }, []);

  useEffect(() => {
    setAdSoyad(profil?.ad_soyad ?? "");
  }, [profil?.ad_soyad]);

  async function getir() {
    const { data, error } = await supabase.from("profiller").select("*");
    setYukleniyor(false);
    if (error) {
      setHata("Üye listesi alınamadı.");
      return;
    }
    const liste = (data as Profil[]).sort(
      (a, b) =>
        SIRA[a.rol] - SIRA[b.rol] ||
        a.kullanici_adi.localeCompare(b.kullanici_adi, "tr"),
    );
    setKisiler(liste);
  }

  async function rolDegistir(kisi: Profil, yeni: Rol) {
    setIslemde(kisi.id);
    setHata(null);
    const { error } = await supabase
      .from("profiller")
      .update({ rol: yeni })
      .eq("id", kisi.id);
    setIslemde(null);
    if (error) {
      setHata("Rol değiştirilemedi: " + error.message);
      return;
    }
    getir();
  }

  async function adiKaydet() {
    if (!profil) return;
    const { error } = await supabase
      .from("profiller")
      .update({ ad_soyad: adSoyad.trim() || null })
      .eq("id", profil.id);
    if (error) {
      setHata("Kaydedilemedi.");
      return;
    }
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 2000);
    await profiliTazele();
    getir();
  }

  const degisti = (adSoyad.trim() || null) !== (profil?.ad_soyad ?? null);

  return (
    <div className="sayfa">
      <div className="sutun">
        <header className="sayfa-basi">
          <div>
            <span className="etiket gir">YAZVEB</span>
            <h1 className="gir" style={kademe(1)}>Topluluk</h1>
          </div>
        </header>

        {hata && <p className="bildirim" role="alert">{hata}</p>}

        <section className="hesap gir" style={kademe(2)} aria-labelledby="hesap-baslik">
          <div className="hesap-kimlik">
            <span className="monogram buyuk" aria-hidden="true">
              {bashar(profil?.ad_soyad || profil?.kullanici_adi)}
            </span>
            <div className="hesap-ad">
              <h2 id="hesap-baslik">{profil?.ad_soyad || "@" + profil?.kullanici_adi}</h2>
              <p>
                @{profil?.kullanici_adi} ·{" "}
                <span className={"rozet rol-" + (profil?.rol ?? "uye")}>
                  {ROL_ADI[profil?.rol ?? "uye"]}
                </span>
              </p>
            </div>
            <button className="dugme tehlike" onClick={cikis}>
              <Simge ad="cikis" boyut={16} />
              Çıkış
            </button>
          </div>

          <form
            className="hesap-form"
            onSubmit={(e) => { e.preventDefault(); adiKaydet(); }}
          >
            <label className="alan">
              <span className="etiket">Görünen ad</span>
              <input
                className="girdi"
                value={adSoyad}
                onChange={(e) => setAdSoyad(e.target.value)}
                maxLength={60}
                placeholder="Ad soyad"
                autoComplete="name"
              />
            </label>
            <button
              type="submit"
              className="dugme cizgili buyuk"
              disabled={!degisti && !kaydedildi}
            >
              {kaydedildi ? "Kaydedildi" : "Kaydet"}
            </button>
          </form>
        </section>

        <div className="bolum-basi gir" style={kademe(3)}>
          <span className="etiket">Üyeler</span>
          <span className="etiket rakam">{kisiler.length || ""}</span>
        </div>

        {yukleniyor ? (
          <div className="yigin">
            {[50, 38, 44].map((g, i) => (
              <div key={i} className="iskelet" style={{ width: g + "%" }} />
            ))}
          </div>
        ) : (
          <ul className="kisiler">
            {kisiler.map((k, i) => (
              <li key={k.id} className="kisi gir" style={kademe(Math.min(i + 4, 10))}>
                <span className="monogram" aria-hidden="true">{bashar(k.ad_soyad || k.kullanici_adi)}</span>
                <div className="kisi-bilgi">
                  <b>{k.ad_soyad || "@" + k.kullanici_adi}</b>
                  {k.ad_soyad && <span>@{k.kullanici_adi}</span>}
                </div>

                {/* Rol değiştirme yalnızca başkana ve kendisi dışındakilere */}
                {baskanMi && k.id !== profil?.id ? (
                  <select
                    className="girdi"
                    value={k.rol}
                    disabled={islemde === k.id}
                    onChange={(e) => rolDegistir(k, e.target.value as Rol)}
                    aria-label={`${k.kullanici_adi} rolü`}
                  >
                    <option value="uye">Üye</option>
                    <option value="yonetici">Yönetici</option>
                    <option value="baskan">Başkan</option>
                  </select>
                ) : (
                  k.rol !== "uye" && <span className={"rozet rol-" + k.rol}>{ROL_ADI[k.rol]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** "Mustafa Çelik" → "MÇ", "mustafa" → "M". */
function bashar(ad?: string | null) {
  const parca = (ad ?? "").trim().split(/\s+/).filter(Boolean);
  const harfler = parca.length > 1 ? parca[0][0] + parca[parca.length - 1][0] : (parca[0]?.[0] ?? "?");
  return harfler.toLocaleUpperCase("tr");
}
