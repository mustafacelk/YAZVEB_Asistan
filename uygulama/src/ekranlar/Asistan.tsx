import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../veri/supabase";
import { hizliCevap } from "../veri/hizli";
import { HATA_CEVABI } from "../veri/sohbet_kaliplari";

type Tur = { rol: "user" | "assistant"; icerik: string; hizli?: boolean };

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
 * Konuşma tanıma ve seslendirme tarayıcının kendi motorlarıyla yapılır:
 * ek sunucu yok, ek maliyet yok, çevrimdışı bile çalışır. Android'de Türkçe
 * desteği iyi; desteklemeyen cihazlarda düğmeler görünmez ve yazılı sohbet
 * olduğu gibi çalışmaya devam eder.
 */
export default function Asistan() {
  const [turlar, setTurlar] = useState<Tur[]>([ACILIS]);
  const [taslak, setTaslak] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [dinliyor, setDinliyor] = useState(false);
  const [sesliCevap, setSesliCevap] = useState(false);
  const dipRef = useRef<HTMLDivElement | null>(null);
  const taniyiciRef = useRef<any>(null);

  const sesVar = typeof window !== "undefined" && "speechSynthesis" in window;
  const mikVar =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    dipRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turlar, bekliyor]);

  // Ekrandan çıkarken konuşmayı kes; arka planda sesin devam etmesi rahatsız edici.
  useEffect(() => () => { if (sesVar) window.speechSynthesis.cancel(); }, [sesVar]);

  const seslendir = useCallback((metin: string) => {
    if (!sesVar) return;
    window.speechSynthesis.cancel();
    const s = new SpeechSynthesisUtterance(metin);
    s.lang = "tr-TR";
    s.rate = 1.05;
    const tr = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("tr"));
    if (tr) s.voice = tr;
    window.speechSynthesis.speak(s);
  }, [sesVar]);

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

  function dinle() {
    if (!mikVar) return;
    if (dinliyor) {
      taniyiciRef.current?.stop();
      return;
    }
    const Tanima =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const t = new Tanima();
    t.lang = "tr-TR";
    t.interimResults = true;
    t.continuous = false;
    t.onresult = (o: any) => {
      let metin = "";
      for (let i = 0; i < o.results.length; i++) metin += o.results[i][0].transcript;
      setTaslak(metin);
      // Kesin sonuç geldiyse beklemeden gönder; kullanıcı ikinci kez
      // düğmeye basmak zorunda kalmasın.
      if (o.results[o.results.length - 1].isFinal) {
        t.stop();
        sor(metin);
      }
    };
    t.onerror = () => setDinliyor(false);
    t.onend = () => setDinliyor(false);
    taniyiciRef.current = t;
    setDinliyor(true);
    try { t.start(); } catch { setDinliyor(false); }
  }

  return (
    <div className="sohbet">
      <header className="asistan-basi">
        <span className="marka-nokta" />
        <div>
          <b>YAZVEB Asistanı</b>
          <small>{bekliyor ? "düşünüyor…" : "kurumsal hafıza"}</small>
        </div>
        {sesVar && (
          <button
            className={"ses-dugme" + (sesliCevap ? " etkin" : "")}
            onClick={() => {
              if (sesliCevap) window.speechSynthesis.cancel();
              setSesliCevap(!sesliCevap);
            }}
            aria-pressed={sesliCevap}
            title={sesliCevap ? "Sesli cevap açık" : "Sesli cevap kapalı"}
          >
            {sesliCevap ? "🔊" : "🔇"}
          </button>
        )}
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
