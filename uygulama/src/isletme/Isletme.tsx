import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Simge, { odulIkonu } from "../tasarim/Simge";
import { ISLETME_MESAJI, odul, OdulHatasi, tarih, tarihSaat, titret, type IsletmeSonucu } from "../veri/odul";
import { cozucuKur, odulKoduCoz } from "../odul/qr";
import { useKip } from "../veri/kip";
import Kure from "../canli/Kure";
import type { Durum } from "../canli/sahne";
import Ag from "../tasarim/Ag";
import AlintiKarti from "../tasarim/AlintiKarti";

/**
 * Bugün bu cihazda onaylananlar — kasada gün sonu sayımı için. Yalnızca ödül
 * kodu, adı ve saat; öğrenciye ait hiçbir bilgi yok. Ertesi gün kendiliğinden
 * sıfırlanır; cihazdan çıkmaz.
 */
type BugunKaydi = { kod: string; baslik: string; saat: string };
const BUGUN_ANAHTARI = "yazveb:isletme-bugun";
const bugunTarihi = () => new Date().toLocaleDateString("sv-SE");   // YYYY-AA-GG, yerel saat

function bugunOku(): BugunKaydi[] {
  try {
    const v = JSON.parse(localStorage.getItem(BUGUN_ANAHTARI) ?? "null");
    return v?.tarih === bugunTarihi() && Array.isArray(v.liste) ? v.liste : [];
  } catch {
    return [];
  }
}
function bugunYaz(liste: BugunKaydi[]) {
  try { localStorage.setItem(BUGUN_ANAHTARI, JSON.stringify({ tarih: bugunTarihi(), liste })); } catch { /* gizli sekme */ }
}

/**
 * İşletme sayfası — ÇALIŞANIN telefonunda açılır (<site>/isletme).
 *
 * NEDEN AYRI BİR SAYFA
 * ────────────────────
 * Ödülün geçerli olup olmadığını öğrencinin telefonundaki ekrandan okumak,
 * o ekranı çizen cihaza güvenmek demek. Sunucuya hiç sormayan sahte bir
 * sayfa "GEÇERLİ" de yazabilir, "KULLANILDI" da. Burada karar çalışanın
 * kendi cihazında, doğrudan sunucudan gelir; öğrencinin ekranında ne
 * yazdığının önemi kalmaz.
 *
 * Giriş gerekmez: çalışanın YAZVEB hesabı yok. Kimliği işletme PIN'i
 * kanıtlar; kod ya da PIN yanlışsa sunucu hangisinin yanlış olduğunu
 * söylemez ve denemeleri sınırlar (bkz. veritabani/06_isletme.sql).
 *
 * PIN sayfa açık kaldıkça hatırlanır (yalnızca bellekte, hiçbir yere
 * yazılmaz): yoğun kasada her ödülde yeniden girilmez.
 */
export default function Isletme() {
  const { sec } = useKip();
  const [bugun, setBugun] = useState<BugunKaydi[]>(bugunOku);
  const [kod, setKod] = useState("");
  const [pin, setPin] = useState("");
  const [sonuc, setSonuc] = useState<IsletmeSonucu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [kamera, setKamera] = useState(false);
  const kodRef = useRef<HTMLInputElement | null>(null);
  const pinRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const eski = document.title;
    document.title = "YAZVEB · İşletme doğrulama";
    return () => { document.title = eski; };   // üye girişine dönünce başlık da dönsün
  }, []);

  const kodTemiz = odulKoduCoz(kod);

  const sor = useCallback(async (kullan: boolean) => {
    if (!kodTemiz || !/^[0-9]{4,8}$/.test(pin) || bekliyor) return;
    setBekliyor(true);
    setHata(null);
    try {
      const s = await odul.isletmeDogrula(kodTemiz, pin, kullan);
      if (s.durum === "gecersiz" || s.durum === "sinir") {
        titret(80);
        setSonuc(null);
        setHata(ISLETME_MESAJI[s.durum]);
        if (s.durum === "gecersiz") setPin("");
        return;
      }
      titret(s.durum === "kullanildi" ? [20, 50, 20] : s.durum === "gecerli" ? 12 : 80);
      setSonuc(s);
      if (s.durum === "kullanildi") {
        const yeni = [{
          kod: s.kod ?? kodTemiz,
          baslik: s.baslik ?? "Ödül",
          saat: new Date(s.zaman ?? Date.now()).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        }, ...bugunOku()].slice(0, 200);
        bugunYaz(yeni);
        setBugun(yeni);
      }
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.");
    } finally {
      setBekliyor(false);
    }
  }, [kodTemiz, pin, bekliyor]);

  function kontrolEt(e: FormEvent) {
    e.preventDefault();
    if (!kodTemiz) { setHata("Kod 7 karakter: öğrencinin ekranındaki ABCD-EFG biçimindeki kod."); kodRef.current?.focus(); return; }
    if (!/^[0-9]{4,8}$/.test(pin)) { setHata("İşletme PIN'ini girin (rakamlar)."); pinRef.current?.focus(); return; }
    sor(false);
  }

  function yeniOdul() {
    setKod("");
    setSonuc(null);
    setHata(null);
    // Form sonuç kartının yerine bir sonraki çizimde gelir; odak ondan sonra.
    setTimeout(() => kodRef.current?.focus(), 0);
  }

  // Kameradan okunduğu anda PIN zaten girilmişse (önceki ödülden hatırlanıyor)
  // kontrol kendiliğinden başlar. YALNIZCA o an: PIN yazılırken kendiliğinden
  // gönderilseydi 4. hanede eksik PIN denenir, deneme hakkı boşa giderdi.
  const pinDegeri = useRef(pin);
  pinDegeri.current = pin;
  const otomatikRef = useRef<string | null>(null);

  const okundu = useCallback((metin: string) => {
    const k = odulKoduCoz(metin);
    if (!k) return false;
    setKamera(false);
    setKod(k);
    setSonuc(null);
    setHata(null);
    titret(12);
    if (/^[0-9]{4,8}$/.test(pinDegeri.current)) otomatikRef.current = k;
    else setTimeout(() => pinRef.current?.focus(), 0);
    return true;
  }, []);

  useEffect(() => {
    if (otomatikRef.current && otomatikRef.current === kodTemiz && !bekliyor) {
      otomatikRef.current = null;
      sor(false);
    }
  }, [kodTemiz, bekliyor, sor]);

  const karar = sonuc
    ? sonuc.durum === "gecerli" || sonuc.durum === "kullanildi" ? "ver" : "verme"
    : null;

  // Küre ekranın nabzı: bekliyorken düşünür, onayda parlar, redde içe çekilir.
  const kureDurumu: Durum = bekliyor ? "dusunuyor"
    : hata || karar === "verme" ? "hata"
    : karar === "ver" ? "konusuyor"
    : kamera ? "dinliyor" : "bosta";
  const adim = sonuc ? 3 : kodTemiz ? 2 : 1;

  return (
    <div className="isletme">
      <div className="isletme-arka" aria-hidden="true">
        <Ag className="isletme-ag" />
      </div>

      <div className="isletme-kolon">
        <header className="isletme-kahraman">
          <div className="isletme-kure gir" aria-hidden="true">
            <Kure durum={kureDurumu} olcek={0.4} />
          </div>
          <span className="isletme-marka gir" style={kademe(1)}>
            <img src="/logo-128.webp" alt="YAZVEB" width={26} height={26} />
            <span className="etiket">YAZVEB · İş ortağı</span>
          </span>
          <h1 className="gir" style={kademe(2)}>Ödül onayı</h1>
          <p className="gir" style={kademe(3)}>
            Selçuk Üniversitesi Yapay Zekâ ve Veri Bilimi Topluluğu'nun öğrencilerini ağırladığınız için teşekkürler.
          </p>
          {bugun.length > 0 && (
            <p className="isletme-sayac gir" style={kademe(4)}>
              Bugün <b className="rakam">{bugun.length}</b> öğrenciyi ağırladınız.
            </p>
          )}
        </header>

        <AlintiKarti set="isletme" className="gir" style={kademe(4)} />

        <ol className="isletme-adimlar gir" style={kademe(5)} aria-label="Onay adımları">
          {["QR okut", "PIN gir", "Onayla"].map((a, i) => (
            <li key={a} data-durum={i + 1 < adim ? "bitti" : i + 1 === adim ? "simdi" : "sonra"}>
              <span className="rakam">{i + 1 < adim ? "✓" : i + 1}</span>{a}
            </li>
          ))}
        </ol>

        {sonuc ? (
          <SonucKarti sonuc={sonuc} karar={karar!} bekliyor={bekliyor}
            onOnayla={() => sor(true)} onYeni={yeniOdul} />
        ) : (
          <form className="isletme-form yigin gir" style={kademe(6)} onSubmit={kontrolEt}>
            {kamera ? (
              <KodKamerasi onOkundu={okundu} onKapat={() => setKamera(false)} />
            ) : (
              <button type="button" className="dugme birincil genis isletme-tara" onClick={() => { setHata(null); setKamera(true); }}>
                <Simge ad="tara" boyut={20} /> Öğrencinin QR'sini okut
              </button>
            )}

            <div className="isletme-ayrac" aria-hidden="true"><span>ya da kodu yaz</span></div>

            <label className="alan">
              <span className="etiket">Ödül kodu</span>
              <input
                ref={kodRef}
                className="kod-alani"
                value={kod}
                onChange={(e) => { setKod(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8)); setHata(null); }}
                onBlur={() => { if (kodTemiz) setKod(kodTemiz); }}
                placeholder="ABCD-EFG"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Ödül kodu"
              />
            </label>

            <label className="alan">
              <span className="etiket">İşletme PIN'i</span>
              <input
                ref={pinRef}
                className="girdi rakam isletme-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8)); setHata(null); }}
                placeholder="••••••"
              />
            </label>

            {hata && <p className="bildirim" role="alert">{hata}</p>}

            <button type="submit" className="dugme birincil genis" disabled={bekliyor || !kod || !pin}>
              {bekliyor ? "Kontrol ediliyor" : "Kontrol et"}
            </button>
          </form>
        )}

        {bugun.length > 0 && (
          <details className="isletme-bugun">
            <summary>
              <span className="etiket">Bugün bu cihazda</span>
              <b className="rakam">{bugun.length} onay</b>
            </summary>
            <ul>
              {bugun.map((k, i) => (
                <li key={k.kod + i}><span className="rakam">{k.saat}</span><span>{k.baslik}</span><span className="rakam soluk">{k.kod}</span></li>
              ))}
            </ul>
          </details>
        )}

        <footer className="isletme-dip">
          <p>PIN'i YAZVEB yönetimi verir; öğrenciyle paylaşmayın, öğrencinin telefonuna girmeyin. Bu sayfayı yer imlerine ya da ana ekrana ekleyebilirsiniz.</p>
          <p>
            YAZVEB üyesi misiniz?{" "}
            <button className="metin-dugme baglanti satir-ici" onClick={() => {
              sec(null);
              // /isletme adresinden gelindiyse uygulamanın girişine geç.
              if (/^\/isletme/.test(location.pathname)) location.assign("/");
            }}>Üye girişine dön</button>
          </p>
        </footer>
      </div>
    </div>
  );
}

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

function SonucKarti({ sonuc, karar, bekliyor, onOnayla, onYeni }: {
  sonuc: IsletmeSonucu;
  karar: "ver" | "verme";
  bekliyor: boolean;
  onOnayla: () => void;
  onYeni: () => void;
}) {
  const baslik: Record<IsletmeSonucu["durum"], string> = {
    gecerli: "GEÇERLİ",
    kullanildi: "ONAYLANDI",
    zaten_kullanildi: "DAHA ÖNCE KULLANILMIŞ",
    suresi_doldu: "SÜRESİ DOLMUŞ",
    iptal: "İPTAL EDİLMİŞ",
    gecersiz: "GEÇERSİZ",
    sinir: "BEKLE",
  };
  return (
    <section className="isletme-sonuc" data-karar={karar} role="status" aria-live="assertive">
      {/* Çizilerek beliren işaret: rengi değil ŞEKLİ de karar söyler. */}
      <svg className="isletme-isaret" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="24" />
        {karar === "ver"
          ? <path d="M15 27l7 7 15-16" />
          : <path d="M18 18l16 16M34 18L18 34" />}
      </svg>
      <p className="etiket rakam">{sonuc.kod}</p>
      <p className="isletme-karar">{baslik[sonuc.durum]}</p>
      {sonuc.baslik && (
        <div className="isletme-odul">
          <Simge ad={odulIkonu(sonuc.ikon ?? "hediye")} boyut={32} />
          <div>
            <b>{sonuc.baslik}</b>
            <span>{sonuc.sponsor}</span>
          </div>
        </div>
      )}
      <p>{ISLETME_MESAJI[sonuc.durum]}</p>
      {sonuc.durum === "gecerli" && sonuc.son_kullanma && (
        <p className="soluk">Son kullanım {tarih(sonuc.son_kullanma)}</p>
      )}
      {(sonuc.durum === "zaten_kullanildi" || sonuc.durum === "kullanildi") && sonuc.zaman && (
        <p className="rakam">Kullanım: {tarihSaat(sonuc.zaman)}</p>
      )}
      <div className="basari-dugmeleri">
        {sonuc.durum === "gecerli" && (
          <button className="dugme birincil genis" onClick={onOnayla} disabled={bekliyor}>
            <Simge ad="tik" boyut={18} /> {bekliyor ? "Onaylanıyor" : "Onayla: kullanıldı"}
          </button>
        )}
        <button className={"dugme genis" + (sonuc.durum === "gecerli" ? "" : " birincil")} onClick={onYeni}>
          {sonuc.durum === "gecerli" ? "Vazgeç" : "Yeni ödül"}
        </button>
      </div>
    </section>
  );
}

/** Çalışanın kamerası: yalnızca ödül QR'sini (YAZVEB:K:…) tanır. Görüntü cihazdan çıkmaz. */
function KodKamerasi({ onOkundu, onKapat }: { onOkundu: (metin: string) => boolean; onKapat: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [durum, setDurum] = useState<"aciliyor" | "acik" | "yok">("aciliyor");
  const [uyari, setUyari] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    let akis: MediaStream | null = null;
    let kare = 0;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setDurum("yok"); return; }
      try {
        akis = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (iptal) { akis.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = akis;
        await video.play().catch(() => {});
        setDurum("acik");
        const coz = await cozucuKur();
        let son = 0;
        const dongu = async (an: number) => {
          if (iptal) return;
          kare = requestAnimationFrame(dongu);
          if (an - son < 120) return;
          son = an;
          let metin: string | null = null;
          try { metin = await coz(video); } catch { /* tek kare */ }
          if (!metin || iptal) return;
          if (!onOkundu(metin)) setUyari("Bu bir YAZVEB ödül QR'si değil. Öğrenciden 'Ödülü göster' ekranını açmasını isteyin.");
        };
        kare = requestAnimationFrame(dongu);
      } catch {
        if (!iptal) setDurum("yok");
      }
    })();
    return () => {
      iptal = true;
      cancelAnimationFrame(kare);
      akis?.getTracks().forEach((t) => t.stop());   // kamera ışığı sönsün
    };
  }, [onOkundu]);

  useEffect(() => {
    if (!uyari) return;
    const z = setTimeout(() => setUyari(null), 2500);
    return () => clearTimeout(z);
  }, [uyari]);

  if (durum === "yok") {
    return (
      <p className="bildirim" role="alert">
        Kamera açılamadı. Kodu aşağıya yazabilirsiniz; kamerayı kullanmak için tarayıcıya kamera izni verin.
      </p>
    );
  }
  return (
    <div className="yigin">
      <div className="isletme-kamera">
        <video ref={videoRef} playsInline muted />
        <div className="tarama-cercevesi" data-durum={durum} aria-hidden="true"><i /><i /><i /><i /></div>
      </div>
      {uyari && <p className="bildirim" role="status">{uyari}</p>}
      <button type="button" className="dugme genis" onClick={onKapat}>Kamerayı kapat</button>
    </div>
  );
}
