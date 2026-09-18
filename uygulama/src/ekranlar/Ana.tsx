import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase, type Etkinlik } from "../veri/supabase";
import { useOturum } from "../veri/oturum";
import { ODUL_DEGISTI, useGezinme } from "../veri/gezinme";
import { selamAdi, suruyorMu } from "../veri/bicim";
import {
  odul,
  sayi,
  seviyeIlerlemesi,
  sonKullanimEtiketi,
  sonrakiAdim,
  type EtkinlikOzeti,
  type KazanimOzeti,
  type Profil,
} from "../veri/odul";
import Simge from "../tasarim/Simge";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/** Rehber kartı bir kez kapatılınca bir daha kendiliğinden açılmaz. */
const REHBER_ANAHTARI = "yazveb:rehber-kapandi";
function rehberKapandiMi() {
  try { return localStorage.getItem(REHBER_ANAHTARI) === "1"; } catch { return false; }
}

/**
 * Ana ekran — "Burada benim için ne var?"
 *
 * Bir bakışta üç şey, fazlası değil:
 *   1. Sıradaki etkinlik     nereye, ne zaman, gidersem ne kazanırım
 *   2. İlerlemen            puanım ne işe yarıyor, bir sonraki adım ne
 *   3. Bekleyen ödüller      yalnızca varsa
 *
 * Asistan bir arama çubuğu kadar yakında; tarama gezinme çubuğunun
 * ortasında. Takvimin tamamı, bütün sponsorlar, sıralama burada YOK:
 * her biri kendi ekranında. Ana ekran bir kontrol paneli değil.
 */
export default function Ana() {
  const { profil } = useOturum();
  const { git, tara } = useGezinme();
  const [ilerleme, setIlerleme] = useState<Profil | null>(null);
  const [etkinlik, setEtkinlik] = useState<Etkinlik | null | undefined>(undefined);
  const [ozet, setOzet] = useState<EtkinlikOzeti | null>(null);
  const [cuzdan, setCuzdan] = useState<KazanimOzeti[]>([]);
  const [rehber, setRehber] = useState(() => !rehberKapandiMi());
  const [soru, setSoru] = useState("");

  const yukle = useCallback(async () => {
    const [p, liste, oz, cz] = await Promise.all([
      odul.profil().catch(() => null),
      supabase
        .from("etkinlikler")
        .select("*")
        // Birkaç saat önce başlamış olan da gelsin: "şu an sürüyor" olabilir.
        .gte("baslangic", new Date(Date.now() - 12 * 3_600_000).toISOString())
        .order("baslangic", { ascending: true })
        .limit(6),
      odul.etkinlikOzeti(),
      odul.cuzdan().catch((): KazanimOzeti[] => []),
    ]);
    setIlerleme(p);
    setCuzdan(cz);
    const simdi = Date.now();
    const adaylar = (liste.data as Etkinlik[] | null) ?? [];
    const secilen = adaylar.find((e) => new Date(e.baslangic).getTime() >= simdi || suruyorMu(e, simdi)) ?? null;
    setEtkinlik(secilen);
    setOzet(secilen ? oz.find((o) => o.etkinlik_id === secilen.id) ?? null : null);
  }, []);

  useEffect(() => {
    yukle();
    window.addEventListener(ODUL_DEGISTI, yukle);
    return () => window.removeEventListener(ODUL_DEGISTI, yukle);
  }, [yukle]);

  const ad = selamAdi(profil?.ad_soyad, profil?.kullanici_adi);
  const aktif = cuzdan.filter((z) => z.durum === "aktif");

  return (
    <div className="sayfa ana">
      <div className="sutun">
        <header className="ana-basi gir">
          <img src="/logo-128.webp" alt="" width={28} height={28} />
          <span className="etiket">YAZVEB</span>
          {!rehber && (
            <button className="metin-dugme ana-rehber-ac" onClick={() => setRehber(true)}>Nasıl çalışır?</button>
          )}
        </header>

        <h1 className="ana-selam gir" style={kademe(1)}>{ad ? `Merhaba, ${ad}.` : "Merhaba."}</h1>

        {rehber && (
          <Rehber onKapat={() => {
            setRehber(false);
            try { localStorage.setItem(REHBER_ANAHTARI, "1"); } catch { /* gizli sekme */ }
          }} />
        )}

        {/* Gerçek bir yazı alanı: yazıp gönderince Asistan açılır ve soru
            doğrudan sorulur. Boşken sağdaki mikrofon Asistan'ı açar. */}
        <form
          className="asistana-sor gir"
          style={kademe(2)}
          onSubmit={(e) => {
            e.preventDefault();
            git("asistan", { soru: soru.trim() || undefined });
          }}
        >
          <Simge ad="asistan" boyut={18} />
          <input
            value={soru}
            onChange={(e) => setSoru(e.target.value)}
            placeholder="Asistana sor: etkinlik, üyelik, topluluk"
            aria-label="Asistana soru"
            enterKeyHint="send"
            maxLength={500}
          />
          <button type="submit" className="gonder-dugme" aria-label={soru.trim() ? "Gönder" : "Asistanı aç"}>
            <Simge ad={soru.trim() ? "gonder" : "mikrofon"} boyut={16} />
          </button>
        </form>

        <section className="ana-bolum gir" style={kademe(3)} aria-labelledby="ana-etkinlik">
          <div className="bolum-basi yakin">
            <span className="etiket" id="ana-etkinlik">
              {etkinlik && suruyorMu(etkinlik)
                ? <span className="canli-etiket"><i aria-hidden="true" />Şu an</span>
                : "Sıradaki etkinlik"}
            </span>
            <button className="metin-dugme baglanti" onClick={() => git("etkinlik")}>
              Tüm takvim <Simge ad="ileri" boyut={14} />
            </button>
          </div>
          {etkinlik === undefined ? (
            <div className="yigin" aria-label="Yükleniyor">
              <div className="iskelet" style={{ width: "70%" }} />
              <div className="iskelet" style={{ width: "40%" }} />
            </div>
          ) : etkinlik === null ? (
            <p className="ana-bos">
              Planlanmış etkinlik yok. Yeni bir etkinlik eklendiğinde ilk burada görürsün.
            </p>
          ) : (
            <SiradakiEtkinlik etkinlik={etkinlik} ozet={ozet} onAc={() => git("etkinlik")} onTara={tara} />
          )}
        </section>

        {ilerleme && <Ilerleme profil={ilerleme} onAc={() => git("odul")} />}

        {aktif.length > 0 && (
          <section className="ana-bolum gir" style={kademe(5)}>
            <button className="ana-satir" onClick={() => git("odul", { bolum: "oduller" })}>
              <span className="ana-satir-ikon"><Simge ad="hediye" boyut={20} /></span>
              <span className="ana-satir-govde">
                <b>{aktif.length === 1 ? `${aktif[0].sponsor}: ${aktif[0].baslik}` : `${aktif.length} ödülün kullanılmayı bekliyor`}</b>
                <span className="soluk">{enYakinBitis(aktif) ?? "İşletmede göstererek kullanabilirsin."}</span>
              </span>
              <Simge ad="ileri" boyut={16} />
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * "YAZVEB nasıl çalışır?" — ilk açılışta, ana ekranın içinde.
 *
 * Kaydırmalı çok sayfalı tanıtım değil: kullanıcıyı bekletmez, atlanmaya
 * mahkûm değildir. Döngünün dört adımı tek bakışta; kapatılınca bir daha
 * çıkmaz, başlıktaki "Nasıl çalışır?" ile geri açılır.
 */
function Rehber({ onKapat }: { onKapat: () => void }) {
  return (
    <section className="rehber gir" style={kademe(2)} aria-labelledby="rehber-baslik">
      <div className="rehber-basi">
        <h2 id="rehber-baslik">YAZVEB nasıl çalışır?</h2>
        <button className="ikon-dugme kucuk" onClick={onKapat} aria-label="Rehberi kapat"><Simge ad="kapat" boyut={16} /></button>
      </div>
      <ol className="rehber-adimlari">
        <li><b>Etkinliğe katıl</b><span>Takvimde "+XP" yazan etkinlikler puan verir.</span></li>
        <li><b>QR'yi okut</b><span>"QR tara" düğmesiyle. Kamera istemezsen kısa kodu yaz.</span></li>
        <li><b>Puan topla</b><span>Seviyen yükselir, sponsor kilitleri açılır.</span></li>
        <li><b>Ödülünü kullan</b><span>İşletmedeki QR'yi okut, çıkan ödülü kasada göster.</span></li>
      </ol>
      <p className="rehber-not soluk">Takıldığın her şeyi aşağıdaki asistana sorabilirsin.</p>
      <button className="dugme birincil" onClick={onKapat}>Anladım</button>
    </section>
  );
}

function SiradakiEtkinlik({ etkinlik, ozet, onAc, onTara }: {
  etkinlik: Etkinlik;
  ozet: EtkinlikOzeti | null;
  onAc: () => void;
  onTara: () => void;
}) {
  const t = new Date(etkinlik.baslangic);
  const suruyor = suruyorMu(etkinlik);
  const bugun = t.toDateString() === new Date().toDateString();
  const puan = ozet?.puan ?? 0;

  return (
    <article className="ana-etkinlik" data-suruyor={suruyor}>
      <button className="ana-etkinlik-govde" onClick={onAc}>
        <span className="etkinlik-tarih" aria-hidden="true">
          <b className="rakam">{t.toLocaleDateString("tr-TR", { day: "2-digit" })}</b>
          <span className="etiket">{t.toLocaleDateString("tr-TR", { month: "short" })}</span>
        </span>
        <span className="ana-etkinlik-bilgi">
          <b>{etkinlik.baslik}</b>
          <span className="etkinlik-meta">
            <span className="rakam">
              {suruyor ? "Başladı" : bugun ? "Bugün" : t.toLocaleDateString("tr-TR", { weekday: "long" })} ·{" "}
              {t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {etkinlik.yer && <span><Simge ad="konum" boyut={14} />{etkinlik.yer}</span>}
          </span>
        </span>
        {ozet?.katildi ? (
          <span className="xp-cipi katildi"><Simge ad="tik" boyut={14} /> Katıldın</span>
        ) : puan > 0 ? (
          <span className="xp-cipi rakam">+{sayi(puan)} XP</span>
        ) : null}
      </button>
      {suruyor && puan > 0 && !ozet?.katildi && (
        // Etkinliğin içindeyken tek eksik adım: QR.
        <button className="dugme birincil genis ana-tara" onClick={onTara}>
          <Simge ad="tara" boyut={18} /> QR'yi okut, +{sayi(puan)} XP kazan
        </button>
      )}
    </article>
  );
}

function Ilerleme({ profil, onAc }: { profil: Profil; onAc: () => void }) {
  const adim = sonrakiAdim(profil);
  const { seviye, xp } = profil;
  return (
    <section className="ana-bolum gir" style={kademe(4)} aria-labelledby="ana-ilerleme">
      <div className="bolum-basi yakin">
        <span className="etiket" id="ana-ilerleme">İlerlemen</span>
      </div>
      <button className="ana-adim" onClick={onAc}>
        <span className="ana-xp-satiri">
          <span className="ana-xp rakam">{sayi(xp)}<small>XP</small></span>
          <span className="rozet">{seviye.ad}</span>
        </span>
        <span className="ana-adim-metin">{adim.ana}</span>
        {adim.ikincil && <span className="soluk">{adim.ikincil}</span>}
        <span
          className="ilerleme-cubugu"
          style={{ ["--oran" as string]: seviyeIlerlemesi(xp, seviye) }}
          role="progressbar"
          aria-label={seviye.sonraki ? `${seviye.sonraki.ad} seviyesine ilerleme` : "En üst seviye"}
          aria-valuemin={seviye.esik}
          aria-valuemax={seviye.sonraki?.esik ?? xp}
          aria-valuenow={xp}
        ><i /></span>
      </button>
    </section>
  );
}

/** Birden çok aktif ödülde, bitişi en yakın olanın gerçek süresi. */
function enYakinBitis(aktif: KazanimOzeti[]) {
  const sirali = [...aktif].sort((a, b) => a.son_kullanma.localeCompare(b.son_kullanma));
  const etiket = sonKullanimEtiketi(sirali[0].son_kullanma);
  if (!etiket) return null;
  return aktif.length === 1 ? etiket : `En yakını · ${etiket.toLocaleLowerCase("tr")}`;
}
