// ═══════════════════════════════════════════════════════════════════
// Sesli soru — tanıma + kayıt yedeği
// ═══════════════════════════════════════════════════════════════════
// İki yol aynı anda çalışır; hangisi önce metin verirse o kazanır:
//
//   TANIMA  Tarayıcının kendi konuşma tanıması (Chrome, Edge, Safari).
//           Hızlı; ara sonuçları kutuda canlı gösterir.
//   KAYIT   Aynı mikrofon akışından ses kaydı. Konuşma bitince tanıma
//           metin vermediyse kayıt sunucuda yazıya dökülür.
//
// NEDEN İKİSİ BİRDEN
// ──────────────────
// Bilgisayarda "mikrofon çalışıyor ama yazıya dönmüyor" şikâyeti: küre
// sesi duyuyor (mikrofon açık), ama tanıma servisi hiçbir sonuç dönmüyor
// ya da "network"/"service-not-allowed" hatası veriyor (Brave, Opera,
// kurumsal ağlar, bazı Windows kurulumları). Firefox'ta tanıma hiç yok.
// Kayıt yedeği bunların hepsinde çalışır.
//
// ANDROID: tanıma mikrofonu tek başına istiyor (bkz. olcer.ts); orada kayıt
// yalnızca tanıma HİÇ yoksa açılır.
// ═══════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { birlestir, oturumMetni } from "../veri/transkript";
import {
  darbeVer,
  kaynagiBirak,
  mikrofonOlculebilir,
  mikrofonSeviyesi,
  mikrofonuOlc,
  sesBaglami,
  sesiUyandir,
} from "./olcer";
import { base64, Kaydedici, kayitDesteklenir, konusmaIzle, wavaCevir } from "./kayit";

/** Tanımanın son kesin sonucundan sonra beklenen sessizlik. */
const SESSIZLIK_MS = 900;
/**
 * Konuşma bitti ama tanıma sessiz: kayda geçmeden önce ona tanınan süre.
 * Çalışan tanıma konuşma sürerken ara sonuç verir; bu sürede HİÇ sonuç
 * yoksa bozuktur, beklemek yalnızca gecikme ekler. Ara sonuç varsa kesin
 * sonucu biraz daha beklenir.
 */
const TANIMAYA_PAY_MS = 900;
const ARA_SONUCA_PAY_MS = 2000;

/** Kalıcı hatalar: kayıt da çalışmaz (izin yok, mikrofon yok). */
const KALICI = new Set(["not-allowed", "audio-capture"]);

export type DinleyiciAyari = {
  /** Konuşma metne döndü: soru olarak gönder. */
  onMetin: (metin: string) => void;
  /** Tanımanın ara metni (kutuda canlı görünür). */
  onTaslak: (metin: string) => void;
  onBildirim: (mesaj: string) => void;
  onHata: () => void;
  /** Kaydı (16 kHz WAV, base64) yazıya döker; konuşma yoksa boş/null. */
  yaziyaDok: (wavBase64: string) => Promise<string | null>;
};

const tanimaSinifi = () =>
  typeof window === "undefined" ? undefined : window.SpeechRecognition ?? window.webkitSpeechRecognition;

export const sesliSoruDesteklenir = !!tanimaSinifi() || kayitDesteklenir;

export function useDinleyici(ayar: DinleyiciAyari) {
  const [dinliyor, setDinliyor] = useState(false);
  const [isleniyor, setIsleniyor] = useState(false);

  const ayarRef = useRef(ayar);
  ayarRef.current = ayar;

  const taniyici = useRef<Taniyici | null>(null);
  const kaydedici = useRef<Kaydedici | null>(null);
  const izlemeyiBitir = useRef<(() => void) | null>(null);
  const kesin = useRef("");
  const onceki = useRef("");
  const ara = useRef("");
  const kapaniyor = useRef(true);
  const tanimaCalisiyor = useRef(false);
  const konustu = useRef(false);
  const sessizlikZamani = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yedekZamani = useRef<ReturnType<typeof setTimeout> | null>(null);

  const zamanlariTemizle = () => {
    if (sessizlikZamani.current) clearTimeout(sessizlikZamani.current);
    if (yedekZamani.current) clearTimeout(yedekZamani.current);
    sessizlikZamani.current = yedekZamani.current = null;
  };

  /** Tanımayı ve izlemeyi durdurur; kaydı ve mikrofonu isteğe göre. */
  const kapat = useCallback((kayitDahil: boolean) => {
    kapaniyor.current = true;
    zamanlariTemizle();
    izlemeyiBitir.current?.();
    izlemeyiBitir.current = null;
    try { taniyici.current?.stop(); } catch { /* zaten durmuş */ }
    taniyici.current = null;
    if (kayitDahil) {
      kaydedici.current?.iptal();
      kaydedici.current = null;
      kaynagiBirak();
    }
    setDinliyor(false);
  }, []);

  const metinGonder = useCallback((metin: string) => {
    kapat(true);
    ayarRef.current.onTaslak("");
    if (metin.trim()) ayarRef.current.onMetin(metin.trim());
  }, [kapat]);

  /** Tanıma metin vermedi: kaydı yazıya döktür. */
  const kayittanGonder = useCallback(async () => {
    const k = kaydedici.current;
    kaydedici.current = null;
    kapat(false);
    const a = ayarRef.current;
    if (!k) {
      kaynagiBirak();
      a.onBildirim("Sesin yazıya dönmedi. Bu tarayıcıda ses tanıma çalışmıyor olabilir; yazarak sorabilirsin.");
      return;
    }
    const kayit = await k.bitir();
    kaynagiBirak();   // kayıt kapandıktan sonra mikrofon ışığı sönsün
    if (!konustu.current || !kayit) {
      a.onBildirim("Sesini duyamadım. Mikrofona biraz daha yakın konuşmayı dene.");
      return;
    }
    setIsleniyor(true);
    try {
      const wav = await wavaCevir(kayit, sesBaglami() ?? new OfflineAudioContext(1, 1, 16000));
      if (!wav) { a.onBildirim("Sesini duyamadım. Bir daha dener misin?"); return; }
      const metin = await a.yaziyaDok(await base64(wav));
      if (metin?.trim()) a.onMetin(metin.trim());
      else a.onBildirim("Ne dediğini anlayamadım. Bir daha söyler misin?");
    } catch {
      a.onHata();
      a.onBildirim("Sesin yazıya dökülemedi. Yazarak sorabilirsin.");
    } finally {
      setIsleniyor(false);
    }
  }, [kapat]);

  /** Konuşma algılayıcısı "sustu" dedi. */
  const sustu = useCallback(() => {
    if (kapaniyor.current || kesin.current.trim()) return;   // tanıma kendisi gönderecek
    const bekle = tanimaCalisiyor.current ? (ara.current.trim() ? ARA_SONUCA_PAY_MS : TANIMAYA_PAY_MS) : 0;
    yedekZamani.current = setTimeout(() => {
      if (kapaniyor.current || kesin.current.trim()) return;
      // Tanıma yalnızca ara sonuç verdiyse o da söylenenin kendisidir.
      if (ara.current.trim()) { metinGonder(birlestir(kesin.current, ara.current, true)); return; }
      kayittanGonder();
    }, bekle);
  }, [kayittanGonder, metinGonder]);

  const tanimayiBaslat = useCallback((Tanima: new () => Taniyici) => {
    const t = new Tanima();
    t.lang = "tr-TR";
    t.continuous = true;      // kapalıyken ilk nefeste bitiyor, cümlenin yarısı gidiyordu
    t.interimResults = true;
    t.maxAlternatives = 1;

    t.onsoundstart = () => darbeVer(0.35);
    t.onresult = (o) => {
      // Liste her olayda baştan okunur; resultIndex'e Android'de güvenilmez.
      const s = oturumMetni(o.results);
      kesin.current = birlestir(onceki.current, s.kesin);
      ara.current = s.ara;
      ayarRef.current.onTaslak(birlestir(kesin.current, s.ara, true));
      if (!mikrofonOlculebilir) darbeVer(0.6);
      if (sessizlikZamani.current) clearTimeout(sessizlikZamani.current);
      if (kesin.current) sessizlikZamani.current = setTimeout(() => metinGonder(kesin.current), SESSIZLIK_MS);
    };
    t.onerror = (o) => {
      if (o.error === "no-speech" || o.error === "aborted") return;
      tanimaCalisiyor.current = false;
      const yedekVar = mikrofonOlculebilir && kayitDesteklenir;
      if (!KALICI.has(o.error) && yedekVar) return;   // kayıt sürüyor; hata kullanıcıya yansımaz
      kapat(true);
      const a = ayarRef.current;
      if (o.error === "not-allowed" || o.error === "service-not-allowed") {
        a.onBildirim("Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verebilirsin.");
      } else if (o.error === "audio-capture") {
        a.onBildirim("Mikrofon bulunamadı.");
      } else if (o.error === "network") {
        a.onBildirim("Ses tanıma için internet bağlantısı gerekiyor.");
        a.onHata();
      } else {
        a.onHata();
      }
    };
    t.onend = () => {
      if (kapaniyor.current || !tanimaCalisiyor.current) return;
      // Elde kesin metin varsa onu gönder; yoksa dinlemeye devam (Chrome sessizlikte kendini kapatır).
      if (kesin.current.trim()) { metinGonder(kesin.current); return; }
      onceki.current = kesin.current;
      try { t.start(); } catch { tanimaCalisiyor.current = false; if (!kaydedici.current) kapat(true); }
    };

    taniyici.current = t;
    try {
      t.start();
      tanimaCalisiyor.current = true;
    } catch {
      tanimaCalisiyor.current = false;
    }
  }, [kapat, metinGonder]);

  const baslat = useCallback(async () => {
    if (!kapaniyor.current || isleniyor) return;
    sesiUyandir();
    kapaniyor.current = false;
    kesin.current = onceki.current = ara.current = "";
    konustu.current = false;
    setDinliyor(true);

    const Tanima = tanimaSinifi();
    if (Tanima) tanimayiBaslat(Tanima);

    // Masaüstünde kayıt tanımanın yanında yedek; tanıma hiç yoksa tek yol.
    if (!Tanima || mikrofonOlculebilir) {
      const akis = await mikrofonuOlc(!Tanima);
      // İzin penceresi açıkken kullanıcı dinlemeyi bitirmiş olabilir.
      if (kapaniyor.current) { if (akis) kaynagiBirak(); return; }
      if (!akis) {
        if (!Tanima) {
          kapat(true);
          ayarRef.current.onBildirim("Mikrofona erişilemedi. Tarayıcı ayarlarından izin verebilirsin.");
        }
        return;
      }
      if (kayitDesteklenir) kaydedici.current = new Kaydedici(akis);
      izlemeyiBitir.current = konusmaIzle(mikrofonSeviyesi, {
        konustu: () => { konustu.current = true; },
        sustu,
      });
    }
  }, [isleniyor, kapat, sustu, tanimayiBaslat]);

  /** Kullanıcı mikrofon düğmesine yeniden dokundu: söylenen varsa gönder. */
  const durdur = useCallback(() => {
    if (kapaniyor.current) return;
    const soylenen = birlestir(kesin.current, ara.current, true).trim();
    if (soylenen) { metinGonder(soylenen); return; }
    if (kaydedici.current && konustu.current) { kayittanGonder(); return; }
    kapat(true);
    ayarRef.current.onTaslak("");
  }, [kapat, kayittanGonder, metinGonder]);

  /** Hiçbir şey göndermeden kapat (yeni konuşma, ekrandan çıkış). */
  const iptal = useCallback(() => {
    if (!kapaniyor.current) kapat(true);
  }, [kapat]);

  useEffect(() => () => {
    kapaniyor.current = true;
    zamanlariTemizle();
    izlemeyiBitir.current?.();
    try { taniyici.current?.abort(); } catch { /* önemsiz */ }
    kaydedici.current?.iptal();
  }, []);

  return { dinliyor, isleniyor, baslat, durdur, iptal };
}
