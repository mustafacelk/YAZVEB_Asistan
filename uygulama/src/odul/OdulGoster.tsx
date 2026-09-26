import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Simge, { odulIkonu } from "../tasarim/Simge";
import { odul, OdulHatasi, tarih, tarihSaat, titret, type GosterSonucu } from "../veri/odul";
import { useGezinme } from "../veri/gezinme";
import { siteAdresi } from "../veri/api";

// QR çizici yalnızca bu ekran açılınca yüklenir; açılış paketine binmez.
const QrSvg = lazy(() => import("./QrSvg").then((m) => ({ default: m.QrSvg })));

/** Kullanıldı mı diye sunucuya sorma aralığı. Çalışan onaylayınca ekran en geç bu kadar sonra döner. */
const SORMA_MS = 2500;

/**
 * İşletmeye gösterilen ödül ekranı.
 *
 * ONAY ÇALIŞANIN CİHAZINDA
 * ────────────────────────
 * Eskiden çalışan PIN'ini bu telefona giriyor, "Kullanıldı" yazısını yine
 * bu telefonda görüyordu. Bu ekran öğrencinin elinde çiziliyor: sunucuya
 * hiç sormayan sahte bir sayfa aynı görüntüyü verebilir, aynı ödül
 * defalarca alınabilirdi. Artık çalışan kendi telefonundaki işletme
 * sayfasıyla (/isletme) buradaki QR'yi okutup PIN'ini ORADA girer; cevap
 * doğrudan sunucudan gelir. Bu ekranın söyledikleri yalnızca öğrenci için.
 *
 * İKİ KİŞİ, İKİ SORU
 * ──────────────────
 * Öğrenci: "Şimdi ne yapacağım?" → ekranın üstünde tek cümle.
 * Çalışan: "Bu gerçekten geçerli mi?" → kendi ekranında, sunucudan.
 * Onaydan sonra bu ekran kendiliğinden net bir "Kullanıldı" anına döner.
 */
export default function OdulGoster({ kazanimId, onKapat, onDegisti }: {
  kazanimId: string;
  onKapat: () => void;
  onDegisti: () => void;
}) {
  const [veri, setVeri] = useState<GosterSonucu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(Date.now());
  const [yeniKullanildi, setYeniKullanildi] = useState(false);
  const { git } = useGezinme();
  const farkRef = useRef(0);   // sunucu saati - cihaz saati
  const oncekiDurum = useRef<GosterSonucu["durum"] | null>(null);

  const yukle = useCallback(async () => {
    try {
      const v = await odul.goster(kazanimId);
      if (v.durum === "bulunamadi") { setHata("Ödül bulunamadı."); return; }
      farkRef.current = new Date(v.sunucu_zamani).getTime() - Date.now();
      // Ekran açıkken çalışan onayladı: kutlama anı ve cüzdan tazelenir.
      if (oncekiDurum.current === "aktif" && v.durum === "kullanildi") {
        titret([20, 50, 20]);
        setYeniKullanildi(true);
        onDegisti();
      }
      oncekiDurum.current = v.durum;
      setVeri(v);
      setHata(null);
    } catch (h) {
      // Tek bir sorma turu düşerse ekranı bozma; ilk yüklemede hata göster.
      if (!oncekiDurum.current) setHata(h instanceof OdulHatasi ? h.message : "Ödül yüklenemedi.");
    }
  }, [kazanimId, onDegisti]);

  useEffect(() => { yukle(); }, [yukle]);

  // Saat her saniye akar (sunucu saatine göre).
  useEffect(() => {
    const z = setInterval(() => setSimdi(Date.now() + farkRef.current), 250);
    return () => clearInterval(z);
  }, []);

  // Ödül geçerliyken sunucuya düzenli sorulur: çalışan onaylayınca ekran döner.
  const aktif = veri?.durum === "aktif";
  useEffect(() => {
    if (!aktif) return;
    const z = setInterval(() => { if (!document.hidden) yukle(); }, SORMA_MS);
    return () => clearInterval(z);
  }, [aktif, yukle]);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [onKapat]);

  const saat = new Date(simdi).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const isletmeAdresi = siteAdresi("/isletme").replace(/^https?:\/\//, "");

  return createPortal(
    <div className="odul-goster" role="dialog" aria-modal="true" aria-label="Ödülü göster">
      <div className="odul-goster-ust">
        <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        <span className="etiket">İşletmeye göster</span>
        <span className="tarayici-bosluk" />
      </div>

      {/* Izgara üç satır: üst çubuk, orta, alt. Orta satırdaki her şey tek kapta. */}
      <div className="odul-orta">
      {hata && <p className="bildirim" role="alert">{hata}</p>}
      {!veri && !hata && <div className="dogrulama-halkasi" aria-label="Yükleniyor" />}

      {veri?.durum === "aktif" && (
        <p className="odul-yonerge">Kasadaki çalışan bu QR'yi kendi telefonuyla okutsun.</p>
      )}

      {yeniKullanildi && veri?.durum === "kullanildi" ? (
        <div className="tarayici-merkez basari odul-kullanildi" role="status" aria-live="assertive">
          <div className="basari-isareti" aria-hidden="true"><Simge ad="tik" boyut={30} /></div>
          <p className="basari-baslik">Ödül kullanıldı</p>
          <p className="etiket">{veri.sponsor} · {veri.baslik}</p>
          {veri.kullanildi && <p className="rakam soluk">{tarihSaat(veri.kullanildi)}</p>}
          <p className="basari-sonraki">Keyfini çıkar. Yeni ödüller için etkinliklere katılmaya devam et.</p>
          <div className="basari-dugmeleri">
            <button className="dugme birincil genis" onClick={onKapat}>Tamam</button>
            <button className="dugme genis" onClick={() => { onKapat(); git("etkinlik"); }}>Sıradaki etkinliklere bak</button>
          </div>
        </div>
      ) : veri && (
        <div className="odul-kart" data-durum={veri.durum}>
          <div className="odul-kart-canli" aria-hidden="true" />
          <p className="odul-kart-marka">
            <img src="/logo-128.webp" alt="" width={28} height={28} /> YAZVEB REWARD
          </p>
          <div className="odul-kart-ikon"><Simge ad={odulIkonu(veri.ikon)} boyut={56} /></div>
          <h2 className="odul-kart-baslik">{veri.baslik}</h2>
          <p className="odul-kart-sponsor">{veri.sponsor}</p>

          <dl className="odul-kart-bilgi">
            <div><dt>Kod</dt><dd className="rakam odul-kodu">{veri.kod}</dd></div>
            <div>
              <dt>Durum</dt>
              <dd className={"durum-" + veri.durum}>
                {veri.durum === "aktif" ? "GEÇERLİ" : veri.durum === "kullanildi" ? "KULLANILDI"
                  : veri.durum === "suresi_doldu" ? "SÜRESİ DOLDU" : "İPTAL"}
              </dd>
            </div>
          </dl>
          {veri.durum === "aktif" && <p className="odul-kart-kucuk">Bu ödül daha önce kullanılmadı.</p>}

          {veri.durum === "aktif" ? (
            <div className="odul-canli">
              <div className="odul-isletme-qr" aria-label={`İşletme için QR: ${veri.kod}`}>
                <Suspense fallback={<div className="dogrulama-halkasi" aria-hidden="true" />}>
                  <QrSvg icerik={`YAZVEB:K:${veri.kod}`} boyut={132} />
                </Suspense>
              </div>
              <div>
                <p className="odul-canli-saat rakam" aria-live="off">{saat}</p>
                <p className="odul-kart-kucuk">Son kullanım {tarih(veri.son_kullanma)}</p>
              </div>
            </div>
          ) : veri.durum === "kullanildi" && veri.kullanildi ? (
            <p className="odul-kart-kucuk">Kullanım: {tarihSaat(veri.kullanildi)}</p>
          ) : null}
        </div>
      )}
      </div>

      {veri?.durum === "aktif" && !yeniKullanildi && (
        <div className="tarayici-alt">
          {veri.adres && <p className="odul-yer"><Simge ad="konum" boyut={14} /> {veri.adres}</p>}
          <p className="soluk odul-not">
            Çalışan <b className="rakam">{isletmeAdresi}</b> sayfasında bu QR'yi okutur ve PIN'ini
            kendi telefonuna girer. Onaylanınca bu ekran kendiliğinden "Kullanıldı" olur.
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}
