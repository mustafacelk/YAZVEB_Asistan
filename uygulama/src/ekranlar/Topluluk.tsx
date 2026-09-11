import { useEffect, useState } from "react";
import { supabase, ROL_ADI, type Profil, type Rol } from "../veri/supabase";
import { useOturum } from "../veri/oturum";

const SIRA: Record<Rol, number> = { baskan: 0, yonetici: 1, uye: 2 };

/**
 * Topluluk listesi ve rol yönetimi.
 *
 * Rol değiştirme düğmesi yalnızca başkana görünür. Görünmese bile kural
 * veritabanında: rol_degisimi_denetle tetikleyicisi başkan olmayan her
 * güncellemeyi reddeder, üstelik başkanın kendi rolünü düşürmesini de
 * engeller (topluluk başkansız kalmasın).
 */
export default function Topluluk() {
  const { profil, baskanMi, cikis, profiliTazele } = useOturum();
  const [kisiler, setKisiler] = useState<Profil[]>([]);
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

  return (
    <div className="sayfa">
      <header className="sayfa-basi">
        <h2>Topluluk</h2>
        <span className="sessiz ufak-yazi">{kisiler.length} üye</span>
      </header>

      {hata && <p className="uyari" role="alert">{hata}</p>}

      <section className="kutu">
        <h3 className="bolum">Hesabım</h3>
        <p className="kimlik-satiri">
          <b>@{profil?.kullanici_adi}</b>
          <span className={"rozet rol-" + (profil?.rol ?? "uye")}>
            {ROL_ADI[profil?.rol ?? "uye"]}
          </span>
        </p>
        <label>
          <span>Ad soyad</span>
          <input
            value={adSoyad}
            onChange={(e) => setAdSoyad(e.target.value)}
            maxLength={60}
            placeholder="Görünen adın"
          />
        </label>
        <div className="satir-eylem">
          <button onClick={adiKaydet}>{kaydedildi ? "Kaydedildi ✓" : "Kaydet"}</button>
          <button className="tehlike" onClick={cikis}>Çıkış yap</button>
        </div>
      </section>

      <h3 className="bolum">Üyeler</h3>
      <ul className="kisi-listesi">
        {kisiler.map((k) => (
          <li key={k.id} className="kisi">
            <div className="kisi-bilgi">
              <b>@{k.kullanici_adi}</b>
              {k.ad_soyad && <span className="sessiz">{k.ad_soyad}</span>}
            </div>
            <span className={"rozet rol-" + k.rol}>{ROL_ADI[k.rol]}</span>

            {/* Rol değiştirme yalnızca başkana ve kendisi dışındakilere */}
            {baskanMi && k.id !== profil?.id && (
              <select
                value={k.rol}
                disabled={islemde === k.id}
                onChange={(e) => rolDegistir(k, e.target.value as Rol)}
                aria-label={`${k.kullanici_adi} rolü`}
              >
                <option value="uye">Üye</option>
                <option value="yonetici">Yönetici</option>
                <option value="baskan">Başkan</option>
              </select>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
