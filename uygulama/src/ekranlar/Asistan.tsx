import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../veri/supabase";
import { hizliCevap } from "../veri/hizli";
import { HATA_CEVABI } from "../veri/sohbet_kaliplari";
import { apiAdresi } from "../veri/api";

type Tur = { rol: "user" | "assistant"; icerik: string; hizli?: boolean };

// Son kesin sonuçtan sonra beklenen sessizlik. Kısa olursa cümle ortasındaki
// nefeste gönderir, uzun olursa kullanıcı bekler.
const SESSIZLIK_MS = 900;

const ACILIS: Tur = {
  rol: "assistant",
  icerik:
    "Merhaba! Ben YAZVEB Asistanıyım. Topluluk hakkında merak ettiğin her şeyi sorabilirsin.",
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
 * Seslendirme sunucudan gelir (neural Türkçe ses). Tarayıcının kendi
 * `speechSynthesis` motoru cihazın sistem sesini kullanıyor ve Türkçe
 * tonlaması düz, kısaltmaları harf harf okuyordu — o yüzden bırakıldı.
 *
 * Konuşma tanıma tarayıcıda kalır (sunucuya ses göndermeye gerek yok).
 * Desteklemeyen cihazlarda mikrofon düğmesi görünmez, yazılı sohbet olduğu
 * gibi çalışır.
 */
export default function Asistan() {
  const [turlar, setTurlar] = useState<Tur[]>([ACILIS]);
  const [taslak, setTaslak] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [dinliyor, setDinliyor] = useState(false);
  const [sesliCevap, setSesliCevap] = useState(false);
  const dipRef = useRef<HTMLDivElement | null>(null);
  const taniyiciRef = useRef<any>(null);
  const sessizlikRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kesinRef = useRef("");            // birikmiş kesin transkript
  const kapaniyorRef = useRef(false);     // kullanıcı mı durdurdu, tarayıcı mı

  const calanRef = useRef<HTMLAudioElement | null>(null);
  const mikVar =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    dipRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turlar, bekliyor]);

  const sesiKes = useCallback(() => {
    const a = calanRef.current;
    if (!a) return;
    a.pause();
    if (a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
    calanRef.current = null;
  }, []);

  // Ekrandan çıkarken konuşmayı kes; arka planda sesin devam etmesi rahatsız edici.
  useEffect(() => () => {
    sesiKes();
    if (sessizlikRef.current) clearTimeout(sessizlikRef.current);
    kapaniyorRef.current = true;
    try { taniyiciRef.current?.stop(); } catch { /* önemsiz */ }
  }, [sesiKes]);

  /**
   * Cevabı sunucuda seslendirip çalar.
   *
   * Ses ağdan geldiği için metin ekranda zaten görünüyor olacak; gecikme
   * okumayı engellemiyor. Seslendirme başarısız olursa sessizce geçilir —
   * asistanın susması, hata mesajı göstermesinden iyidir.
   */
  const seslendir = useCallback(async (metin: string) => {
    sesiKes();
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
      if (!yanit.ok) return;

      const blob = await yanit.blob();
      if (blob.size < 500) return;                  // hata gövdesi, ses değil
      const ses = new Audio(URL.createObjectURL(blob));
      calanRef.current = ses;
      ses.onended = () => sesiKes();
      await ses.play().catch(() => sesiKes());
    } catch {
      /* ses yoksa sessiz kal */
    }
  }, [sesiKes]);

  const sor = useCallback(async (metin: string) => {
    const soru = metin.trim();
    if (!soru || bekliyor) return;

    setTaslak("");
    const oncekiler = turlar;
    setTurlar((t) => [...t, { rol: "user", icerik: soru }]);

    // Hızlı yol: ağa çıkmadan, anında.
    const hazir = hizliCevap(soru);
    if (hazir) {
      setTurlar((t) => [...t, { rol: "assistant", icerik: hazir, hizli: true }]);
      if (sesliCevap) seslendir(hazir);
      return;
    }

    setBekliyor(true);
    try {
      const { data, error } = await supabase.functions.invoke("asistan", {
        body: {
          soru,
          gecmis: oncekiler
            .filter((t) => t !== ACILIS)
            .slice(-6)
            .map(({ rol, icerik }) => ({ rol, icerik })),
        },
      });
      const cevap = (!error && data?.cevap) ? String(data.cevap) : HATA_CEVABI;
      setTurlar((t) => [...t, { rol: "assistant", icerik: cevap }]);
      if (sesliCevap) seslendir(cevap);
    } catch {
      setTurlar((t) => [...t, { rol: "assistant", icerik: HATA_CEVABI }]);
    } finally {
      setBekliyor(false);
    }
  }, [bekliyor, turlar, sesliCevap, seslendir]);

  /**
   * Konuşma tanıma.
   *
   * NEDEN `continuous = true`
   * ─────────────────────────
   * Kapalıyken tarayıcı ilk kısa duraklamada tanımayı bitiriyor ve cümlenin
   * yarısı gidiyordu ("topluluğa nasıl" ... gerisi yok). Açıkken parçalar
   * birikir; gönderim, konuşma gerçekten bittiğinde yapılır.
   *
   * SESSİZLİK EŞİĞİ
   * ───────────────
   * Son kesin sonuçtan sonra 900 ms beklenir. Daha kısa olursa cümle
   * ortasındaki nefeste gönderir; daha uzun olursa kullanıcı bekler.
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
    setDinliyor(false);
  }

  function dinle() {
    if (!mikVar) return;
    if (dinliyor) { dinlemeyiDurdur(); return; }

    const Tanima =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const t = new Tanima();
    t.lang = "tr-TR";
    t.continuous = true;
    t.interimResults = true;
    t.maxAlternatives = 1;

    kapaniyorRef.current = false;
    kesinRef.current = "";

    const gonder = () => {
      const metin = kesinRef.current.trim();
      kesinRef.current = "";
      if (!metin) return;
      dinlemeyiDurdur();
      sor(metin);
    };

    t.onresult = (o: any) => {
      let ara = "";
      for (let i = o.resultIndex; i < o.results.length; i++) {
        const p = o.results[i];
        if (p.isFinal) kesinRef.current = (kesinRef.current + " " + p[0].transcript).trim();
        else ara += p[0].transcript;
      }
      setTaslak((kesinRef.current + " " + ara).trim());

      if (sessizlikRef.current) clearTimeout(sessizlikRef.current);
      if (kesinRef.current) {
        sessizlikRef.current = setTimeout(gonder, SESSIZLIK_MS);
      }
    };

    t.onerror = (o: any) => {
      // "no-speech" ve "aborted" normal akışın parçası; kullanıcıyı rahatsız
      // etmeden devam edilir.
      if (o.error === "no-speech" || o.error === "aborted") return;
      dinlemeyiDurdur();
    };

    t.onend = () => {
      if (kapaniyorRef.current) { setDinliyor(false); return; }
      // Elde birikmiş kesin metin varsa onu gönder, yoksa dinlemeye devam et.
      if (kesinRef.current.trim()) { gonder(); return; }
      try { t.start(); } catch { setDinliyor(false); }
    };

    taniyiciRef.current = t;
    setDinliyor(true);
    try { t.start(); } catch { setDinliyor(false); }
  }

  return (
    <div className="sohbet">
      <header className="asistan-basi">
        <img className="basi-logo" src="/logo-128.webp" alt="" width={30} height={30} />
        <div>
          <b>YAZVEB Asistanı</b>
          <small>{bekliyor ? "düşünüyor…" : "kurumsal hafıza"}</small>
        </div>
        <button
          className={"ses-dugme" + (sesliCevap ? " etkin" : "")}
          onClick={() => {
            if (sesliCevap) sesiKes();
            setSesliCevap(!sesliCevap);
          }}
          aria-pressed={sesliCevap}
          title={sesliCevap ? "Sesli cevap açık" : "Sesli cevap kapalı"}
        >
          {sesliCevap ? "🔊" : "🔇"}
        </button>
      </header>

      <div className="sohbet-liste">
        {turlar.map((t, i) => (
          <div
            key={i}
            className={"balon-grup" + (t.rol === "user" ? " benim" : "")}
          >
            <div className="balon">
              <p>{t.icerik}</p>
            </div>
          </div>
        ))}
        {bekliyor && (
          <div className="balon-grup">
            <div className="balon dusunuyor"><i /><i /><i /></div>
          </div>
        )}
        <div ref={dipRef} />
      </div>

      <form
        className="yazma"
        onSubmit={(e) => { e.preventDefault(); sor(taslak); }}
      >
        {mikVar && (
          <button
            type="button"
            className={"mik-dugme" + (dinliyor ? " dinliyor" : "")}
            onClick={dinle}
            aria-label={dinliyor ? "Dinlemeyi durdur" : "Konuşarak sor"}
            title={dinliyor ? "Bitince dokun" : "Konuşarak sor"}
          >
            ●
          </button>
        )}
        <input
          value={taslak}
          onChange={(e) => setTaslak(e.target.value)}
          placeholder={dinliyor ? "Dinliyorum…" : "Asistana sor…"}
          maxLength={1000}
          aria-label="Soru"
        />
        <button type="submit" disabled={!taslak.trim() || bekliyor} aria-label="Gönder">
          ↑
        </button>
      </form>
    </div>
  );
}
