import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Simge, { odulIkonu } from "../tasarim/Simge";
import { KULLAN_MESAJI, odul, OdulHatasi, tarih, tarihSaat, titret, type GosterSonucu } from "../veri/odul";
import { useGezinme } from "../veri/gezinme";

/**
 * İşletmeye gösterilen ödül ekranı.
 *
 * EKRAN GÖRÜNTÜSÜNE KARŞI
 * ───────────────────────
 * Durağan bir ekran kopyalanabilir. Bu ekranda üç şey CANLI:
 *   - saniyesi akan saat (sunucu saatine göre düzeltilmiş)
 *   - her 30 saniyede sunucudan gelen yeni 4 haneli doğrulama kodu
 *   - kesintisiz kayan ince bir şerit
 * Görüntü birkaç saniyede eskir. Asıl koruma ise ikinci adım: işletme
 * çalışanı kendi PIN'ini girer, ödül SUNUCUDA "kullanıldı" olur ve aynı
 * ödül bir daha geçmez.
 *
 * İKİ KİŞİ, İKİ SORU
 * ──────────────────
 * Öğrenci: "Şimdi ne yapacağım?" → ekranın üstünde tek cümle.
 * Çalışan: "Bu gerçekten geçerli mi?" → büyük GEÇERLİ, akan saat, dönen kod,
 * "daha önce kullanılmadı". Onaydan sonra iki tarafın da göreceği net bir
 * "Kullanıldı" anı; belirsiz bir yeniden yükleme değil.
 *
 * "Kaydırarak onayla" yok: ödülü kullanan öğrenci değil, PIN'i bilen çalışan.
 * Yanlışlıkla kullanım PIN olmadan zaten mümkün değil.
 */
export default function OdulGoster({ kazanimId, onKapat, onDegisti }: {
  kazanimId: string;
  onKapat: () => void;
  onDegisti: () => void;
}) {
  const [veri, setVeri] = useState<GosterSonucu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(Date.now());
  const [pinAcik, setPinAcik] = useState(false);
  const [yeniKullanildi, setYeniKullanildi] = useState(false);
  const { git } = useGezinme();
  const farkRef = useRef(0);   // sunucu saati - cihaz saati

  const yukle = useCallback(async () => {
    try {
      const v = await odul.goster(kazanimId);
      if (v.durum === "bulunamadi") { setHata("Ödül bulunamadı."); return; }
      farkRef.current = new Date(v.sunucu_zamani).getTime() - Date.now();
      setVeri(v);
    } catch (h) {
      setHata(h instanceof OdulHatasi ? h.message : "Ödül yüklenemedi.");
    }
  }, [kazanimId]);

  useEffect(() => { yukle(); }, [yukle]);

  // Saat her saniye; doğrulama kodu pencere bitince yenilenir.
  useEffect(() => {
    const z = setInterval(() => setSimdi(Date.now() + farkRef.current), 250);
    return () => clearInterval(z);
  }, []);
  useEffect(() => {
    if (!veri || veri.durum !== "aktif") return;
    const kalan = new Date(veri.pencere_bitis).getTime() - (Date.now() + farkRef.current);
    const z = setTimeout(yukle, Math.max(500, kalan + 300));
    return () => clearTimeout(z);
  }, [veri, yukle]);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape" && !pinAcik) onKapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [onKapat, pinAcik]);

  const pencereKalan = veri ? Math.max(0, (new Date(veri.pencere_bitis).getTime() - simdi) / 30000) : 0;
  const saat = new Date(simdi).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

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
        <p className="odul-yonerge">Bu ekranı kasadaki çalışana göster.</p>
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
              <div className="odul-canli-kod" aria-label={`Doğrulama kodu ${veri.dogrulama}`}>
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <circle cx="18" cy="18" r="16" className="halka-zemin" />
                  <circle cx="18" cy="18" r="16" className="halka-dolu" style={{ strokeDashoffset: 100.5 * (1 - pencereKalan) }} />
                </svg>
                <span className="rakam">{veri.dogrulama}</span>
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
          <button className="dugme birincil genis" onClick={() => setPinAcik(true)}>
            <Simge ad="kalkan" boyut={18} /> İşletme onayı
          </button>
          <p className="soluk odul-not">Onay düğmesine işletme çalışanı dokunur ve kendi PIN'ini girer. Onaydan sonra ödül kullanılmış sayılır.</p>
        </div>
      )}

      {pinAcik && veri && (
        <PinPaneli
          kazanimId={veri.id}
          onKapat={() => setPinAcik(false)}
          onKullanildi={(yeni) => { setPinAcik(false); setYeniKullanildi(yeni); yukle(); onDegisti(); }}
        />
      )}
    </div>,
    document.body,
  );
}

/** Büyük tuşlu PIN paneli: çalışan telefonu eline alıp hızlıca girer. */
function PinPaneli({ kazanimId, onKapat, onKullanildi }: {
  kazanimId: string;
  onKapat: () => void;
  /** `yeni`: bu onayla kullanıldı (daha önce kullanılmış değil). */
  onKullanildi: (yeni: boolean) => void;
}) {
  const [pin, setPin] = useState("");
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function onayla() {
    if (pin.length < 4 || bekliyor) return;
    setBekliyor(true);
    setMesaj(null);
    try {
      const s = await odul.kullan(kazanimId, pin);
      if (s.durum === "kullanildi") {
        titret([20, 50, 20]);
        onKullanildi(true);
        return;
      }
      titret(80);
      setPin("");
      setMesaj(s.durum === "pin_hatali" && typeof s.kalan_deneme === "number"
        ? `PIN hatalı. ${s.kalan_deneme} deneme hakkı kaldı.`
        : KULLAN_MESAJI[s.durum]);
      if (s.durum === "zaten_kullanildi") onKullanildi(false);
    } catch (h) {
      setMesaj(h instanceof OdulHatasi ? h.message : "Bağlantı sorunu.");
    } finally {
      setBekliyor(false);
    }
  }

  const tus = (t: string) => { setMesaj(null); setPin((p) => (p.length < 8 ? p + t : p)); };

  return (
    <div className="pin-katman" onClick={onKapat}>
      <div className="pin-panel" role="dialog" aria-modal="true" aria-label="İşletme PIN'i" onClick={(e) => e.stopPropagation()}>
        <p className="etiket">İşletme çalışanı</p>
        <h2>PIN'i gir</h2>
        <div className="pin-noktalar" aria-label={`${pin.length} hane girildi`}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <i key={i} data-dolu={i < pin.length} />)}
        </div>
        {mesaj && <p className="bildirim" role="alert">{mesaj}</p>}
        <div className="pin-tuslar">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((t) => (
            <button key={t} onClick={() => tus(t)} className="rakam">{t}</button>
          ))}
          <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Son haneyi sil"><Simge ad="geri" boyut={22} /></button>
          <button onClick={() => tus("0")} className="rakam">0</button>
          <button className="pin-onay" onClick={onayla} disabled={pin.length < 4 || bekliyor} aria-label="Onayla">
            <Simge ad="tik" boyut={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
