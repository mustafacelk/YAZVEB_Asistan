import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "../veri/supabase";
import { useOturum } from "../veri/oturum";
import { hizliCevap } from "../veri/hizli";
import { HATA_CEVABI } from "../veri/sohbet_kaliplari";
import { apiAdresi } from "../veri/api";
import { selamAdi } from "../veri/bicim";
import { useGezinme, type Gezinme } from "../veri/gezinme";
import Kure from "../canli/Kure";
import type { Durum } from "../canli/sahne";
import { sesiUyandir } from "../canli/olcer";
import { Konusma } from "../canli/konusma";
import { sesliSoruDesteklenir, useDinleyici } from "../canli/dinleyici";
import Simge from "../tasarim/Simge";

type Tur = {
  rol: "user" | "assistant";
  icerik: string;
  zaman: number;
  hata?: boolean;
  /** Cevabın götürdüğü uygulama bölümü (sunucu ve burada izin listesiyle süzülür). */
  git?: string;
  /**
   * Sesli yanıtta metnin görünen kısmı (karakter). 0: ses henüz gelmedi,
   * tur gizli. Tanımsız: tamamı görünür. Bkz. canli/konusma.ts.
   */
  gorunen?: number;
};

/**
 * Asistanın uygulama içinde gösterebileceği yönlendirmeler.
 *
 * Değer sunucudan gelir ama bu liste dışındaki hiçbir şey düğmeye dönüşmez.
 * Düğme yalnızca uygulamanın kendi bölümlerini açar; dış adres, betik yok.
 * Kullanıcı dokunmadıkça hiçbir yere gidilmez.
 */
const YONLENDIRMELER: Record<string, { etiket: string; ac: (g: Gezinme) => void }> = {
  etkinlik: { etiket: "Etkinlikler'i aç", ac: (g) => g.git("etkinlik") },
  tara: { etiket: "QR okut", ac: (g) => g.tara() },
  akademi: { etiket: "Dersleri aç", ac: (g) => g.git("akademi") },
  odul: { etiket: "İlerlemeni aç", ac: (g) => g.git("odul", { odul: "gecmis" }) },
  oduller: { etiket: "Ödüllerini aç", ac: (g) => g.git("odul", { odul: "cuzdan" }) },
  sponsorlar: { etiket: "Sponsorları aç", ac: (g) => g.git("odul") },
  siralama: { etiket: "Sıralamayı aç", ac: (g) => g.git("odul", { odul: "siralama" }) },
  ben: { etiket: "Hesabını aç", ac: (g) => g.git("ben") },
  topluluk: { etiket: "Topluluğu aç", ac: (g) => g.git("topluluk") },
  sohbet: { etiket: "Genel sohbeti aç", ac: (g) => g.git("sohbet") },
};
const yonlendirmeMi = (h: unknown): h is string =>
  typeof h === "string" && Object.prototype.hasOwnProperty.call(YONLENDIRMELER, h);

/** Hata durumunda kürenin içe çekilip toparlanma süresi. */
const HATA_ANI_MS = 1100;

const ONERILER = [
  "Bu uygulama ne işe yarar?",
  "Topluluğa nasıl katılırım?",
  "YAZVEB neler yapıyor?",
  "Yaklaşan etkinlikler neler?",
];

const DURUM_ADI: Record<Durum, string> = {
  bosta: "Hazır",
  dinliyor: "Dinliyorum",
  dusunuyor: "Düşünüyor",
  konusuyor: "Konuşuyor",
  hata: "Yanıt alınamadı",
};

/**
 * Asistan ekranı.
 *
 * İKİ HIZ
 * ───────
 * Selam, teşekkür gibi cümleler cihazda anında cevaplanır — ağa hiç çıkılmaz.
 * Gerçek sorular sunucudaki kenar fonksiyonuna gider; model anahtarı orada
 * durur ve telefona hiç inmez.
 *
 * SES
 * ───
 * Seslendirme sitenin kendi sunucusundan gelir (neural Türkçe ses). Sesli
 * yanıtta metin sesle BİRLİKTE, okunduğu yere kadar belirir (canli/konusma.ts).
 * Mikrofonla sorulan soru, ses düğmesi kapalı olsa bile sesli yanıtlanır:
 * konuşarak soran kişi ekrana bakmıyor olabilir. Konuşma tarayıcıda tanınır;
 * tanıma metin vermezse kayıt sunucuda yazıya dökülür (canli/dinleyici.ts).
 *
 * KÜRE
 * ────
 * Ekranın durumu (dinliyor / düşünüyor / konuşuyor) kürenin hareketiyle
 * gösterilir. Genlik gerçek sesten ölçülür (bkz. canli/olcer.ts).
 */
export default function Asistan({ onGeri, ilkSoru }: { onGeri?: () => void; ilkSoru?: string }) {
  const { profil } = useOturum();
  const gezinme = useGezinme();
  const [turlar, setTurlar] = useState<Tur[]>([]);
  const [taslak, setTaslak] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  /** Cevap hazır, sesi yolda: metin sesle birlikte görünecek. */
  const [sesBekliyor, setSesBekliyor] = useState(false);
  const [konusulan, setKonusulan] = useState<number | null>(null);
  const [hataAni, setHataAni] = useState(false);
  const [sesliCevap, setSesliCevap] = useState(false);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const [tekrar, setTekrar] = useState<string | null>(null);

  const akisRef = useRef<HTMLDivElement | null>(null);
  const girdiRef = useRef<HTMLInputElement | null>(null);
  const hataRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const konusmaRef = useRef<Konusma | null>(null);
  const istekRef = useRef(0);             // yeni konuşmada eski yanıt geri gelmesin

  const hataGoster = useCallback(() => {
    setHataAni(true);
    if (hataRef.current) clearTimeout(hataRef.current);
    hataRef.current = setTimeout(() => setHataAni(false), HATA_ANI_MS);
  }, []);

  // Tanımanın olayları dinleme başladığı andaki `sor`u yakalar; her zaman
  // en güncelini çağırsın diye bir referanstan okunur.
  const sorRef = useRef<(metin: string, sesle?: boolean) => void>(() => {});

  const dinleyici = useDinleyici({
    onMetin: (m) => sorRef.current(m, true),
    onTaslak: setTaslak,
    onBildirim: setBildirim,
    onHata: hataGoster,
    yaziyaDok: async (veri) => {
      const { data, error } = await supabase.functions.invoke("asistan", {
        body: { ses: { veri, tur: "audio/wav" } },
      });
      if (error) throw error;
      return typeof data?.metin === "string" ? data.metin : null;
    },
  });

  const kip = turlar.length ? "sohbet" : "ev";
  const durum: Durum = hataAni
    ? "hata"
    : dinleyici.dinliyor
      ? "dinliyor"
      : bekliyor || sesBekliyor || dinleyici.isleniyor
        ? "dusunuyor"
        : konusulan !== null
          ? "konusuyor"
          : "bosta";

  // Yeni tur gelince (ya da gizli tur sesle birlikte göründüğünde) akışı dibe indir.
  const gorunenTur = turlar.filter((t) => t.gorunen !== 0).length;
  useEffect(() => {
    const el = akisRef.current;
    if (!el || !gorunenTur) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
  }, [gorunenTur]);

  const sesiKes = useCallback(() => {
    konusmaRef.current?.durdur();
    konusmaRef.current = null;
    setKonusulan(null);
    setSesBekliyor(false);
  }, []);

  // Bildirim kendiliğinden kaybolur; kalıcı uyarı metni yorar.
  useEffect(() => {
    if (!bildirim) return;
    const z = setTimeout(() => setBildirim(null), 4000);
    return () => clearTimeout(z);
  }, [bildirim]);

  // Ekrandan çıkarken her şeyi bırak: ses, zamanlayıcılar (mikrofonu dinleyici kendisi bırakır).
  useEffect(() => () => {
    konusmaRef.current?.durdur();
    if (hataRef.current) clearTimeout(hataRef.current);
  }, []);

  /**
   * Metni sunucuda seslendirir. Seslendirme Supabase'de DEĞİL, sitenin kendi
   * sunucusunda: protokol WebSocket istiyor ve Supabase'in kenar ortamı ham
   * soket açtırmıyor. Başarısızsa null — asistanın susması, hata mesajı
   * göstermesinden iyidir.
   */
  const sentezle = useCallback(async (metin: string): Promise<Blob | null> => {
    const { data: oturum } = await supabase.auth.getSession();
    const jeton = oturum.session?.access_token;
    if (!jeton) return null;
    const yanit = await fetch(apiAdresi("/api/seslendir"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ metin }),
    });
    if (!yanit.ok) return null;
    const blob = await yanit.blob();
    return blob.size < 500 ? null : blob;   // hata gövdesi, ses değil
  }, []);

  /** `sira`daki turu sesle birlikte, okundukça gösterir. */
  const konus = useCallback((metin: string, sira: number) => {
    sesiKes();
    const istek = istekRef.current;
    const gorunen = (n: number | undefined) =>
      setTurlar((t) => t.map((x, i) => (i === sira ? { ...x, gorunen: n } : x)));
    setSesBekliyor(true);
    const k = new Konusma(metin, sentezle, {
      gorunen: (n) => { if (istek === istekRef.current) gorunen(n >= metin.length ? undefined : n); },
      basladi: (sesli) => {
        if (istek !== istekRef.current) return;
        setSesBekliyor(false);
        if (sesli) setKonusulan(sira);
      },
      bitti: () => {
        if (konusmaRef.current === k) konusmaRef.current = null;
        setSesBekliyor(false);
        setKonusulan((c) => (c === sira ? null : c));
        if (istek === istekRef.current) gorunen(undefined);
      },
    });
    konusmaRef.current = k;
    k.baslat();
  }, [sesiKes, sentezle]);

  // Ana ekrandaki kutuya yazılan soru: ekran açılır açılmaz bir kez sorulur.
  // Zamanlayıcı, StrictMode'un çift efekt çalıştırmasında ikinci kez sormasın diye.
  const ilkSoruRef = useRef(ilkSoru);

  const sor = useCallback(async (metin: string, sesle = false) => {
    const soru = metin.trim();
    if (!soru || bekliyor) return;

    setTaslak("");
    const oncekiler = turlar;
    const sesliYanit = sesliCevap || sesle;
    const istek = ++istekRef.current;
    const sira = oncekiler.length + 1;
    sesiKes();
    setTurlar((t) => [...t, { rol: "user", icerik: soru, zaman: Date.now() }]);

    /** Cevabı ekler; sesliyse gizli başlar ve sesle birlikte görünür. */
    const cevapla = (tur: Omit<Tur, "rol" | "zaman">) => {
      setTurlar((t) => [...t, { rol: "assistant", zaman: Date.now(), ...tur, gorunen: sesliYanit ? 0 : undefined }]);
      if (sesliYanit) konus(tur.icerik, sira);
    };

    // Hızlı yol: ağa çıkmadan, anında.
    const hazir = hizliCevap(soru);
    if (hazir) { cevapla({ icerik: hazir }); return; }

    // Model düşünürken seslendirme sunucusu uyansın: ilk ses daha çabuk gelir.
    if (sesliYanit) fetch(apiAdresi("/api/seslendir"), { method: "OPTIONS" }).catch(() => {});

    setBekliyor(true);
    try {
      const { data, error } = await supabase.functions.invoke("asistan", {
        body: {
          soru,
          gecmis: oncekiler
            .filter((t) => !t.hata)
            .slice(-6)
            .map(({ rol, icerik }) => ({ rol, icerik })),
        },
      });
      if (istek !== istekRef.current) return;     // bu arada yeni konuşma başladı
      const basarili = !error && typeof data?.cevap === "string" && !data?.hata;
      const durumKodu = (error as { context?: { status?: number } } | null)?.context?.status;
      const cevap = basarili
        ? duzenle(String(data.cevap))
        : durumKodu === 429
          ? "Çok hızlı soruyorsun. Bir dakika sonra tekrar dene."
          : durumKodu === 401
            ? "Oturumun sona ermiş görünüyor. Çıkış yapıp tekrar giriş yap."
            : HATA_CEVABI;
      const git = basarili && yonlendirmeMi(data?.yonlendirme) ? data.yonlendirme : undefined;
      if (!basarili) hataGoster();
      setBekliyor(false);
      cevapla({ icerik: cevap, hata: !basarili, git });
    } catch {
      if (istek !== istekRef.current) return;
      setBekliyor(false);
      hataGoster();
      cevapla({ icerik: HATA_CEVABI, hata: true });
    } finally {
      if (istek === istekRef.current) setBekliyor(false);
    }
  }, [bekliyor, turlar, sesliCevap, sesiKes, konus, hataGoster]);
  sorRef.current = sor;

  useEffect(() => {
    const soru = ilkSoruRef.current;
    if (!soru) return;
    const z = setTimeout(() => { ilkSoruRef.current = undefined; sor(soru); }, 0);
    return () => clearTimeout(z);
  }, [sor]);

  // "Tekrar sor": başarısız tur çifti kaldırıldıktan SONRA (yeni geçmişle) sorulur.
  useEffect(() => {
    if (tekrar === null) return;
    setTekrar(null);
    sor(tekrar);
  }, [tekrar, sor]);

  function tekrarSor(i: number) {
    const soru = turlar[i - 1];
    if (!soru || soru.rol !== "user" || bekliyor) return;
    sesiUyandir();
    setTurlar((t) => t.slice(0, i - 1));
    setTekrar(soru.icerik);
  }

  function dinle() {
    sesiUyandir();
    if (dinleyici.dinliyor) { dinleyici.durdur(); return; }
    sesiKes();   // asistan konuşurken söz kesilebilir
    dinleyici.baslat();
  }

  function yeniKonusma() {
    istekRef.current++;
    dinleyici.iptal();
    sesiKes();
    setBekliyor(false);
    setTurlar([]);
    setTaslak("");
  }

  const ad = selamAdi(profil?.ad_soyad, profil?.kullanici_adi);

  return (
    <div className="asistan" data-kip={kip}>
      <header className="asistan-ust">
        <div className="ust-sol-grup">
        {onGeri && (
          <button className="ikon-dugme gir" onClick={onGeri} aria-label="Ana ekrana dön" data-ipucu="Ana ekran" data-ipucu-yon="alt">
            <Simge ad="geri" />
          </button>
        )}
        <div className="ust-sol">
          <div className="marka-isareti gir" aria-hidden={kip === "sohbet"}>
            <img src="/logo-128.webp" alt="" width={32} height={32} />
            <span className="etiket">Asistan</span>
          </div>
          <button
            className="dugme yeni-konusma"
            onClick={yeniKonusma}
            tabIndex={kip === "ev" ? -1 : 0}
            aria-hidden={kip === "ev"}
            aria-label="Yeni konuşma"
          >
            <Simge ad="yeni" boyut={18} />
            <span className="dar-gizle">Yeni konuşma</span>
          </button>
        </div>
        </div>

        <div className="ust-orta">
          <span className="durum etiket" data-durum={durum}>{DURUM_ADI[durum]}</span>
        </div>

        <button
          className="ikon-dugme gir"
          onClick={() => {
            sesiUyandir();
            if (sesliCevap) sesiKes();
            setSesliCevap(!sesliCevap);
          }}
          aria-pressed={sesliCevap}
          aria-label="Sesli yanıt"
          data-ipucu={sesliCevap ? "Sesli yanıt açık" : "Sesli yanıt kapalı"}
          data-ipucu-yon="alt"
        >
          <Simge ad={sesliCevap ? "sesAcik" : "sesKapali"} />
        </button>
      </header>

      <div className="kure-sahne">
        <Kure durum={durum} olcek={kip === "sohbet" ? kucukOlcek() : 1} />
      </div>

      <section className="ev" aria-hidden={kip === "sohbet"}>
        <span className="durum etiket gir" data-durum={durum} style={kademe(1)}>
          {DURUM_ADI[durum]}
        </span>
        <h1 className="gir" style={kademe(2)}>
          {ad ? `Merhaba, ${ad}.` : "Merhaba."}
        </h1>
        <p className="gir" style={kademe(3)}>
          Topluluk hakkında ne merak ediyorsan sor — yazarak ya da konuşarak.
        </p>
        <div className="oneriler gir" style={kademe(4)}>
          {ONERILER.map((o) => (
            <button
              key={o}
              className="oneri"
              onClick={() => { sesiUyandir(); sor(o); }}
              tabIndex={kip === "sohbet" ? -1 : 0}
            >
              {o}
            </button>
          ))}
        </div>
      </section>

      <div className="akis" ref={akisRef} aria-live="polite" aria-relevant="additions">
        {turlar.map((t, i) => t.gorunen === 0 ? null : (
          <article
            key={t.zaman + "-" + i}
            className={"tur " + (t.rol === "user" ? "sen" : "yz") + (t.hata ? " hatali" : "")}
          >
            <div className="tur-ust etiket">
              {t.rol === "user" ? "Sen" : "YAZVEB"}
              {konusulan === i && <span className="canli-isaret" aria-label="konuşuyor" />}
              <time dateTime={new Date(t.zaman).toISOString()}>{saat(t.zaman)}</time>
            </div>
            {t.gorunen === undefined ? <p>{t.icerik}</p> : (
              // Okunan kısım görünür; kalanı yer tutar ki balon zıplamasın. Ekran
              // okuyucu metnin tamamını bir kez okur.
              <p aria-label={t.icerik}>
                <span aria-hidden="true">{t.icerik.slice(0, t.gorunen)}</span>
                <span className="okunacak" aria-hidden="true">{t.icerik.slice(t.gorunen)}</span>
              </p>
            )}
            {t.hata && t.rol === "assistant" && turlar[i - 1]?.rol === "user" && (
              <button className="yz-yonlendirme" onClick={() => tekrarSor(i)} disabled={bekliyor}>
                <Simge ad="yeni" boyut={14} /> Tekrar sor
              </button>
            )}
            {t.git && yonlendirmeMi(t.git) && t.gorunen === undefined && (
              <button className="yz-yonlendirme" onClick={() => YONLENDIRMELER[t.git!].ac(gezinme)}>
                {YONLENDIRMELER[t.git].etiket} <Simge ad="ileri" boyut={14} />
              </button>
            )}
          </article>
        ))}
      </div>

      {bildirim && (
        <p className="bildirim bilgi asistan-bildirim cam" role="status">{bildirim}</p>
      )}

      <form
        className="yazici cam gir"
        style={kademe(5)}
        onSubmit={(e) => {
          e.preventDefault();
          sesiUyandir();
          if (dinleyici.dinliyor) dinleyici.iptal();
          sor(taslak);
        }}
      >
        {sesliSoruDesteklenir ? (
          <button
            type="button"
            className="mik-dugme"
            onClick={dinle}
            disabled={dinleyici.isleniyor}
            aria-pressed={dinleyici.dinliyor}
            aria-label={dinleyici.dinliyor ? "Dinlemeyi bitir" : "Konuşarak sor"}
            data-ipucu={dinleyici.dinliyor ? "Bitir ve gönder" : "Konuşarak sor"}
          >
            <Simge ad={dinleyici.dinliyor ? "durdur" : "mikrofon"} />
          </button>
        ) : (
          <span />
        )}
        <input
          ref={girdiRef}
          value={taslak}
          onChange={(e) => setTaslak(e.target.value)}
          placeholder={dinleyici.dinliyor ? "Dinliyorum…" : dinleyici.isleniyor ? "Sesin yazıya dökülüyor…" : "Bir şey sor"}
          maxLength={1000}
          aria-label="Soru"
          enterKeyHint="send"
        />
        <button
          type="submit"
          className="gonder-dugme"
          disabled={!taslak.trim() || bekliyor}
          aria-label="Gönder"
        >
          <Simge ad="gonder" boyut={18} />
        </button>
      </form>
    </div>
  );
}

// ── Yardımcılar ────────────────────────────────────────────────────

/** Sohbet kipinde kürenin görünen oranı; ekranlar.css → --kure-kucuk ile aynı. */
function kucukOlcek() {
  return typeof matchMedia !== "undefined" && matchMedia("(min-width: 900px)").matches ? 0.26 : 0.34;
}

/** Sıralı giriş için öğenin sırası (temel.css → .gir). */
const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Model yanıtının kenar boşluklarını temizler. Sondaki boş satırlar
 * `pre-wrap` altında görünmez ama yer kaplıyor, akışı yukarı itiyordu.
 */
function duzenle(metin: string) {
  return metin
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function saat(zaman: number) {
  return new Date(zaman).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
