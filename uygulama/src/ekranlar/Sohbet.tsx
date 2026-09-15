import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase, ROL_ADI, type Mesaj, type Profil } from "../veri/supabase";
import { useOturum } from "../veri/oturum";
import Simge from "../tasarim/Simge";

const SAYFA = 60;

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Genel sohbet — topluluğun tek ortak odası.
 *
 * Mesajlar iki yoldan gelir: açılışta son N tanesi tek sorguyla, sonrası
 * gerçek zamanlı yayından. Yayın da satır kurallarına uyar; kullanıcı
 * yalnızca görmeye yetkili olduğu satırları alır.
 */
export default function Sohbet() {
  const { profil, yetkiliMi } = useOturum();
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [kisiler, setKisiler] = useState<Record<string, Profil>>({});
  const [taslak, setTaslak] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const listeRef = useRef<HTMLDivElement | null>(null);

  // Kullanıcı yukarı kaydırdıysa yeni mesaj gelince zorla aşağı atma;
  // okuduğu yerden koparmak en can sıkıcı sohbet hatasıdır.
  const dipteMi = useRef(true);

  const kaydir = useCallback((zorla = false) => {
    const el = listeRef.current;
    if (!el || (!zorla && !dipteMi.current)) return;
    el.scrollTo({ top: el.scrollHeight, behavior: zorla ? "auto" : "smooth" });
  }, []);

  // Hata bildirimi kendiliğinden kaybolur; ekranda kalıcı kırmızı yazı yorar.
  useEffect(() => {
    if (!hata) return;
    const z = setTimeout(() => setHata(null), 4000);
    return () => clearTimeout(z);
  }, [hata]);

  useEffect(() => {
    let gecerli = true;

    (async () => {
      const [mesajSonuc, kisiSonuc] = await Promise.all([
        supabase
          .from("mesajlar")
          .select("*")
          .order("olusturuldu", { ascending: false })
          .limit(SAYFA),
        supabase.from("profiller").select("*"),
      ]);

      if (!gecerli) return;
      if (mesajSonuc.error) {
        setHata("Sohbet yüklenemedi.");
      } else {
        setMesajlar((mesajSonuc.data as Mesaj[]).slice().reverse());
      }
      if (kisiSonuc.data) {
        const harita: Record<string, Profil> = {};
        for (const k of kisiSonuc.data as Profil[]) harita[k.id] = k;
        setKisiler(harita);
      }
      setYukleniyor(false);
      requestAnimationFrame(() => kaydir(true));
    })();

    const kanal = supabase
      .channel("genel-sohbet")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mesajlar" },
        (yuk) => {
          const yeni = yuk.new as Mesaj;
          setMesajlar((onceki) =>
            onceki.some((m) => m.id === yeni.id) ? onceki : [...onceki, yeni],
          );
          requestAnimationFrame(() => kaydir());
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "mesajlar" },
        (yuk) => {
          const giden = yuk.old as { id: number };
          setMesajlar((onceki) => onceki.filter((m) => m.id !== giden.id));
        },
      )
      .subscribe();

    return () => {
      gecerli = false;
      supabase.removeChannel(kanal);
    };
  }, [kaydir]);

  async function gonder() {
    const metin = taslak.trim();
    if (!metin || !profil) return;
    setTaslak("");
    dipteMi.current = true;

    const { error } = await supabase.from("mesajlar").insert({
      icerik: metin,
      yazar: profil.id,   // tetikleyici zaten zorluyor; şema uyumu için
    });
    if (error) {
      // P0429: veritabanındaki hız sınırı (bkz. 04_guvenlik.sql).
      setHata(error.code === "P0429" ? "Çok hızlı yazıyorsun. Biraz bekle." : "Mesaj gönderilemedi.");
      setTaslak(metin);   // yazdığını kaybetme
    }
  }

  async function sil(id: number) {
    const { error } = await supabase.from("mesajlar").delete().eq("id", id);
    if (error) setHata("Mesaj silinemedi.");
    else setMesajlar((o) => o.filter((m) => m.id !== id));
  }

  const gruplar = useMemo(() => grupla(mesajlar), [mesajlar]);
  const uyeSayisi = Object.keys(kisiler).length;

  return (
    <div className="oda">
      <header className="oda-basi">
        <div className="sutun">
          <div>
            <span className="etiket gir">Topluluk</span>
            <h1 className="gir" style={kademe(1)}>Genel sohbet</h1>
          </div>
          {uyeSayisi > 0 && (
            <span className="etiket rakam gir" style={kademe(2)}>{uyeSayisi} üye</span>
          )}
        </div>
      </header>

      <div
        className="oda-akis"
        ref={listeRef}
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(e) => {
          const el = e.currentTarget;
          dipteMi.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {yukleniyor && (
          <div className="sutun yigin" aria-label="Yükleniyor">
            {[62, 40, 54].map((g, i) => (
              <div key={i} className="iskelet" style={{ width: g + "%" }} />
            ))}
          </div>
        )}

        {!yukleniyor && mesajlar.length === 0 && (
          <div className="bos gir">
            <Simge ad="sohbet" boyut={28} />
            <b>Oda sessiz.</b>
            <span>İlk mesajı sen yaz.</span>
          </div>
        )}

        {gruplar.map((grup) => {
          const kisi = kisiler[grup.yazar];
          const benimMi = grup.yazar === profil?.id;
          const ilk = grup.mesajlar[0];
          return (
            <section key={grup.anahtar} className={"grup" + (benimMi ? " benim" : "")}>
              <div className="grup-ust">
                {/* Görünen ad serbest metin; biri başkasının adını yazabilir.
                    Benzersiz kullanıcı adı her zaman yanında gösterilir. */}
                {!benimMi && <b>{kisi?.ad_soyad || kisi?.kullanici_adi || "üye"}</b>}
                {!benimMi && kisi?.ad_soyad && <span className="grup-kimlik">@{kisi.kullanici_adi}</span>}
                {!benimMi && kisi && kisi.rol !== "uye" && (
                  <span className={"rozet rol-" + kisi.rol}>{ROL_ADI[kisi.rol]}</span>
                )}
                <time dateTime={ilk.olusturuldu}>{saat(ilk.olusturuldu)}</time>
              </div>
              {grup.mesajlar.map((m) => (
                <div key={m.id} className="satir">
                  <p>{m.icerik}</p>
                  {(benimMi || yetkiliMi) && (
                    <button
                      className="ikon-dugme kucuk"
                      onClick={() => sil(m.id)}
                      aria-label="Mesajı sil"
                      data-ipucu="Sil"
                    >
                      <Simge ad="cop" boyut={16} />
                    </button>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {hata && <p className="bildirim cam" role="alert">{hata}</p>}

      <form
        className="yazici yalin cam gir"
        style={kademe(3)}
        onSubmit={(e) => {
          e.preventDefault();
          gonder();
        }}
      >
        <input
          value={taslak}
          onChange={(e) => setTaslak(e.target.value)}
          placeholder="Odaya yaz"
          maxLength={2000}
          aria-label="Mesaj"
          enterKeyHint="send"
        />
        <button type="submit" className="gonder-dugme" disabled={!taslak.trim()} aria-label="Gönder">
          <Simge ad="gonder" boyut={18} />
        </button>
      </form>
    </div>
  );
}

// ── Yardımcılar ────────────────────────────────────────────────────

/** Aynı kişinin 5 dakika içindeki arka arkaya mesajları tek grupta toplanır. */
function grupla(mesajlar: Mesaj[]) {
  const gruplar: { anahtar: string; yazar: string; mesajlar: Mesaj[] }[] = [];
  for (const m of mesajlar) {
    const son = gruplar[gruplar.length - 1];
    const yakin =
      son &&
      son.yazar === m.yazar &&
      new Date(m.olusturuldu).getTime() -
        new Date(son.mesajlar[son.mesajlar.length - 1].olusturuldu).getTime() <
        5 * 60 * 1000;
    if (yakin) son.mesajlar.push(m);
    else gruplar.push({ anahtar: `${m.yazar}-${m.id}`, yazar: m.yazar, mesajlar: [m] });
  }
  return gruplar;
}

function saat(zaman: string) {
  return new Date(zaman).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
