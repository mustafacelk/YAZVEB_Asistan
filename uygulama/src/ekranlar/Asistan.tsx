import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "../veri/supabase";
import { useOturum } from "../veri/oturum";
import { hizliCevap } from "../veri/hizli";
import { HATA_CEVABI } from "../veri/sohbet_kaliplari";
import { apiAdresi } from "../veri/api";
import { birlestir, oturumMetni } from "../veri/transkript";
import { selamAdi } from "../veri/bicim";
import Kure from "../canli/Kure";
import type { Durum } from "../canli/sahne";
import {
  darbeVer,
  kaynagiBirak,
  mikrofonOlculebilir,
  mikrofonuOlc,
  sesiUyandir,
  yanitiOlc,
} from "../canli/olcer";
import Simge from "../tasarim/Simge";

type Tur = {
  rol: "user" | "assistant";
  icerik: string;
  zaman: number;
  hata?: boolean;
};

// Son kesin sonuçtan sonra beklenen sessizlik. Kısa olursa cümle ortasındaki
// nefeste gönderir, uzun olursa kullanıcı bekler.
const SESSIZLIK_MS = 900;

/** Hata durumunda kürenin içe çekilip toparlanma süresi. */
const HATA_ANI_MS = 1100;

const ONERILER = [
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
 * Seslendirme sitenin kendi sunucusundan gelir (neural Türkçe ses). Konuşma
 * tanıma tarayıcıda kalır. Mikrofonla sorulan soru, ses düğmesi kapalı olsa
 * bile sesli yanıtlanır: konuşarak soran kişi ekrana bakmıyor olabilir.
 *
 * KÜRE
 * ────
 * Ekranın durumu (dinliyor / düşünüyor / konuşuyor) kürenin hareketiyle
 * gösterilir. Genlik gerçek sesten ölçülür (bkz. canli/olcer.ts).
 */
export default function Asistan({ onGeri }: { onGeri?: () => void }) {
  const { profil } = useOturum();
  const [turlar, setTurlar] = useState<Tur[]>([]);
  const [taslak, setTaslak] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [dinliyor, setDinliyor] = useState(false);
  const [konusulan, setKonusulan] = useState<number | null>(null);
  const [hataAni, setHataAni] = useState(false);
  const [sesliCevap, setSesliCevap] = useState(false);
  const [bildirim, setBildirim] = useState<string | null>(null);

  const akisRef = useRef<HTMLDivElement | null>(null);
  const girdiRef = useRef<HTMLInputElement | null>(null);
  const taniyiciRef = useRef<Taniyici | null>(null);
  const sessizlikRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hataRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kesinRef = useRef("");            // bu dinlemede birikmiş kesin metin
  const oncekiRef = useRef("");           // yeniden başlatmadan önceki oturumların metni
  const kapaniyorRef = useRef(false);     // kullanıcı mı durdurdu, tarayıcı mı
  const calanRef = useRef<HTMLAudioElement | null>(null);
  const istekRef = useRef(0);             // yeni konuşmada eski yanıt geri gelmesin

  const mikVar =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const kip = turlar.length ? "sohbet" : "ev";
  const durum: Durum = hataAni
    ? "hata"
    : dinliyor
      ? "dinliyor"
      : bekliyor
        ? "dusunuyor"
        : konusulan !== null
          ? "konusuyor"
          : "bosta";

  // Yeni tur gelince akışı yumuşakça dibe indir.
  useEffect(() => {
    const el = akisRef.current;
    if (!el || !turlar.length) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
  }, [turlar.length]);

  const sesiKes = useCallback(() => {
    const a = calanRef.current;
    if (a) {
      a.pause();
      if (a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
      calanRef.current = null;
    }
    kaynagiBirak();
    setKonusulan(null);
  }, []);

  const hataGoster = useCallback(() => {
    setHataAni(true);
    if (hataRef.current) clearTimeout(hataRef.current);
    hataRef.current = setTimeout(() => setHataAni(false), HATA_ANI_MS);
  }, []);

  // Bildirim kendiliğinden kaybolur; kalıcı uyarı metni yorar.
  useEffect(() => {
    if (!bildirim) return;
    const z = setTimeout(() => setBildirim(null), 4000);
    return () => clearTimeout(z);
  }, [bildirim]);

  // Ekrandan çıkarken her şeyi bırak: ses, mikrofon, zamanlayıcılar.
  useEffect(() => () => {
    sesiKes();
    if (sessizlikRef.current) clearTimeout(sessizlikRef.current);
    if (hataRef.current) clearTimeout(hataRef.current);
    kapaniyorRef.current = true;
    try { taniyiciRef.current?.abort(); } catch { /* önemsiz */ }
  }, [sesiKes]);

  /**
   * Cevabı sunucuda seslendirip çalar.
   *
   * Metin ekranda zaten görünüyor; ses gecikse de okumayı engellemez.
   * Seslendirme başarısız olursa sessizce geçilir — asistanın susması,
   * hata mesajı göstermesinden iyidir.
   */
  const seslendir = useCallback(async (metin: string, sira: number) => {
    sesiKes();
    const istek = istekRef.current;
    try {
      // Seslendirme Supabase'de DEĞİL, sitenin kendi sunucusunda çalışıyor:
      // protokol WebSocket istiyor ve Supabase'in kenar ortamı ham soket
      // açtırmıyor (fonksiyon orada bir saniyede 502 veriyordu).
      const { data: oturum } = await supabase.auth.getSession();
      const jeton = oturum.session?.access_token;
      if (!jeton) return;

      const yanit = await fetch(apiAdresi("/api/seslendir"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jeton}`,
        },
        body: JSON.stringify({ metin }),
      });
      if (!yanit.ok || istek !== istekRef.current) return;

      const blob = await yanit.blob();
      if (blob.size < 500 || istek !== istekRef.current) return;   // hata gövdesi, ses değil
      const ses = new Audio(URL.createObjectURL(blob));
      calanRef.current = ses;
      ses.onended = () => sesiKes();
      ses.onerror = () => sesiKes();
      yanitiOlc(ses);
      setKonusulan(sira);
      await ses.play().catch(() => sesiKes());
    } catch {
      /* ses yoksa sessiz kal */
    }
  }, [sesiKes]);

  const sor = useCallback(async (metin: string, sesle = false) => {
    const soru = metin.trim();
    if (!soru || bekliyor) return;

    setTaslak("");
    const oncekiler = turlar;
    const sesliYanit = sesliCevap || sesle;
    const istek = ++istekRef.current;
    setTurlar((t) => [...t, { rol: "user", icerik: soru, zaman: Date.now() }]);

    // Hızlı yol: ağa çıkmadan, anında.
    const hazir = hizliCevap(soru);
    if (hazir) {
      const sira = oncekiler.length + 1;
      setTurlar((t) => [...t, { rol: "assistant", icerik: hazir, zaman: Date.now() }]);
      if (sesliYanit) seslendir(hazir, sira);
      return;
    }

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
      const basarili = !error && typeof data?.cevap === "string";
      const durumKodu = (error as { context?: { status?: number } } | null)?.context?.status;
      const cevap = basarili
        ? duzenle(String(data.cevap))
        : durumKodu === 429
          ? "Çok hızlı soruyorsun. Bir dakika sonra tekrar dene."
          : durumKodu === 401
            ? "Oturumun sona ermiş görünüyor. Çıkış yapıp tekrar giriş yap."
            : HATA_CEVABI;
      const sira = oncekiler.length + 1;
      setTurlar((t) => [...t, { rol: "assistant", icerik: cevap, zaman: Date.now(), hata: !basarili }]);
      if (!basarili) hataGoster();
      if (sesliYanit) seslendir(cevap, sira);
    } catch {
      if (istek !== istekRef.current) return;
      setTurlar((t) => [...t, { rol: "assistant", icerik: HATA_CEVABI, zaman: Date.now(), hata: true }]);
      hataGoster();
    } finally {
      if (istek === istekRef.current) setBekliyor(false);
    }
  }, [bekliyor, turlar, sesliCevap, seslendir, hataGoster]);

  // Tanıyıcının olayları dinleme başladığı andaki `sor`u yakalar; her zaman
  // en güncelini çağırsın diye bir referanstan okunur.
  const sorRef = useRef(sor);
  sorRef.current = sor;

  /**
   * Konuşma tanıma.
   *
   * NEDEN `continuous = true`
   * ─────────────────────────
   * Kapalıyken tarayıcı ilk kısa duraklamada tanımayı bitiriyor ve cümlenin
   * yarısı gidiyordu. Açıkken parçalar birikir; gönderim, konuşma gerçekten
   * bittiğinde yapılır.
   *
   * TEKRAR EDEN KELİMELER
   * ─────────────────────
   * Android aynı cümleyi birikimli olarak defalarca "kesin" diye yolluyor;
   * yeniden başlatmada da son parça bir kez daha geliyor. Parçalar artık uç
   * uca eklenmiyor, örtüşme farkında birleştiriliyor (veri/transkript.ts).
   *
   * YENİDEN BAŞLATMA
   * ────────────────
   * Chrome sessizlikte tanımayı kendiliğinden kapatır. Sürekli dinleme ancak
   * `onend` içinde yeniden başlatılarak elde edilir.
   */
  function dinlemeyiDurdur() {
    kapaniyorRef.current = true;
    if (sessizlikRef.current) clearTimeout(sessizlikRef.current);
    try { taniyiciRef.current?.stop(); } catch { /* zaten durmuş */ }
    kaynagiBirak();
    setDinliyor(false);
  }

  function dinle() {
    if (!mikVar) return;
    sesiUyandir();
    if (dinliyor) { dinlemeyiDurdur(); return; }
    sesiKes();   // asistan konuşurken söz kesilebilir

    const Tanima = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Tanima) return;
    const t = new Tanima();
    t.lang = "tr-TR";
    t.continuous = true;
    t.interimResults = true;
    t.maxAlternatives = 1;

    kapaniyorRef.current = false;
    kesinRef.current = "";
    oncekiRef.current = "";

    const gonder = () => {
      const metin = kesinRef.current.trim();
      kesinRef.current = "";
      oncekiRef.current = "";
      if (!metin) return;
      dinlemeyiDurdur();
      sorRef.current(metin, true);
    };

    t.onsoundstart = () => darbeVer(0.35);

    t.onresult = (o) => {
      // Liste her olayda baştan okunur; resultIndex'e Android'de güvenilmez.
      const { kesin, ara } = oturumMetni(o.results);
      kesinRef.current = birlestir(oncekiRef.current, kesin);
      setTaslak(birlestir(kesinRef.current, ara, true));
      if (!mikrofonOlculebilir) darbeVer(0.6);

      if (sessizlikRef.current) clearTimeout(sessizlikRef.current);
      if (kesinRef.current) {
        sessizlikRef.current = setTimeout(gonder, SESSIZLIK_MS);
      }
    };

    t.onerror = (o) => {
      // "no-speech" ve "aborted" normal akışın parçası.
      if (o.error === "no-speech" || o.error === "aborted") return;
      dinlemeyiDurdur();
      // Sessizce sönen bir düğme "bozuk" gibi görünür; nedeni söylenir.
      if (o.error === "not-allowed" || o.error === "service-not-allowed") {
        setBildirim("Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verebilirsin.");
      } else if (o.error === "audio-capture") {
        setBildirim("Mikrofon bulunamadı.");
      } else if (o.error === "network") {
        setBildirim("Ses tanıma için internet bağlantısı gerekiyor.");
        hataGoster();
      } else {
        hataGoster();
      }
    };

    t.onend = () => {
      if (kapaniyorRef.current) { setDinliyor(false); return; }
      // Elde birikmiş kesin metin varsa onu gönder, yoksa dinlemeye devam et.
      if (kesinRef.current.trim()) { gonder(); return; }
      oncekiRef.current = kesinRef.current;
      try { t.start(); } catch { setDinliyor(false); kaynagiBirak(); }
    };

    taniyiciRef.current = t;
    setDinliyor(true);
    try {
      t.start();
      // Masaüstünde genlik mikrofondan okunur; Android'de tanıma olaylarından.
      mikrofonuOlc().then((acildi) => {
        // İzin penceresi açıkken kullanıcı dinlemeyi bitirmiş olabilir;
        // o durumda akış açık kalmasın (mikrofon ışığı yanık kalırdı).
        if (acildi && kapaniyorRef.current) kaynagiBirak();
      });
    } catch {
      setDinliyor(false);
    }
  }

  function yeniKonusma() {
    istekRef.current++;
    if (dinliyor) dinlemeyiDurdur();
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
            <Simge ad="geri" boyut={18} />
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
        {turlar.map((t, i) => (
          <article
            key={t.zaman + "-" + i}
            className={"tur " + (t.rol === "user" ? "sen" : "yz") + (t.hata ? " hatali" : "")}
          >
            <div className="tur-ust etiket">
              {t.rol === "user" ? "Sen" : "YAZVEB"}
              {konusulan === i && <span className="canli-isaret" aria-label="konuşuyor" />}
              <time dateTime={new Date(t.zaman).toISOString()}>{saat(t.zaman)}</time>
            </div>
            <p>{t.icerik}</p>
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
          if (dinliyor) dinlemeyiDurdur();
          sor(taslak);
        }}
      >
        {mikVar ? (
          <button
            type="button"
            className="mik-dugme"
            onClick={dinle}
            aria-pressed={dinliyor}
            aria-label={dinliyor ? "Dinlemeyi durdur" : "Konuşarak sor"}
            data-ipucu={dinliyor ? "Durdur" : "Konuşarak sor"}
          >
            <Simge ad={dinliyor ? "durdur" : "mikrofon"} />
          </button>
        ) : (
          <span />
        )}
        <input
          ref={girdiRef}
          value={taslak}
          onChange={(e) => setTaslak(e.target.value)}
          placeholder={dinliyor ? "Dinliyorum…" : "Bir şey sor"}
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

/** "mustafa çelik" → "Mustafa". Ad yoksa kullanıcı adı, o da yoksa boş. */
function saat(zaman: number) {
  return new Date(zaman).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
