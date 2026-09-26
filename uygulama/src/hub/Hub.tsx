import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Simge from "../tasarim/Simge";
import { odul, OdulHatasi, sayi, tarihSaat, type Sponsor } from "../veri/odul";
import { odulDegisti } from "../veri/gezinme";
import { SponsorDetay } from "../odul/SponsorKarti";
import Tarayici from "../odul/Tarayici";
import { HubSahnesi, type CarsiDukkani, type Secim } from "./sahne";
import { hub, type Avatar, type Bina, type Gelenler, type HubProfil, type KatalogEsyasi, type KiyafetSlotu, type OdaEsyasi, type Oyuncu } from "./veri";
import { HEDIYELER, hediyeEmoji, NADIRLIK_ADI, ODA_BOYU, RENK, SAC_ADI, SAC_RENK, SLOT_ADI, TEN, YUZ_ADI } from "./katalog";
import "./hub.css";

type Gorunum = { tur: "bina" } | { tur: "oda"; oyuncu: Oyuncu } | { tur: "carsi" };
type Panel = null | "karakter" | "duzen" | "magaza" | "gorevler" | "cark" | "hediye" | "gelenler";

const KIYAFET_SLOTLARI: KiyafetSlotu[] = ["ust", "alt", "ayakkabi", "sapka", "gozluk", "canta"];
const ZORUNLU: KiyafetSlotu[] = ["ust", "alt", "ayakkabi"];

/**
 * YAZVEB HUB — topluluğun 3B dijital kampüsü.
 *
 * Ana uygulamanın ÖNÜNE geçmez: bir görünüm. Klasik görünüme tek dokunuşla
 * dönülür; tercih hatırlanır. Tasarım hedefi günde ~10 dakika: odana bak,
 * birini ziyaret et, hediye bırak, bir eşya yerleştir, çarkı çevir, çık.
 *
 * Ekonomi sunucuda: Coin, fiyat, envanter, çark sonucu hub_* fonksiyonları.
 * Bu ekran yalnızca gösterir ve ister.
 */
export default function Hub({ onKapat }: { onKapat: () => void }) {
  const kapRef = useRef<HTMLDivElement | null>(null);
  const sahneRef = useRef<HubSahnesi | null>(null);
  const [profil, setProfil] = useState<HubProfil | null>(null);
  const [katalog, setKatalog] = useState<KatalogEsyasi[]>([]);
  const [gorunum, setGorunum] = useState<Gorunum | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [sponsorlar, setSponsorlar] = useState<Sponsor[]>([]);
  const [detay, setDetay] = useState<Sponsor | null>(null);
  const [tarama, setTarama] = useState<Sponsor | null>(null);
  // Oda düzenleme taslağı
  const [taslakOda, setTaslakOda] = useState<OdaEsyasi[] | null>(null);
  const [arac, setArac] = useState<string | null>(null);
  const [secili, setSecili] = useState<number | null>(null);
  // Karakter taslağı
  const [taslakAvatar, setTaslakAvatar] = useState<Avatar | null>(null);

  const esya = useMemo(() => new Map(katalog.map((k) => [k.id, k])), [katalog]);
  const bildir = useCallback((m: string) => setBildirim(m), []);
  useEffect(() => {
    if (!bildirim) return;
    const z = setTimeout(() => setBildirim(null), 3200);
    return () => clearTimeout(z);
  }, [bildirim]);

  const profiliYukle = useCallback(async () => {
    const p = await hub.profil();
    setProfil(p);
    return p;
  }, []);

  // ── Açılış: sahne, profil, katalog; ilk durak kendi odan ──
  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const [p, k] = await Promise.all([hub.profil(), hub.katalog()]);
        if (iptal) return;
        setProfil(p);
        setKatalog(k);
        setGorunum({ tur: "oda", oyuncu: { ...p.ben, ben: true } });
      } catch (h) {
        if (!iptal) setHata(h instanceof OdulHatasi ? h.message : "HUB açılamadı.");
      }
    })();
    return () => { iptal = true; };
  }, []);

  // Sahne bir kez kurulur; görünüm değişince içeriği değişir.
  const secRef = useRef<(s: Secim) => void>(() => {});
  useEffect(() => {
    if (!kapRef.current) return;
    let s: HubSahnesi | null = null;
    try {
      s = new HubSahnesi(kapRef.current, (x) => secRef.current(x));
      sahneRef.current = s;
    } catch {
      setHata("Bu cihaz 3B görünümü desteklemiyor (WebGL). Klasik görünümü kullanabilirsin.");
    }
    return () => { s?.yokEt(); sahneRef.current = null; };
  }, []);

  // Görünüm değişince sahne içeriği değişir. Profil tazelenince (Coin, görev)
  // sahne yeniden kurulmaz: kamera yerinde kalsın.
  const avatarRef = useRef<Avatar | null>(null);
  avatarRef.current = profil?.ben.avatar ?? null;
  useEffect(() => {
    const s = sahneRef.current;
    if (!s || !gorunum) return;
    if (gorunum.tur === "oda") s.odaGoster(gorunum.oyuncu, false);
    if (gorunum.tur === "carsi") {
      s.carsiGoster(sponsorlar.map<CarsiDukkani>((sp) => ({
        id: sp.id, ad: sp.ad, acik: sp.kilit.acik, gerekliXp: sp.kilit.gerekli_xp,
      })), avatarRef.current);
    }
  }, [gorunum, sponsorlar]);

  const binaAc = useCallback(async () => {
    setPanel(null);
    try {
      const b: Bina = await hub.bina();
      sahneRef.current?.binaGoster(b);
      setGorunum({ tur: "bina" });
    } catch (h) { bildir(h instanceof OdulHatasi ? h.message : "Bina yüklenemedi."); }
  }, [bildir]);

  const odamAc = useCallback(() => {
    if (!profil) return;
    setPanel(null);
    setGorunum({ tur: "oda", oyuncu: { ...profil.ben, ben: true } });
  }, [profil]);

  const odaZiyaret = useCallback(async (id: string) => {
    if (profil && id === profil.ben.id) { odamAc(); return; }
    try {
      const z = await hub.oda(id);
      if (z.durum !== "tamam") { bildir("Oda bulunamadı."); return; }
      setPanel(null);
      setGorunum({ tur: "oda", oyuncu: z.oyuncu });
      if (z.hediyeler.length) bildir(`${z.hediyeler[0].kimden} ${hediyeEmoji(z.hediyeler[0].icerik)} bıraktı · bugün ${z.bugun_ziyaret} ziyaret`);
      profiliYukle().catch(() => {});
    } catch (h) { bildir(h instanceof OdulHatasi ? h.message : "Oda açılamadı."); }
  }, [profil, odamAc, bildir, profiliYukle]);

  const carsiAc = useCallback(async () => {
    setPanel(null);
    try {
      setSponsorlar(await odul.sponsorlar());
      setGorunum({ tur: "carsi" });
    } catch { bildir("Çarşı yüklenemedi."); }
  }, [bildir]);

  // Düzenleme ızgarası panelle birlikte: oda yeniden çizilse bile (yukarıdaki
  // etki) bu etki ondan SONRA çalışır ve ızgarayı geri koyar.
  useEffect(() => {
    if (gorunum?.tur !== "oda") return;
    sahneRef.current?.duzenKipi(panel === "duzen");
    sahneRef.current?.karakterOdagi(panel === "karakter");
  }, [panel, gorunum]);

  // ── Sahnede dokunma ──
  secRef.current = (s: Secim) => {
    if (s.tur === "oda") odaZiyaret(s.id);
    if (s.tur === "bolum") bildir("Bu bölüm topluluk büyüdükçe açılır. Arkadaşlarını HUB'a davet et!");
    if (s.tur === "dukkan") {
      const sp = sponsorlar.find((x) => x.id === s.id);
      if (!sp) return;
      sahneRef.current?.kapiCal(sp.id).then(() => {
        if (sp.kilit.acik) setDetay(sp);
        else bildir(`${sp.ad} kilitli: ${sayi(sp.kilit.eksik_xp)} XP${sp.kilit.eksik_etkinlik ? ` ve ${sp.kilit.eksik_etkinlik} etkinlik` : ""} daha. Etkinliklere katıl, kapı açılsın.`);
      });
    }
    if (panel === "duzen" && taslakOda) {
      if (s.tur === "esya") { setSecili(s.indeks); setArac(null); sahneRef.current?.secimiGoster(s.indeks); }
      if (s.tur === "hucre") hucreyeKoy(s.x, s.z);
    }
  };

  // ── Oda düzenleme ──
  function duzenBaslat() {
    if (!profil) return;
    if (gorunum?.tur !== "oda" || !gorunum.oyuncu.ben) odamAc();
    setTaslakOda(profil.ben.oda.map((e) => ({ ...e })));
    setSecili(null);
    setArac(null);
    setPanel("duzen");
  }
  function duzenBitir(kaydedildi: boolean) {
    setPanel(null);
    setArac(null);
    setSecili(null);
    sahneRef.current?.secimiGoster(null);
    sahneRef.current?.duzenKipi(false);
    if (!kaydedildi && profil) sahneRef.current?.odaGuncelle(profil.ben.oda);
    setTaslakOda(null);
  }
  const yerlesik = (id: string, oda = taslakOda ?? []) => oda.filter((e) => e.esya === id).length;
  function odaDegisti(yeni: OdaEsyasi[], secim: number | null = secili) {
    setTaslakOda(yeni);
    sahneRef.current?.odaGuncelle(yeni);
    sahneRef.current?.secimiGoster(secim);
  }
  function hucreyeKoy(x: number, z: number) {
    if (!taslakOda || !profil) return;
    const id = arac ?? (secili !== null ? taslakOda[secili]?.esya : null);
    if (!id) return;
    const k = esya.get(id);
    const slot = k?.slot ?? "mobilya";
    const zz = slot === "duvar" ? 0 : z;
    const dolu = taslakOda.findIndex((e, i) => i !== (arac ? -1 : secili) && e.x === x && e.z === zz && (esya.get(e.esya)?.slot ?? "mobilya") === slot);
    if (dolu >= 0) { bildir("Orası dolu. Başka bir kareye koy ya da oradakini kaldır."); return; }
    if (arac) {
      if (yerlesik(arac) >= (profil.envanter[arac] ?? 0)) { bildir("Bu eşyadan elindekilerin hepsi yerleşik."); return; }
      const yeni = [...taslakOda, { esya: arac, x, z: zz, yon: 0 }];
      odaDegisti(yeni, yeni.length - 1);
      setSecili(yeni.length - 1);
      setArac(null);
    } else if (secili !== null) {
      odaDegisti(taslakOda.map((e, i) => (i === secili ? { ...e, x, z: zz } : e)));
    }
  }
  function seciliyiDondur() {
    if (secili === null || !taslakOda) return;
    odaDegisti(taslakOda.map((e, i) => (i === secili ? { ...e, yon: (e.yon + 1) % 4 } : e)));
  }
  function seciliyiKaldir() {
    if (secili === null || !taslakOda) return;
    setSecili(null);
    odaDegisti(taslakOda.filter((_, i) => i !== secili), null);
  }
  async function odayiKaydet() {
    if (!taslakOda) return;
    try {
      await hub.odaKaydet(taslakOda);
      const p = await profiliYukle();
      duzenBitir(true);
      setGorunum({ tur: "oda", oyuncu: { ...p.ben, ben: true } });
      bildir("Odan kaydedildi. Görevlerde 'Odanı düzenle' ödülün hazır.");
    } catch (h) { bildir(h instanceof OdulHatasi ? h.message : "Kaydedilemedi."); }
  }

  // ── Karakter ──
  function karakterBaslat() {
    if (!profil) return;
    if (gorunum?.tur !== "oda" || !gorunum.oyuncu.ben) odamAc();
    setTaslakAvatar(structuredClone(profil.ben.avatar));
    setPanel("karakter");
  }
  function avatarDegisti(a: Avatar) {
    setTaslakAvatar(a);
    sahneRef.current?.avatarGuncelle(a);
  }
  async function avatariKaydet() {
    if (!taslakAvatar) return;
    try {
      await hub.avatarKaydet(taslakAvatar);
      await profiliYukle();
      setPanel(null);
      setTaslakAvatar(null);
      bildir("Karakterin kaydedildi.");
    } catch (h) { bildir(h instanceof OdulHatasi ? h.message : "Kaydedilemedi."); }
  }
  function karakterVazgec() {
    if (profil) sahneRef.current?.avatarGuncelle(profil.ben.avatar);
    setTaslakAvatar(null);
    setPanel(null);
  }

  const baslik = gorunum?.tur === "bina" ? "YAZVEB Binası"
    : gorunum?.tur === "carsi" ? "Sponsor Çarşısı"
    : gorunum?.tur === "oda" ? (gorunum.oyuncu.ben ? "Odam" : `${gorunum.oyuncu.ad} · oda`) : "YAZVEB HUB";
  const gorevRozeti = (profil?.gorevler.filter((g) => !g.alindi && g.ilerleme >= g.hedef).length ?? 0) + (profil?.etkinlik_coin.length ? 1 : 0);
  const benimOdam = gorunum?.tur === "oda" && gorunum.oyuncu.ben;
  const baskaOda = gorunum?.tur === "oda" && !gorunum.oyuncu.ben ? gorunum.oyuncu : null;

  return createPortal(
    <div className="hub" role="application" aria-label="YAZVEB HUB">
      <div className="hub-gok" aria-hidden="true" />
      <div className="hub-tuval" ref={kapRef} />

      <header className="hub-ust">
        <button className="hub-cam hub-geri" onClick={onKapat} aria-label="Klasik görünüme dön">
          <Simge ad="geri" boyut={18} /><span>Klasik</span>
        </button>
        <div className="hub-baslik">
          <span className="etiket">YAZVEB HUB</span>
          <b>{baslik}</b>
        </div>
        <div className="hub-ust-sag">
          <button className="hub-cam hub-coin" onClick={() => setPanel("gorevler")} aria-label={`${profil?.coin ?? 0} Coin`}>
            <span className="hub-coin-ikon" aria-hidden="true" />
            <b className="rakam">{sayi(profil?.coin ?? 0)}</b>
          </button>
          <button className="hub-cam hub-zil" onClick={() => setPanel("gelenler")} aria-label="Gelenler">
            <Simge ad="hediye" boyut={18} />
            {!!profil?.yeni_hediye && <i className="hub-rozet rakam">{profil.yeni_hediye}</i>}
          </button>
        </div>
      </header>

      {hata && <p className="hub-hata bildirim" role="alert">{hata}</p>}
      {!profil && !hata && <div className="hub-yukleniyor"><div className="dogrulama-halkasi" /><span className="etiket">HUB hazırlanıyor</span></div>}

      {/* Bağlama göre eylemler */}
      {profil && panel === null && (
        <div className="hub-eylemler">
          {benimOdam && <>
            <button className="hub-cam" onClick={karakterBaslat}><Simge ad="topluluk" boyut={16} /> Karakter</button>
            <button className="hub-cam" onClick={duzenBaslat}><Simge ad="kalem" boyut={16} /> Odayı düzenle</button>
          </>}
          {baskaOda && <>
            <button className="hub-cam birincil" onClick={() => setPanel("hediye")}><Simge ad="hediye" boyut={16} /> Hediye bırak</button>
            <button className="hub-cam" onClick={binaAc}><Simge ad="geri" boyut={16} /> Binaya dön</button>
          </>}
          {gorunum?.tur === "bina" && <span className="hub-ipucu">Bir odaya dokun, içine gir. Yukarı kaydır: üst katlar.</span>}
          {gorunum?.tur === "carsi" && <span className="hub-ipucu">Kapıyı çal: açık dükkânda ödül seni bekliyor; kilitlide ne kadar kaldığını görürsün.</span>}
        </div>
      )}

      {bildirim && <p className="hub-bildirim" role="status">{bildirim}</p>}

      {/* Alt dok */}
      {panel !== "duzen" && panel !== "karakter" && (
        <nav className="hub-dok" aria-label="HUB">
          <DokDugmesi simge="ev" ad="Bina" aktif={gorunum?.tur === "bina"} onClick={binaAc} />
          <DokDugmesi simge="yildiz" ad="Odam" aktif={!!benimOdam} onClick={odamAc} />
          <DokDugmesi simge="odul" ad="Çarşı" aktif={gorunum?.tur === "carsi"} onClick={carsiAc} />
          <DokDugmesi simge="liste" ad="Görevler" aktif={panel === "gorevler"} rozet={gorevRozeti} onClick={() => setPanel(panel === "gorevler" ? null : "gorevler")} />
          <DokDugmesi simge="isik" ad="Çark" aktif={panel === "cark"} rozet={profil?.cark.hazir ? 1 : 0} onClick={() => setPanel(panel === "cark" ? null : "cark")} />
          <DokDugmesi simge="grafik" ad="Mağaza" aktif={panel === "magaza"} onClick={() => setPanel(panel === "magaza" ? null : "magaza")} />
        </nav>
      )}

      {profil && panel === "gorevler" && (
        <Pencere baslik="Görevler" onKapat={() => setPanel(null)}>
          <GorevPaneli profil={profil} onDegisti={(m) => { bildir(m); profiliYukle(); }} />
        </Pencere>
      )}
      {profil && panel === "cark" && (
        <Pencere baslik="YAZVEB Şans Çarkı" onKapat={() => setPanel(null)}>
          <CarkPaneli profil={profil} esya={esya} onDegisti={(m) => { bildir(m); profiliYukle(); }} />
        </Pencere>
      )}
      {profil && panel === "magaza" && (
        <Pencere baslik="Mağaza" onKapat={() => setPanel(null)}>
          <Magaza profil={profil} katalog={katalog} onDegisti={(m) => { bildir(m); profiliYukle(); }} />
        </Pencere>
      )}
      {profil && panel === "gelenler" && (
        <Pencere baslik="Gelenler" onKapat={() => setPanel(null)}>
          <GelenKutusu onZiyaret={(id) => odaZiyaret(id)} onOkundu={() => profiliYukle()} />
        </Pencere>
      )}
      {profil && panel === "hediye" && baskaOda && (
        <Pencere baslik={`${baskaOda.ad} için hediye`} onKapat={() => setPanel(null)}>
          <HediyePaneli alici={baskaOda} profil={profil} esya={esya}
            onGonderildi={(m) => { bildir(m); setPanel(null); profiliYukle(); }} />
        </Pencere>
      )}
      {profil && panel === "karakter" && taslakAvatar && (
        <Pencere baslik="Karakterin" alt onKapat={karakterVazgec}
          dip={<><button className="dugme" onClick={karakterVazgec}>Vazgeç</button><button className="dugme birincil" onClick={avatariKaydet}>Kaydet</button></>}>
          <KarakterPaneli avatar={taslakAvatar} profil={profil} esya={esya} onDegisti={avatarDegisti} />
        </Pencere>
      )}
      {profil && panel === "duzen" && taslakOda && (
        <Pencere baslik="Odanı düzenle" alt onKapat={() => duzenBitir(false)}
          dip={<><button className="dugme" onClick={() => duzenBitir(false)}>Vazgeç</button><button className="dugme birincil" onClick={odayiKaydet}>Kaydet</button></>}>
          <p className="hub-not">
            {arac ? `${esya.get(arac)?.ad ?? arac}: odada bir kareye dokun.`
              : secili !== null ? "Taşımak için bir kareye dokun; ya da döndür/kaldır."
              : "Aşağıdan bir eşya seç, sonra odada yerini göster. Yerleşik eşyaya dokunarak seçebilirsin."}
          </p>
          {secili !== null && (
            <div className="hub-satir">
              <button className="dugme cizgili" onClick={seciliyiDondur}><Simge ad="yenile" boyut={16} /> Döndür</button>
              <button className="dugme tehlike" onClick={seciliyiKaldir}><Simge ad="cop" boyut={16} /> Kaldır</button>
            </div>
          )}
          <div className="hub-esya-seridi">
            {Object.entries(profil.envanter)
              .filter(([id]) => esya.get(id)?.tur === "oda")
              .map(([id, adet]) => {
                const kalan = adet - yerlesik(id);
                return (
                  <button key={id} className="hub-esya-cipi" data-secili={arac === id} disabled={kalan <= 0}
                          onClick={() => { setArac(arac === id ? null : id); setSecili(null); sahneRef.current?.secimiGoster(null); }}>
                    <b>{esya.get(id)?.ad ?? id}</b>
                    <span className="rakam">{kalan}/{adet} · {SLOT_ADI[esya.get(id)?.slot ?? "mobilya"]}</span>
                  </button>
                );
              })}
          </div>
          <p className="hub-not soluk">Oda {ODA_BOYU}×{ODA_BOYU} kare. Duvar eşyaları arka duvara asılır.</p>
        </Pencere>
      )}

      {detay && (
        <SponsorDetay sponsor={detay} onKapat={() => setDetay(null)}
          onTara={(s) => { setDetay(null); setTarama(s); }} />
      )}
      {tarama && (
        <Tarayici mod={{ tur: "sponsor", sponsor: tarama }} onKapat={() => setTarama(null)}
          onDegisti={() => { odulDegisti(); carsiAc(); }} />
      )}
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════
// Parçalar
// ═══════════════════════════════════════════════════════════════════

function DokDugmesi({ simge, ad, aktif, rozet, onClick }: {
  simge: Parameters<typeof Simge>[0]["ad"]; ad: string; aktif: boolean; rozet?: number; onClick: () => void;
}) {
  return (
    <button className="hub-dok-oge" aria-current={aktif ? "page" : undefined} onClick={onClick}>
      <span className="hub-dok-ikon"><Simge ad={simge} boyut={20} />{!!rozet && <i className="hub-rozet rakam">{rozet}</i>}</span>
      <span>{ad}</span>
    </button>
  );
}

function Pencere({ baslik, onKapat, children, dip, alt }: {
  baslik: string; onKapat: () => void; children: ReactNode; dip?: ReactNode;
  /** Sahne görünür kalsın: pencere ekranın alt yarısında (karakter, oda düzeni). */
  alt?: boolean;
}) {
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [onKapat]);
  return (
    <section className={"hub-pencere" + (alt ? " alt" : "")} role="dialog" aria-label={baslik}>
      <div className="hub-pencere-bas">
        <h2>{baslik}</h2>
        <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
      </div>
      <div className="hub-pencere-govde">{children}</div>
      {dip && <div className="hub-pencere-dip">{dip}</div>}
    </section>
  );
}

function GorevPaneli({ profil, onDegisti }: { profil: HubProfil; onDegisti: (m: string) => void }) {
  const [bekliyor, setBekliyor] = useState<string | null>(null);
  async function al(kod: string) {
    setBekliyor(kod);
    try {
      const r = await hub.gorevAl(kod);
      onDegisti(r.durum === "tamam" ? `+${r.odul} Coin` : r.durum === "zaten_alindi" ? "Bu ödülü bugün aldın." : "Görev henüz tamamlanmadı.");
    } catch (h) { onDegisti(h instanceof OdulHatasi ? h.message : "Alınamadı."); }
    finally { setBekliyor(null); }
  }
  async function etkinlik() {
    setBekliyor("etkinlik");
    try {
      const r = await hub.etkinlikCoinAl();
      onDegisti(r.durum === "tamam" ? `Etkinliklerden +${sayi(r.kazanilan)} Coin` : "Çevrilecek etkinlik yok.");
    } catch (h) { onDegisti(h instanceof OdulHatasi ? h.message : "Alınamadı."); }
    finally { setBekliyor(null); }
  }
  const etkinlikToplam = profil.etkinlik_coin.reduce((t, e) => t + e.coin, 0);
  return (
    <div className="yigin">
      <div className="hub-kart hub-etkinlik-kart">
        <div>
          <span className="etiket">Etkinlik</span>
          <b>Okuttuğun her etkinlik QR'si Coin'e dönüşür</b>
          <span className="soluk">{profil.etkinlik_coin.length
            ? `${profil.etkinlik_coin.length} okutma bekliyor · +${sayi(etkinlikToplam)} Coin`
            : "Etkinlikte QR okut; puanının 5 katı Coin burada seni bekler."}</span>
        </div>
        <button className="dugme birincil" disabled={!profil.etkinlik_coin.length || bekliyor !== null} onClick={etkinlik}>Coin'e çevir</button>
      </div>
      <span className="etiket">Bugün</span>
      <ul className="hub-gorevler">
        {profil.gorevler.map((g) => {
          const bitti = g.ilerleme >= g.hedef;
          return (
            <li key={g.kod} data-durum={g.alindi ? "alindi" : bitti ? "hazir" : "devam"}>
              <div className="hub-gorev-bilgi">
                <b>{g.baslik}</b>
                <span className="hub-ilerleme"><i style={{ width: `${(g.ilerleme / g.hedef) * 100}%` }} /></span>
                <span className="soluk rakam">{g.ilerleme}/{g.hedef} · +{g.odul} Coin</span>
              </div>
              {g.alindi ? <span className="etiket">Alındı</span>
                : <button className="dugme birincil" disabled={!bitti || bekliyor !== null} onClick={() => al(g.kod)}>Al</button>}
            </li>
          );
        })}
      </ul>
      <p className="hub-not soluk">Görevler her gece yarısı yenilenir. Coin yalnızca HUB'da harcanır; puanın (XP) ve sıralaman etkilenmez.</p>
    </div>
  );
}

const CARK_RENK = ["#8ccfe2", "#2a3140", "#e2b659", "#3a4252", "#b89cff", "#7fe0a8", "#e07a5f"];

function CarkPaneli({ profil, esya, onDegisti }: { profil: HubProfil; esya: Map<string, KatalogEsyasi>; onDegisti: (m: string) => void }) {
  const [aci, setAci] = useState(0);
  const [donuyor, setDonuyor] = useState(false);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const dilimler = profil.cark.dilimler;
  const n = dilimler.length;
  async function cevir() {
    setDonuyor(true);
    setSonuc(null);
    try {
      const r = await hub.carkCevir();
      if (r.durum !== "tamam" || !r.dilim) { onDegisti("Bu haftaki hakkını kullandın."); setDonuyor(false); return; }
      const i = dilimler.findIndex((d) => d.sira === r.dilim);
      // Seçilen dilim tepeye (ok) gelsin: 5 tam tur + dilimin ortası.
      const hedef = 360 * 5 + (360 - (i + 0.5) * (360 / n));
      setAci((a) => a - (a % 360) + hedef);
      const kazanc = r.esya ? `${esya.get(r.esya)?.ad ?? r.esya} kazandın!` : `+${sayi(r.coin ?? 0)} Coin kazandın!`;
      setTimeout(() => { setSonuc(`${r.ad} · ${kazanc}`); setDonuyor(false); onDegisti(kazanc); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 4200);
    } catch (h) { onDegisti(h instanceof OdulHatasi ? h.message : "Çark çevrilemedi."); setDonuyor(false); }
  }
  return (
    <div className="yigin hub-cark-panel">
      <div className="hub-cark-kap">
        <span className="hub-cark-ok" aria-hidden="true" />
        <svg viewBox="-100 -100 200 200" className="hub-cark" style={{ transform: `rotate(${aci}deg)` }} aria-hidden="true">
          {dilimler.map((d, i) => {
            const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
            const orta = (a0 + a1) / 2;
            return (
              <g key={d.sira}>
                <path d={`M0 0 L${Math.cos(a0) * 96} ${Math.sin(a0) * 96} A96 96 0 0 1 ${Math.cos(a1) * 96} ${Math.sin(a1) * 96} Z`}
                      fill={CARK_RENK[i % CARK_RENK.length]} stroke="#0b0d11" strokeWidth="1.5" />
                <text x={Math.cos(orta) * 60} y={Math.sin(orta) * 60} fill={i % 2 ? "#ecedee" : "#08090b"} fontSize="9" fontWeight="700"
                      textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(orta * 180) / Math.PI + 90} ${Math.cos(orta) * 60} ${Math.sin(orta) * 60})`}>
                  {d.ad}
                </text>
              </g>
            );
          })}
          <circle r="16" fill="#0b0d11" stroke="#8ccfe2" strokeWidth="2" />
        </svg>
      </div>
      {sonuc && <p className="hub-sonuc" role="status">{sonuc}</p>}
      <button className="dugme birincil genis" disabled={!profil.cark.hazir || donuyor} onClick={cevir}>
        {donuyor ? "Dönüyor…" : profil.cark.hazir ? "Çarkı çevir" : `Sonraki hak: ${tarihSaat(profil.cark.sonraki)}`}
      </button>
      <details className="hub-olasilik">
        <summary>Olasılıklar</summary>
        <ul>{dilimler.map((d) => <li key={d.sira}><span>{d.ad}</span><span className="rakam">%{d.olasilik}</span></li>)}</ul>
        {profil.cark.haftanin_esyasi && <p className="soluk">Haftanın eşyası: {esya.get(profil.cark.haftanin_esyasi)?.ad ?? profil.cark.haftanin_esyasi}</p>}
      </details>
      <p className="hub-not soluk">Haftada bir, ücretsiz. Coin ya da parayla ek çevirme yok. Zaten sahip olduğun kıyafet çıkarsa değeri kadar Coin alırsın.</p>
    </div>
  );
}

function Magaza({ profil, katalog, onDegisti }: { profil: HubProfil; katalog: KatalogEsyasi[]; onDegisti: (m: string) => void }) {
  const [tur, setTur] = useState<"kiyafet" | "oda">("kiyafet");
  const [bekliyor, setBekliyor] = useState<string | null>(null);
  async function al(e: KatalogEsyasi) {
    setBekliyor(e.id);
    try {
      const r = await hub.satinAl(e.id);
      onDegisti(r.durum === "tamam" ? `${e.ad} senin!` : r.durum === "yetersiz" ? `${sayi(r.eksik ?? 0)} Coin eksik.` : r.durum === "zaten_var" ? "Bu kıyafet zaten sende." : "Bu eşya satışta değil.");
    } catch (h) { onDegisti(h instanceof OdulHatasi ? h.message : "Alınamadı."); }
    finally { setBekliyor(null); }
  }
  const liste = katalog.filter((k) => k.tur === tur && k.satista);
  return (
    <div className="yigin">
      <div className="secici" role="tablist" style={{ ["--secim" as string]: tur === "kiyafet" ? 0 : 1 }}>
        <span className="secici-gosterge" aria-hidden="true" />
        <button role="tab" aria-selected={tur === "kiyafet"} onClick={() => setTur("kiyafet")}>Kıyafet</button>
        <button role="tab" aria-selected={tur === "oda"} onClick={() => setTur("oda")}>Oda</button>
      </div>
      <ul className="hub-magaza">
        {liste.map((e) => {
          const adet = profil.envanter[e.id] ?? 0;
          const var_ = e.tur === "kiyafet" && adet > 0;
          return (
            <li key={e.id} data-nadirlik={e.nadirlik}>
              <span className="hub-renk" style={{ background: RENK[e.id]?.[0] ?? "#3a4252" }} aria-hidden="true" />
              <span className="hub-magaza-bilgi">
                <b>{e.ad}</b>
                <span className="soluk">{SLOT_ADI[e.slot]} · {NADIRLIK_ADI[e.nadirlik]}{adet && e.tur === "oda" ? ` · sende ${adet}` : ""}</span>
              </span>
              <button className="dugme cizgili" disabled={var_ || bekliyor !== null || profil.coin < e.fiyat} onClick={() => al(e)}>
                {var_ ? "Sende" : <><span className="hub-coin-ikon kucuk" aria-hidden="true" /><span className="rakam">{sayi(e.fiyat)}</span></>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function KarakterPaneli({ avatar, profil, esya, onDegisti }: {
  avatar: Avatar; profil: HubProfil; esya: Map<string, KatalogEsyasi>; onDegisti: (a: Avatar) => void;
}) {
  const kiyafetler = (slot: KiyafetSlotu) =>
    Object.keys(profil.envanter).filter((id) => esya.get(id)?.slot === slot);
  const giy = (slot: KiyafetSlotu, id: string | null) => {
    const giyili = { ...avatar.giyili };
    if (id) giyili[slot] = id; else delete giyili[slot];
    onDegisti({ ...avatar, giyili });
  };
  return (
    <div className="yigin hub-karakter">
      <Secenekler ad="Ten" adet={TEN.length} secili={avatar.ten} renk={(i) => TEN[i]} onSec={(i) => onDegisti({ ...avatar, ten: i })} />
      <Secenekler ad="Saç" adet={SAC_ADI.length} secili={avatar.sac} yazi={(i) => SAC_ADI[i]} onSec={(i) => onDegisti({ ...avatar, sac: i })} />
      <Secenekler ad="Saç rengi" adet={SAC_RENK.length} secili={avatar.sac_renk} renk={(i) => SAC_RENK[i]} onSec={(i) => onDegisti({ ...avatar, sac_renk: i })} />
      <Secenekler ad="Yüz" adet={YUZ_ADI.length} secili={avatar.yuz} yazi={(i) => YUZ_ADI[i]} onSec={(i) => onDegisti({ ...avatar, yuz: i })} />
      {KIYAFET_SLOTLARI.map((slot) => {
        const liste = kiyafetler(slot);
        if (!liste.length && ZORUNLU.includes(slot)) return null;
        return (
          <div key={slot} className="hub-secenek">
            <span className="etiket">{SLOT_ADI[slot]}</span>
            <div className="hub-secenek-sira">
              {!ZORUNLU.includes(slot) && (
                <button data-secili={!avatar.giyili[slot]} onClick={() => giy(slot, null)}>Yok</button>
              )}
              {liste.map((id) => (
                <button key={id} data-secili={avatar.giyili[slot] === id} onClick={() => giy(slot, id)}>
                  <span className="hub-renk kucuk" style={{ background: RENK[id]?.[0] ?? "#3a4252" }} aria-hidden="true" />
                  {esya.get(id)?.ad ?? id}
                </button>
              ))}
              {!liste.length && <span className="soluk">Mağazadan ya da çarktan alabilirsin.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Secenekler({ ad, adet, secili, renk, yazi, onSec }: {
  ad: string; adet: number; secili: number; renk?: (i: number) => string; yazi?: (i: number) => string; onSec: (i: number) => void;
}) {
  return (
    <div className="hub-secenek">
      <span className="etiket">{ad}</span>
      <div className="hub-secenek-sira">
        {Array.from({ length: adet }, (_, i) => (
          <button key={i} data-secili={secili === i} onClick={() => onSec(i)} aria-label={`${ad} ${i + 1}`}
                  className={renk ? "hub-renk-dugme" : undefined} style={renk ? { background: renk(i) } : undefined}>
            {yazi?.(i)}
          </button>
        ))}
      </div>
    </div>
  );
}

function HediyePaneli({ alici, profil, esya, onGonderildi }: {
  alici: Oyuncu; profil: HubProfil; esya: Map<string, KatalogEsyasi>; onGonderildi: (m: string) => void;
}) {
  const [secim, setSecim] = useState<{ tur: "emoji" | "esya"; icerik: string }>({ tur: "emoji", icerik: "kahve" });
  const [mesaj, setMesaj] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const esyalar = Object.entries(profil.envanter).filter(([id, a]) => esya.get(id)?.tur === "oda" && a > 0);
  async function gonder() {
    setBekliyor(true);
    setHata(null);
    try {
      const r = await hub.hediye(alici.id, secim.tur, secim.icerik, mesaj.trim() || undefined);
      if (r.durum === "tamam") onGonderildi(`${alici.ad} için ${secim.tur === "emoji" ? hediyeEmoji(secim.icerik) : esya.get(secim.icerik)?.ad} bıraktın.`);
      else setHata(r.durum === "sinir" ? "Bugün yeterince hediye bıraktın; yarın yine gel." : r.durum === "yok" ? "Bu eşya artık sende değil." : "Hediye gönderilemedi.");
    } catch (h) { setHata(h instanceof OdulHatasi ? h.message : "Gönderilemedi."); }
    finally { setBekliyor(false); }
  }
  return (
    <div className="yigin">
      <div className="hub-emojiler" role="radiogroup" aria-label="Hediye">
        {HEDIYELER.map((h) => (
          <button key={h.kod} role="radio" aria-checked={secim.tur === "emoji" && secim.icerik === h.kod}
                  onClick={() => setSecim({ tur: "emoji", icerik: h.kod })}>
            <span aria-hidden="true">{h.emoji}</span><small>{h.ad}</small>
          </button>
        ))}
      </div>
      {esyalar.length > 0 && (
        <label className="alan">
          <span className="etiket">Ya da odandan bir eşya ver</span>
          <select className="girdi" value={secim.tur === "esya" ? secim.icerik : ""}
                  onChange={(e) => setSecim(e.target.value ? { tur: "esya", icerik: e.target.value } : { tur: "emoji", icerik: "kahve" })}>
            <option value="">—</option>
            {esyalar.map(([id, a]) => <option key={id} value={id}>{esya.get(id)?.ad ?? id} (sende {a})</option>)}
          </select>
        </label>
      )}
      <label className="alan">
        <span className="etiket">Not <i>(isteğe bağlı)</i></span>
        <input className="girdi" value={mesaj} maxLength={80} onChange={(e) => setMesaj(e.target.value)} placeholder="Kolay gelsin!" />
      </label>
      {hata && <p className="bildirim" role="alert">{hata}</p>}
      <button className="dugme birincil genis" onClick={gonder} disabled={bekliyor}>Bırak</button>
      <p className="hub-not soluk">Emoji hediyeler ücretsiz; eşya verirsen senden düşer. Günde en fazla 10 hediye.</p>
    </div>
  );
}

function GelenKutusu({ onZiyaret, onOkundu }: { onZiyaret: (id: string) => void; onOkundu: () => void }) {
  const [veri, setVeri] = useState<Gelenler | null>(null);
  // Yalnızca açılışta bir kez: geri çağrı her çizimde yenilenir, bağımlılık yapılırsa döngüye girer.
  const okunduRef = useRef(onOkundu);
  okunduRef.current = onOkundu;
  useEffect(() => {
    hub.gelenler().then((v) => { setVeri(v); okunduRef.current(); }).catch(() => setVeri({ hediyeler: [], ziyaretciler: [] }));
  }, []);
  if (!veri) return <div className="dogrulama-halkasi" aria-label="Yükleniyor" />;
  return (
    <div className="yigin">
      <span className="etiket">Hediyeler</span>
      {veri.hediyeler.length === 0 && <p className="soluk">Henüz hediye yok. Sen birine bırak, o da sana bırakır.</p>}
      <ul className="hub-gelen">
        {veri.hediyeler.map((h, i) => (
          <li key={i} data-yeni={h.yeni}>
            <span className="hub-gelen-emoji" aria-hidden="true">{h.tur === "emoji" ? hediyeEmoji(h.icerik) : "🎁"}</span>
            <span className="hub-magaza-bilgi">
              <b>{h.kimden} {h.tur === "emoji" ? "bıraktı" : "bir eşya verdi"}</b>
              <span className="soluk">{h.mesaj ? `"${h.mesaj}" · ` : ""}{tarihSaat(h.zaman)}</span>
            </span>
            <button className="dugme cizgili" onClick={() => onZiyaret(h.kimden_id)}>Odası</button>
          </li>
        ))}
      </ul>
      <span className="etiket">Son 7 günde odanı ziyaret edenler</span>
      {veri.ziyaretciler.length === 0 && <p className="soluk">Henüz ziyaretçi yok.</p>}
      <ul className="hub-gelen">
        {veri.ziyaretciler.map((z, i) => (
          <li key={i}>
            <span className="hub-gelen-emoji" aria-hidden="true">👋</span>
            <span className="hub-magaza-bilgi"><b>{z.kim}</b><span className="soluk">{tarihSaat(z.zaman)}</span></span>
            <button className="dugme cizgili" onClick={() => onZiyaret(z.id)}>Karşılık ver</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
