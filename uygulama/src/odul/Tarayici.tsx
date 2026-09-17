import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import {
  GOREV_MESAJI,
  gorevMesaji,
  hedefCumlesi,
  konumAl,
  odul,
  OdulHatasi,
  sayi,
  seviyeIlerlemesi,
  sonrakiAdim,
  SPONSOR_MESAJI,
  tarihSaat,
  titret,
  type GorevSonucu,
  type Sponsor,
  type SponsorSonucu,
} from "../veri/odul";
import { cozucuKur, kisaKodSadelestir, yazvebKoduMu } from "./qr";
import Reveal from "./Reveal";

export type TaramaModu = { tur: "gorev" } | { tur: "sponsor"; sponsor: Sponsor };

type Gonderim = { icerik: string; yontem: "qr" | "kod" };

type Asama =
  | { ad: "hazirlik" }
  | { ad: "izin" }
  | { ad: "kamera" }
  | { ad: "kod" }
  | { ad: "dogruluyor" }
  | { ad: "gorev_tamam"; sonuc: Extract<GorevSonucu, { durum: "tamam" }> }
  | { ad: "odul"; sonuc: Extract<SponsorSonucu, { durum: "tamam" }> }
  /** `tekrar`: bağlantı hatası; aynı kod yeniden okutulmadan gönderilebilir. */
  | { ad: "hata"; mesaj: string; kodaDon?: boolean; tekrar?: Gonderim };

/** Aynı QR'nin art arda karelerde tekrar okunmasını yok sayma süresi. */
const TEKRAR_BEKLE_MS = 2500;

/** Kamera bir kez başarıyla açıldıysa açıklama ekranı bir daha gösterilmez. */
const KAMERA_ANAHTARI = "yazveb:kamera-izni";

function kameraIzniHatirlaniyor() {
  try { return localStorage.getItem(KAMERA_ANAHTARI) === "verildi"; } catch { return false; }
}
function kameraIzniniHatirla() {
  try { localStorage.setItem(KAMERA_ANAHTARI, "verildi"); } catch { /* gizli sekme */ }
}

/**
 * QR tarayıcı — tam ekran.
 *
 * Kamera zorunlu değil: izin verilmezse ya da kullanıcı istemezse aynı ekranda
 * kısa kod girilir. Okunan metin YALNIZCA sunucuya gider; puan, ödül, kilit
 * kararlarının hiçbiri burada verilmez.
 *
 * İZİN
 * ────
 * Sistem izin penceresi bağlamsız açılırsa "bu uygulama neden kameramı
 * istiyor?" sorusu cevapsız kalır ve izin reddedilir. İlk seferde önce
 * YAZVEB kendi cümlesiyle neden gerektiğini ve görüntünün cihazdan
 * çıkmadığını söyler; kısa kod seçeneği aynı ekranda eşit ağırlıkta durur.
 * İzin daha önce verildiyse bu adım atlanır.
 */
export default function Tarayici({
  mod,
  onKapat,
  onDegisti,
  onOdulGoster,
}: {
  mod: TaramaModu;
  onKapat: () => void;
  onDegisti: () => void;
  onOdulGoster?: (kazanimId: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const akisRef = useRef<MediaStream | null>(null);
  const donguRef = useRef(0);
  const sonOkunanRef = useRef<{ metin: string; zaman: number } | null>(null);
  const mesgulRef = useRef(false);
  const [asama, setAsama] = useState<Asama>(() =>
    kameraIzniHatirlaniyor() ? { ad: "kamera" } : { ad: "hazirlik" });
  const [kameraDurumu, setKameraDurumu] = useState<"aciliyor" | "acik" | "yok" | "reddedildi">("aciliyor");
  const [kod, setKod] = useState("");
  const [uyari, setUyari] = useState<string | null>(null);

  const kamerayiKapat = useCallback(() => {
    cancelAnimationFrame(donguRef.current);
    akisRef.current?.getTracks().forEach((t) => t.stop());   // kamera ışığı sönsün
    akisRef.current = null;
  }, []);

  // Esc kapatır; ekrandan çıkarken kamera MUTLAKA kapanır.
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    return () => {
      window.removeEventListener("keydown", tus);
      kamerayiKapat();
    };
  }, [onKapat, kamerayiKapat]);

  // İzin durumu tarayıcıdan sorulabiliyorsa açıklama ekranı gereksizse atlanır.
  useEffect(() => {
    if (asama.ad !== "hazirlik") return;
    let iptal = false;
    const sonuc = (durum: PermissionState | null) => {
      if (iptal) return;
      if (durum === "granted") setAsama({ ad: "kamera" });
      else if (durum === "denied") { setKameraDurumu("reddedildi"); setAsama({ ad: "kod" }); }
      else setAsama({ ad: "izin" });
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      setKameraDurumu("yok");
      setAsama({ ad: "kod" });
      return;
    }
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "camera" as PermissionName })
        .then((d) => sonuc(d.state))
        .catch(() => sonuc(null));   // Firefox/eski WebView "camera" adını tanımıyor
    } else {
      sonuc(null);
    }
    return () => { iptal = true; };
  }, [asama.ad]);

  const gonder = useCallback(async (icerik: string, yontem: "qr" | "kod") => {
    if (mesgulRef.current) return;
    mesgulRef.current = true;
    setAsama({ ad: "dogruluyor" });
    setUyari(null);
    try {
      if (mod.tur === "gorev") {
        let sonuc = await odul.gorevTamamla(icerik);
        if (sonuc.durum === "konum_gerekli") {
          // Konum yalnızca sunucu isterse ve yalnızca bu an için alınır.
          const konum = await konumAl();
          if (!konum) {
            setAsama({
              ad: "hata",
              mesaj: `${GOREV_MESAJI.konum_gerekli} Konum izni kapalıysa telefon ayarlarından açıp tekrar dene.`,
              kodaDon: yontem === "kod",
            });
            return;
          }
          sonuc = await odul.gorevTamamla(icerik, konum);
        }
        if (sonuc.durum === "tamam") {
          titret([18, 60, 28]);
          kamerayiKapat();
          setAsama({ ad: "gorev_tamam", sonuc });
          onDegisti();
        } else {
          titret(60);
          const mesaj = sonuc.durum === "baslamadi" && sonuc.baslangic
            ? `${GOREV_MESAJI.baslamadi} ${tarihSaat(sonuc.baslangic)} itibarıyla okutabilirsin.`
            : gorevMesaji(sonuc.durum, yontem);
          setAsama({ ad: "hata", mesaj, kodaDon: yontem === "kod" });
        }
      } else {
        const sonuc = await odul.sponsorTara(mod.sponsor.id, icerik);
        if (sonuc.durum === "tamam") {
          titret([18, 60, 28]);
          kamerayiKapat();
          setAsama({ ad: "odul", sonuc });
          onDegisti();
        } else if (sonuc.durum === "kilitli") {
          setAsama({ ad: "hata", mesaj: `${mod.sponsor.ad} kilidi henüz açılmadı. ${hedefCumlesi({ ...sonuc.kilit, sponsor: mod.sponsor.ad }) ?? ""}` });
        } else {
          titret(60);
          setAsama({ ad: "hata", mesaj: SPONSOR_MESAJI[sonuc.durum], kodaDon: yontem === "kod" });
        }
      }
    } catch (h) {
      // Bağlantı koptuysa okutulan kod kaybolmasın: kalabalıkta QR'yi tekrar
      // yakalamaya çalışmak yerine tek dokunuşla yeniden gönderilir.
      const gecici = !(h instanceof OdulHatasi) || h.gecici;
      setAsama({
        ad: "hata",
        mesaj: gecici
          ? "Bağlantı zayıf, sunucuya ulaşamadık. Kodun kaybolmadı; tekrar gönderebilirsin."
          : (h as OdulHatasi).message,
        kodaDon: yontem === "kod",
        tekrar: gecici ? { icerik, yontem } : undefined,
      });
    } finally {
      mesgulRef.current = false;
    }
  }, [mod, kamerayiKapat, onDegisti]);

  // ── Kamera ──
  useEffect(() => {
    if (asama.ad !== "kamera") return;
    let iptal = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setKameraDurumu("yok");
        setAsama({ ad: "kod" });
        return;
      }
      try {
        if (!akisRef.current) {
          akisRef.current = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
        }
        if (iptal) return;
        kameraIzniniHatirla();
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = akisRef.current;
        await video.play().catch(() => {});
        setKameraDurumu("acik");

        const coz = await cozucuKur();
        let sonKare = 0;
        const dongu = async (an: number) => {
          if (iptal) return;
          donguRef.current = requestAnimationFrame(dongu);
          // Saniyede ~8 deneme yeter; her karede çözmek pili boşa yakar.
          if (an - sonKare < 120 || mesgulRef.current) return;
          sonKare = an;
          let metin: string | null = null;
          try { metin = await coz(video); } catch { /* tek kare hatası önemsiz */ }
          if (!metin || iptal) return;

          const son = sonOkunanRef.current;
          if (son && son.metin === metin && Date.now() - son.zaman < TEKRAR_BEKLE_MS) return;
          sonOkunanRef.current = { metin, zaman: Date.now() };

          const tur = yazvebKoduMu(metin);
          if (!tur) {
            setUyari(mod.tur === "gorev" ? "Bu QR YAZVEB'e ait değil. Etkinlikteki YAZVEB QR'sini okut." : "Bu QR YAZVEB'e ait değil. İşletmedeki YAZVEB QR'sini okut.");
            return;
          }
          if (tur !== mod.tur) {
            setUyari(mod.tur === "gorev" ? GOREV_MESAJI.sponsor_qr : SPONSOR_MESAJI.gorev_qr);
            return;
          }
          titret(12);
          cancelAnimationFrame(donguRef.current);
          gonder(metin.trim(), "qr");
        };
        donguRef.current = requestAnimationFrame(dongu);
      } catch (h) {
        if (iptal) return;
        const ad = (h as DOMException)?.name;
        setKameraDurumu(ad === "NotAllowedError" || ad === "SecurityError" ? "reddedildi" : "yok");
        setAsama({ ad: "kod" });
      }
    })();

    return () => {
      iptal = true;
      cancelAnimationFrame(donguRef.current);
    };
  }, [asama.ad, gonder, mod.tur]);

  // Uyarı kendiliğinden kaybolur.
  useEffect(() => {
    if (!uyari) return;
    const z = setTimeout(() => setUyari(null), 2200);
    return () => clearTimeout(z);
  }, [uyari]);

  function koduGonder(e: FormEvent) {
    e.preventDefault();
    const temiz = kisaKodSadelestir(kod);
    if (temiz.length < 4) {
      setUyari("Kod en az 4 karakter.");
      return;
    }
    gonder(temiz, "kod");
  }

  const baslik = mod.tur === "gorev" ? "Puan kazan" : mod.sponsor.ad;
  const sponsorMu = mod.tur === "sponsor";

  return createPortal(
    <div className="tarayici" role="dialog" aria-modal="true" aria-label={`${baslik} — QR tara`}>
      <div className="tarayici-ust">
        <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat">
          <Simge ad="kapat" />
        </button>
        <span className="etiket">{mod.tur === "gorev" ? "Etkinlik görevi" : "Sponsor ödülü"}</span>
        <span className="tarayici-bosluk" />
      </div>

      {/* Kamera görüntüsü yalnızca kamera aşamasında görünür; akış arka planda da kapanır. */}
      <video
        ref={videoRef}
        className="tarayici-video"
        playsInline
        muted
        data-gorunur={asama.ad === "kamera" && kameraDurumu === "acik"}
      />
      <div className="tarayici-karartma" aria-hidden="true" />

      {asama.ad === "izin" && (
        <div className="tarayici-merkez izin-oncesi">
          <div className="izin-isareti" aria-hidden="true"><Simge ad="tara" boyut={30} /></div>
          <h2>{sponsorMu ? "İşletmedeki QR'yi okut" : "Etkinlikteki QR'yi okut"}</h2>
          <p>
            QR kodunu tarayabilmek için kameraya ihtiyacımız var. Görüntü telefonunda işlenir;
            kaydedilmez, hiçbir yere gönderilmez.
          </p>
          <div className="basari-dugmeleri">
            <button className="dugme birincil genis" onClick={() => setAsama({ ad: "kamera" })} autoFocus>
              Kamerayı aç
            </button>
            <button className="dugme genis" onClick={() => setAsama({ ad: "kod" })}>
              <Simge ad="klavye" boyut={18} /> Kısa kodla devam et
            </button>
          </div>
        </div>
      )}

      {asama.ad === "kamera" && (
        <div className="tarayici-merkez">
          <div className="tarama-cercevesi" data-durum={kameraDurumu} aria-hidden="true">
            <i /><i /><i /><i />
            <span className="tarama-cizgisi" />
          </div>
          <p className="tarayici-ipucu">
            {kameraDurumu === "aciliyor" ? "Kamera açılıyor…" : "QR kodunu çerçevenin içine getir"}
          </p>
          {uyari && <p className="tarayici-uyari" role="status">{uyari}</p>}
        </div>
      )}

      {asama.ad === "kod" && (
        <form className="tarayici-merkez kod-girisi" onSubmit={koduGonder}>
          <Simge ad="klavye" boyut={28} />
          <h2>Kısa kodu gir</h2>
          <p className="soluk">
            {kameraDurumu === "reddedildi"
              ? "Kamera izni kapalı. Kısa kodla aynı şekilde devam edebilirsin; kamerayı kullanmak istersen telefon ayarlarından YAZVEB'e izin ver."
              : kameraDurumu === "yok"
                ? "Bu cihazda kamera kullanılamıyor. Kısa kodla aynı şekilde devam edebilirsin."
                : sponsorMu
                  ? "QR'nin altında yazan kodu gir."
                  : "Etkinlikte QR'nin altında gösterilen kodu gir."}
          </p>
          <input
            className="kod-alani"
            value={kod}
            onChange={(e) => setKod(kisaKodSadelestir(e.target.value))}
            placeholder="YAZ25"
            inputMode="text"
            enterKeyHint="go"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            aria-label="Kısa kod"
            autoFocus
          />
          {uyari && <p className="tarayici-uyari" role="status">{uyari}</p>}
          <button type="submit" className="dugme birincil genis" disabled={kisaKodSadelestir(kod).length < 4}>
            Doğrula
          </button>
        </form>
      )}

      {asama.ad === "dogruluyor" && (
        <div className="tarayici-merkez" role="status" aria-live="polite">
          <div className="dogrulama-halkasi" aria-hidden="true" />
          <p className="etiket">{sponsorMu ? "Ödülün hazırlanıyor" : "Kod doğrulanıyor"}</p>
        </div>
      )}

      {asama.ad === "hata" && (
        <div className="tarayici-merkez" role="alert">
          <div className="hata-isareti" aria-hidden="true"><Simge ad="kapat" boyut={28} /></div>
          <p className="tarayici-mesaj">{asama.mesaj}</p>
          <div className="basari-dugmeleri">
            {asama.tekrar && (
              <button className="dugme birincil genis" onClick={() => {
                const t = asama.tekrar!;
                gonder(t.icerik, t.yontem);
              }}>
                <Simge ad="yenile" boyut={18} /> Tekrar gönder
              </button>
            )}
            <button
              className={"dugme genis" + (asama.tekrar ? "" : " birincil")}
              onClick={() => {
                const kodaDon = asama.kodaDon || kameraDurumu !== "acik";
                if (kodaDon) kamerayiKapat();   // kod yazarken kamera açık kalmasın
                sonOkunanRef.current = null;
                setAsama({ ad: kodaDon ? "kod" : "kamera" });
              }}
            >
              {asama.kodaDon || kameraDurumu !== "acik" ? "Kodu yeniden gir" : "Yeniden tara"}
            </button>
          </div>
        </div>
      )}

      {asama.ad === "gorev_tamam" && <GorevBasarisi sonuc={asama.sonuc} onKapat={onKapat}
        onTekrar={() => { sonOkunanRef.current = null; setKod(""); setAsama({ ad: kameraDurumu === "acik" || kameraDurumu === "aciliyor" ? "kamera" : "kod" }); }} />}

      {asama.ad === "odul" && (
        <Reveal
          kazanim={asama.sonuc.kazanim}
          onGoster={() => { onKapat(); onOdulGoster?.(asama.sonuc.kazanim.id); }}
          onKapat={onKapat}
        />
      )}

      {(asama.ad === "kamera" || asama.ad === "kod") && (
        <div className="tarayici-alt">
          {asama.ad === "kamera" ? (
            <button className="dugme" onClick={() => { kamerayiKapat(); setAsama({ ad: "kod" }); }}>
              <Simge ad="klavye" boyut={18} />
              Kısa kodla gir
            </button>
          ) : kameraDurumu !== "reddedildi" && kameraDurumu !== "yok" ? (
            <button className="dugme" onClick={() => setAsama({ ad: "kamera" })}>
              <Simge ad="tara" boyut={18} />
              Kamerayla tara
            </button>
          ) : null}
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * Görev başarısı: güçlü ama sade geri bildirim. Konfeti yok.
 *
 * "Başarılı" demek yetmez; üç soruyu cevaplar: ne oldu (katılımın kaydedildi),
 * ne kazandım (+XP, seri), bu beni nereye götürüyor (bir sonraki adım).
 */
function GorevBasarisi({
  sonuc,
  onKapat,
  onTekrar,
}: {
  sonuc: Extract<GorevSonucu, { durum: "tamam" }>;
  onKapat: () => void;
  onTekrar: () => void;
}) {
  const toplam = sonuc.puan + sonuc.bonus;
  const [gosterilen, setGosterilen] = useState(0);
  const [xp, setXp] = useState(sonuc.xp_once);

  // Sayaç: +0 → +100 ve toplam XP, ~700 ms'de yavaşlayarak.
  useEffect(() => {
    const azHareket = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (azHareket) { setGosterilen(toplam); setXp(sonuc.xp); return; }
    const bas = performance.now();
    const sure = 750;
    let kare = 0;
    const adim = (an: number) => {
      const t = Math.min(1, (an - bas) / sure);
      const e = 1 - Math.pow(1 - t, 3);
      setGosterilen(Math.round(toplam * e));
      setXp(Math.round(sonuc.xp_once + (sonuc.xp - sonuc.xp_once) * e));
      if (t < 1) kare = requestAnimationFrame(adim);
    };
    kare = requestAnimationFrame(adim);
    return () => cancelAnimationFrame(kare);
  }, [toplam, sonuc.xp, sonuc.xp_once]);

  const ilerleme = seviyeIlerlemesi(xp, sonuc.seviye);
  // Görev sonucu toplam sponsor sayısını taşımaz; "bütün kilitler açık"
  // iddiasında bulunmamak için 0 verilir.
  const sonraki = sonrakiAdim({
    xp: sonuc.xp,
    etkinlik_sayisi: 1,
    seviye: sonuc.seviye,
    sonraki_kilit: sonuc.sonraki_kilit ? { ...sonuc.sonraki_kilit, id: "" } : null,
    toplam_sponsor: 0,
  });

  return (
    <div className="tarayici-merkez basari" role="status" aria-live="assertive">
      <div className="basari-isareti" aria-hidden="true"><Simge ad="tik" boyut={30} /></div>
      <p className="basari-baslik">Katılımın kaydedildi</p>
      <p className="etiket">{sonuc.baslik}</p>
      <p className="puan-kazanimi rakam" aria-label={`${toplam} puan kazandın`}>+{sayi(gosterilen)}<span>XP</span></p>
      {sonuc.bonus > 0 && (
        <p className="seri-bonusu"><Simge ad="alev" boyut={16} /> Seri ×{sonuc.seri} · +{sonuc.bonus} bonus</p>
      )}

      <div className="basari-ilerleme">
        <div className="ilerleme-satiri">
          <span className="etiket">{sonuc.seviye_atladi ? "Yeni seviye · " : ""}{sonuc.seviye.ad}</span>
          <span className="etiket rakam">{sayi(xp)} XP</span>
        </div>
        <div className="ilerleme-cubugu" style={{ ["--oran" as string]: ilerleme }}><i /></div>
      </div>

      {sonuc.yeni_kilitler.length > 0 && (
        <p className="yeni-kilit"><Simge ad="kilitAcik" boyut={16} /> Kilit açıldı: {sonuc.yeni_kilitler.join(", ")}</p>
      )}
      <p className="basari-sonraki">{sonraki.ana}</p>

      <div className="basari-dugmeleri">
        <button className="dugme birincil genis" onClick={onKapat}>Tamam</button>
        <button className="dugme genis" onClick={onTekrar}>Başka bir kod okut</button>
      </div>
    </div>
  );
}
