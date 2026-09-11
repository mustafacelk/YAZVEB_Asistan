import { useState, type FormEvent } from "react";
import { supabase } from "../veri/supabase";

type Kip = "giris" | "kayit";

const KULLANICI_ADI_KALIBI = /^[a-z0-9_]{3,20}$/;

/**
 * Giriş ve kayıt.
 *
 * Girişte hem kullanıcı adı hem e-posta kabul edilir: üyeler kullanıcı adını
 * hatırlıyor, Supabase ise e-posta bekliyor. Araya `giris_epostasi` çağrısı
 * giriyor (bkz. veritabani/01_sema.sql).
 */
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
      const { data, error } = await supabase.rpc("giris_epostasi", {
        p_kullanici_adi: girilen,
      });
      if (error) throw new Error("Giriş servisine ulaşılamadı.");
      if (!data) throw new Error("Bu kullanıcı adı bulunamadı.");
      adres = data as string;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: adres,
      password: parola,
    });
    // Hangi bilginin yanlış olduğunu söylemiyoruz: "parola yanlış" demek,
    // o hesabın var olduğunu doğrulamak demektir.
    if (error) throw new Error("Kullanıcı adı veya parola hatalı.");
  }

  async function kayitOl() {
    const ad = kullaniciAdi.trim().toLowerCase();
    if (!KULLANICI_ADI_KALIBI.test(ad)) {
      throw new Error(
        "Kullanıcı adı 3-20 karakter olmalı; yalnızca küçük harf, rakam ve _",
      );
    }
    if (parola.length < 8) {
      throw new Error("Parola en az 8 karakter olmalı.");
    }

    const { data, error } = await supabase.auth.signUp({
      email: eposta.trim(),
      password: parola,
      options: { data: { kullanici_adi: ad, ad_soyad: adSoyad.trim() || null } },
    });
    if (error) {
      throw new Error(
        error.message.includes("already")
          ? "Bu e-posta ile zaten bir hesap var."
          : "Kayıt tamamlanamadı: " + error.message,
      );
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

  return (
    <div className="giris">
      <div className="giris-kart">
        <div className="marka">
          <img
            className="marka-logo"
            src="/logo-256.webp"
            srcSet="/logo-128.webp 128w, /logo-256.webp 256w, /logo-512.webp 512w"
            sizes="96px"
            alt="YAZVEB"
            width={96}
            height={96}
            decoding="async"
          />
          <h1>YAZVEB</h1>
          <p>Yapay Zeka ve Veri Bilimi Topluluğu</p>
        </div>

        <div className="sekmeler" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={kip === "giris"}
            className={kip === "giris" ? "etkin" : ""}
            onClick={() => { setKip("giris"); setHata(null); }}
          >
            Giriş yap
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kip === "kayit"}
            className={kip === "kayit" ? "etkin" : ""}
            onClick={() => { setKip("kayit"); setHata(null); }}
          >
            Kayıt ol
          </button>
        </div>

        <form onSubmit={gonder} className="alan-yigini">
          {kip === "giris" ? (
            <label>
              <span>Kullanıcı adı veya e-posta</span>
              <input
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
              <label>
                <span>Kullanıcı adı</span>
                <input
                  value={kullaniciAdi}
                  onChange={(e) => setKullaniciAdi(e.target.value)}
                  placeholder="ornek_kullanici"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </label>
              <label>
                <span>Ad soyad <i>(isteğe bağlı)</i></span>
                <input
                  value={adSoyad}
                  onChange={(e) => setAdSoyad(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label>
                <span>E-posta</span>
                <input
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

          <label>
            <span>Parola</span>
            <input
              type="password"
              value={parola}
              onChange={(e) => setParola(e.target.value)}
              autoComplete={kip === "giris" ? "current-password" : "new-password"}
              required
            />
          </label>

          {hata && <p className="uyari" role="alert">{hata}</p>}
          {bilgi && <p className="bilgi">{bilgi}</p>}

          <button type="submit" className="birincil" disabled={bekliyor}>
            {bekliyor ? "…" : kip === "giris" ? "Giriş yap" : "Hesap oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}
