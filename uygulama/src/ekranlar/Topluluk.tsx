import { useEffect, useState, type CSSProperties } from "react";
import { supabase, ROL_ADI, type Mesaj, type Profil, type Rol } from "../veri/supabase";
import { useGorunum, useOturum } from "../veri/oturum";
import { useGezinme } from "../veri/gezinme";
import { bashar } from "../veri/bicim";
import { AltBasi, Bolum, DunyaBasi, Satir, Satirlar } from "../tasarim/Dunya";

const SIRA: Record<Rol, number> = { baskan: 0, yonetici: 1, uye: 2 };

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Topluluk — insanlar: genel sohbet ve üyeler. (İleride duyurular, ilanlar,
 * ev devri, 2. el bu dünyaya gelir.) Hesap ve yönetim Ben'de.
 *
 * Üye çubuğunda sekme değil (yerini Ödüller aldı): Ana'dan açılır, bu yüzden
 * başlığında Ana'ya dönüş var. Yönetim çubuğunda ise sekme olarak durur.
 *
 * Rol değiştirme seçicisi yalnızca başkana görünür. Görünmese bile kural
 * veritabanında: rol_degisimi_denetle tetikleyicisi başkan olmayan her
 * güncellemeyi reddeder, üstelik başkanın kendi rolünü düşürmesini de
 * engeller (topluluk başkansız kalmasın).
 */
export default function Topluluk() {
  const { profil, baskanMi } = useOturum();
  const { gorunum } = useGorunum();
  const { git, geri } = useGezinme();
  const [sonMesaj, setSonMesaj] = useState<Mesaj | null | undefined>(undefined);
  const [kisiler, setKisiler] = useState<Profil[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [islemde, setIslemde] = useState<string | null>(null);

  useEffect(() => {
    getir();
    supabase
      .from("mesajlar")
      .select("*")
      .order("olusturuldu", { ascending: false })
      .limit(1)
      .then(({ data }) => setSonMesaj((data as Mesaj[] | null)?.[0] ?? null));
  }, []);

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
      setHata("Rol değiştirilemedi. Bu işlem yalnızca başkana açık.");
      return;
    }
    getir();
  }

  return (
    <div className="sayfa topluluk">
      <div className="sutun">
        {gorunum === "yonetim"
          ? <DunyaBasi etiket="YAZVEB" baslik="Topluluk" aciklama="Genel sohbet ve topluluğun üyeleri." />
          : <AltBasi ust="Ana" baslik="Topluluk" aciklama="Genel sohbet ve topluluğun üyeleri." onGeri={geri} />}

        {hata && <p className="bildirim" role="alert">{hata}</p>}

        <Satirlar className="gir">
          <Satir
            simge="sohbet"
            baslik="Genel sohbet"
            aciklama={<span className="tek-satir">{sonMesaj === undefined
              ? "\u00a0"
              : sonMesaj
                ? `${kisiAdi(kisiler, sonMesaj.yazar)}: ${sonMesaj.icerik}`
                : "Oda sessiz. İlk mesajı sen yaz."}</span>}
            onClick={() => git("sohbet")}
          />
        </Satirlar>

        <Bolum etiket="Üyeler" sag={<span className="etiket rakam">{kisiler.length || ""}</span>} sira={4}>
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
                    <b>{k.ad_soyad || "@" + k.kullanici_adi}{k.id === profil?.id ? " · sen" : ""}</b>
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
        </Bolum>
      </div>
    </div>
  );
}

function kisiAdi(kisiler: Profil[], id: string) {
  const k = kisiler.find((x) => x.id === id);
  return k ? k.ad_soyad || "@" + k.kullanici_adi : "Üye";
}
