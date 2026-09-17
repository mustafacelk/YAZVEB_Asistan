import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { supabase, ROL_ADI, type Mesaj, type Profil, type Rol } from "../veri/supabase";
import { useOturum } from "../veri/oturum";
import { useGezinme } from "../veri/gezinme";
import Simge from "../tasarim/Simge";

const SIRA: Record<Rol, number> = { baskan: 0, yonetici: 1, uye: 2 };

// Yalnızca yetkililer açtığında yüklenir.
const Yonetim = lazy(() => import("../yonetim/Yonetim"));

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
  const { profil, baskanMi, yetkiliMi, cikis, profiliTazele } = useOturum();
  const { git } = useGezinme();
  const [sonMesaj, setSonMesaj] = useState<Mesaj | null | undefined>(undefined);
  const [yonetimAcik, setYonetimAcik] = useState(false);
  const [kisiler, setKisiler] = useState<Profil[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [islemde, setIslemde] = useState<string | null>(null);
  const [adSoyad, setAdSoyad] = useState(profil?.ad_soyad ?? "");
  const [kaydedildi, setKaydedildi] = useState(false);

  useEffect(() => {
    getir();
    supabase
      .from("mesajlar")
      .select("*")
      .order("olusturuldu", { ascending: false })
      .limit(1)
      .then(({ data }) => setSonMesaj((data as Mesaj[] | null)?.[0] ?? null));
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
      setHata("Rol değiştirilemedi. Bu işlem yalnızca başkana açık.");
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
      setHata(error.code === "23514"
        ? "Görünen ad desteklenmeyen karakter içeriyor (60 karakter, görünmez karakter yok)."
        : "Kaydedilemedi.");
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
          {yetkiliMi && (
            <button className="dugme cizgili gir" style={kademe(2)} onClick={() => setYonetimAcik(true)}>
              <Simge ad="ayar" boyut={16} /> Ödül yönetimi
            </button>
          )}
        </header>

        {hata && <p className="bildirim" role="alert">{hata}</p>}

        {/* Topluluğun ortak odası: sekme değil, topluluğun içinde. */}
        <button className="ana-satir sohbet-girisi gir" style={kademe(2)} onClick={() => git("sohbet")}>
          <span className="ana-satir-ikon"><Simge ad="sohbet" boyut={20} /></span>
          <span className="ana-satir-govde">
            <b>Genel sohbet</b>
            <span className="soluk tek-satir">
              {sonMesaj === undefined
                ? "\u00a0"
                : sonMesaj
                  ? `${kisiAdi(kisiler, sonMesaj.yazar)}: ${sonMesaj.icerik}`
                  : "Oda sessiz. İlk mesajı sen yaz."}
            </span>
          </span>
          <Simge ad="ileri" boyut={16} />
        </button>

        <section className="hesap gir" style={kademe(3)} aria-labelledby="hesap-baslik">
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

          <VeriOzeti />
        </section>

        <div className="bolum-basi gir" style={kademe(4)}>
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
      {yonetimAcik && (
        <Suspense fallback={null}>
          <Yonetim onKapat={() => setYonetimAcik(false)} />
        </Suspense>
      )}
    </div>
  );
}

function kisiAdi(kisiler: Profil[], id: string) {
  const k = kisiler.find((x) => x.id === id);
  return k ? k.ad_soyad || "@" + k.kullanici_adi : "Üye";
}

/**
 * Verilerin nerede ve ne için — hukuk metni değil, düz cümleler.
 *
 * Buradaki her cümle koda karşı doğrulandı: kamera görüntüsü cihazda
 * çözülür (odul/qr.ts), konum yalnızca karşılaştırılır ve yazılmaz
 * (odul_gorev_tamamla), IP yalnızca kısaltılmış özet olarak ve hız sınırı
 * için tutulur (istek_ip_ozeti, 24 saat / 30 gün), asistan soruları
 * saklanmaz. Kod değişirse bu metin de değişmeli.
 */
function VeriOzeti() {
  return (
    <details className="veri-ozeti">
      <summary>
        <Simge ad="kalkan" boyut={16} />
        <span>Verilerin nasıl kullanılıyor?</span>
      </summary>
      <ul>
        <li><b>Hesap:</b> kullanıcı adı, e-posta ve istersen görünen adın. Başka kişisel bilgi istemiyoruz.</li>
        <li><b>Kamera:</b> QR kodu telefonunda okunur. Görüntü kaydedilmez, hiçbir yere gönderilmez.</li>
        <li><b>Konum:</b> yalnızca konum şartlı bir görevde, o an etkinlik alanında olup olmadığını kontrol etmek için kullanılır. Kaydedilmez.</li>
        <li><b>Puan ve ödüller:</b> kazandığın her puan ve ödül hesabında kayıtlı; Ödüller → Geçmiş'te hepsini görebilirsin.</li>
        <li><b>Sıralama:</b> yalnızca kullanıcı adın görünür. Gizli profili açarak tamamen çıkabilirsin.</li>
        <li><b>Asistan:</b> sorun, yanıt üretmek için yapay zekâ servisine gönderilir; YAZVEB soruları saklamaz. Sesli yanıt açıksa yanıt metni seslendirme servisine gider.</li>
        <li><b>Sohbet:</b> genel sohbetteki mesajlar topluluk üyelerine görünür ve saklanır. Kendi mesajını silebilirsin.</li>
        <li><b>Güvenlik:</b> kötüye kullanımı sınırlamak için IP adresinin geri çevrilemeyen kısa bir özeti en fazla 30 gün tutulur.</li>
      </ul>
      <p className="soluk">Verilerini satmıyoruz, reklam için kullanmıyoruz. Hesabının silinmesini istersen YAZVEB yönetimine yaz.</p>
    </details>
  );
}

/** "Mustafa Çelik" → "MÇ", "mustafa" → "M". */
function bashar(ad?: string | null) {
  const parca = (ad ?? "").trim().split(/\s+/).filter(Boolean);
  const harfler = parca.length > 1 ? parca[0][0] + parca[parca.length - 1][0] : (parca[0]?.[0] ?? "?");
  return harfler.toLocaleUpperCase("tr");
}
