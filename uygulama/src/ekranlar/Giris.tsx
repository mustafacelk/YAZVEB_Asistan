import { useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "../veri/supabase";
import Kure from "../canli/Kure";

type Kip = "giris" | "kayit";

const KULLANICI_ADI_KALIBI = /^[a-z0-9_]{3,20}$/;

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/** Küre yalnızca geniş ekranda çizilir; telefonda giriş hızlı ve sade kalsın. */
const genisEkran = typeof matchMedia !== "undefined" && matchMedia("(min-width: 960px)").matches;

/**
 * Giriş ve kayıt.
 *
 * Girişte hem kullanıcı adı hem e-posta kabul edilir: üyeler kullanıcı adını
 * hatırlıyor, Supabase ise e-posta bekliyor. Araya `giris_epostasi` çağrısı
 * giriyor (bkz. veritabani/04_guvenlik.sql).
 *
 * HESAP VAR MI YOK MU — SÖYLENMEZ
 * ───────────────────────────────
 * "Bu kullanıcı adı bulunamadı", "bu e-posta zaten kayıtlı" gibi cevaplar
 * saldırgana hangi hesapların var olduğunu listeletir. Giriş ve kayıt
 * hataları bu yüzden tek tip.
 */
const GIRIS_HATASI = "Kullanıcı adı veya parola hatalı.";
export default function Giris() {
  const [kip, setKip] = useState<Kip>("giris");
  const [kimlik, setKimlik] = useState("");     // kullanıcı adı veya e-posta
  const [eposta, setEposta] = useState("");
  const [kullaniciAdi, setKullaniciAdi] = useState("");
  const [adSoyad, setAdSoyad] = useState("");
  const [parola, setParola] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function girisYap() {
    const girilen = kimlik.trim().toLowerCase();
    let adres = girilen;

    if (!girilen.includes("@")) {
      // E-posta yalnızca parola da doğruysa döner (bkz. 04_guvenlik.sql).
      let { data, error } = await supabase.rpc("giris_epostasi", {
        p_kullanici_adi: girilen,
        p_parola: parola,
      });
      // GEÇİŞ: veritabanı henüz güncellenmemişse yeni imza bulunamaz
      // (PGRST202). 04_guvenlik.sql çalıştırıldıktan sonra bu dal hiç
      // çalışmaz, çünkü eski imza silinir. Güncelleme tamamlanınca kaldır.
      if (error?.code === "PGRST202") {
        ({ data, error } = await supabase.rpc("giris_epostasi", { p_kullanici_adi: girilen }));
      }
      if (error) throw new Error("Giriş servisine ulaşılamadı. Biraz sonra tekrar dene.");
      if (!data) throw new Error(GIRIS_HATASI);
      adres = data as string;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: adres,
      password: parola,
    });
    // Hangi bilginin yanlış olduğunu söylemiyoruz: "parola yanlış" demek,
    // o hesabın var olduğunu doğrulamak demektir.
    if (error) {
      if (error.status === 429) throw new Error("Çok fazla deneme. Birkaç dakika sonra tekrar dene.");
      throw new Error(GIRIS_HATASI);
    }
  }

  async function kayitOl() {
    const ad = kullaniciAdi.trim().toLowerCase();
    if (!KULLANICI_ADI_KALIBI.test(ad)) {
      throw new Error(
        "Kullanıcı adı 3-20 karakter olmalı; yalnızca küçük harf, rakam ve _",
      );
    }
    if (parola.length < 8 || parola.length > 72) {
      // 72: bcrypt yalnızca ilk 72 baytı kullanır; uzunu yanıltıcı güven verir.
      throw new Error("Parola 8 ile 72 karakter arasında olmalı.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(eposta.trim()) || eposta.length > 254) {
      throw new Error("Geçerli bir e-posta adresi yaz.");
    }

    const { data, error } = await supabase.auth.signUp({
      email: eposta.trim(),
      password: parola,
      options: { data: { kullanici_adi: ad, ad_soyad: adSoyad.trim() || null } },
    });
    if (error) {
      if (error.status === 429) throw new Error("Çok fazla deneme. Birkaç dakika sonra tekrar dene.");
      if (/password/i.test(error.message)) throw new Error("Parola yeterince güçlü değil. Daha uzun bir parola seç.");
      // Supabase'in ham mesajı ("User already registered" gibi) gösterilmez.
      throw new Error("Kayıt tamamlanamadı. Bilgileri kontrol edip tekrar dene.");
    }
    // E-posta doğrulaması açıksa oturum gelmez; kullanıcıyı boş ekranda bırakma.
    if (!data.session) {
      setBilgi("Hesap oluşturuldu. E-postana gelen bağlantıyı onayla, sonra giriş yap.");
      setKip("giris");
      setKimlik(ad);
    }
  }

  async function gonder(olay: FormEvent) {
    olay.preventDefault();
    setHata(null);
    setBilgi(null);
    setBekliyor(true);
    try {
      if (kip === "giris") await girisYap();
      else await kayitOl();
    } catch (h) {
      setHata(h instanceof Error ? h.message : "Beklenmeyen bir hata oldu.");
    } finally {
      setBekliyor(false);
    }
  }

  function kipSec(k: Kip) {
    setKip(k);
    setHata(null);
  }

  return (
    <div className="giris">
      {genisEkran && (
        <figure className="giris-sahne" aria-hidden="true">
          <div className="kure-cerceve">
            <Kure durum="bosta" />
          </div>
          <figcaption className="etiket">Yapay Zeka ve Veri Bilimi Topluluğu</figcaption>
        </figure>
      )}

      <div className="giris-kolon">
        <div className="giris-marka">
          <img
            className="gir"
            src="/logo-256.webp"
            srcSet="/logo-128.webp 128w, /logo-256.webp 256w, /logo-512.webp 512w"
            sizes="64px"
            alt="YAZVEB logosu"
            width={64}
            height={64}
            decoding="async"
          />
          <div>
            <h1 className="gir" style={kademe(1)}>
              {kip === "giris" ? "Tekrar hoş geldin." : "Topluluğa katıl."}
            </h1>
            <p className="gir" style={kademe(2)}>Selçuk Üniversitesi · YAZVEB</p>
          </div>
        </div>

        <div
          className="secici gir"
          role="tablist"
          aria-label="Giriş veya kayıt"
          style={{ ...kademe(3), "--secim": kip === "giris" ? 0 : 1 } as CSSProperties}
        >
          <span className="secici-gosterge" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={kip === "giris"} onClick={() => kipSec("giris")}>
            Giriş yap
          </button>
          <button type="button" role="tab" aria-selected={kip === "kayit"} onClick={() => kipSec("kayit")}>
            Kayıt ol
          </button>
        </div>

        <form onSubmit={gonder} className="yigin gir" style={kademe(4)}>
          {kip === "giris" ? (
            <label className="alan">
              <span className="etiket">Kullanıcı adı veya e-posta</span>
              <input
                className="girdi"
                value={kimlik}
                onChange={(e) => setKimlik(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </label>
          ) : (
            <>
              <label className="alan">
                <span className="etiket">Kullanıcı adı</span>
                <input
                  className="girdi"
                  value={kullaniciAdi}
                  onChange={(e) => setKullaniciAdi(e.target.value)}
                  placeholder="ornek_kullanici"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </label>
              <label className="alan">
                <span className="etiket">Ad soyad <i>(isteğe bağlı)</i></span>
                <input
                  className="girdi"
                  value={adSoyad}
                  onChange={(e) => setAdSoyad(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label className="alan">
                <span className="etiket">E-posta</span>
                <input
                  className="girdi"
                  type="email"
                  value={eposta}
                  onChange={(e) => setEposta(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  required
                />
              </label>
            </>
          )}

          <label className="alan">
            <span className="etiket">Parola</span>
            <input
              className="girdi"
              type="password"
              value={parola}
              onChange={(e) => setParola(e.target.value)}
              autoComplete={kip === "giris" ? "current-password" : "new-password"}
              maxLength={72}
              required
            />
          </label>

          {hata && <p className="bildirim" role="alert">{hata}</p>}
          {bilgi && <p className="bildirim bilgi" role="status">{bilgi}</p>}

          <button type="submit" className="dugme birincil genis" disabled={bekliyor}>
            {bekliyor ? "Bekleniyor" : kip === "giris" ? "Giriş yap" : "Hesap oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}
