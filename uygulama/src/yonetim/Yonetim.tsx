import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Simge, { ODUL_IKONLARI, odulIkonu } from "../tasarim/Simge";
import { supabase, type Etkinlik } from "../veri/supabase";
import { useOturum } from "../veri/oturum";
import { konumAl, OdulHatasi, sayi, tarihSaat } from "../veri/odul";
import { SponsorLogo } from "../odul/SponsorKarti";
import { QrPenceresi } from "./QrKod";
import {
  isoTarih,
  logoHazirla,
  yerelTarih,
  yonetim,
  type YAyarlar,
  type YDenetim,
  type YGorev,
  type YKampanya,
  type YKazanim,
  type YKullanici,
  type YOdulKalemi,
  type YOzet,
  type YSeviye,
  type YSponsor,
} from "./veri";

type Bolum = "ozet" | "gorevler" | "sponsorlar" | "kullanicilar" | "seviyeler" | "kullanimlar" | "denetim";

const BOLUMLER: { anahtar: Bolum; ad: string; simge: Parameters<typeof Simge>[0]["ad"]; baskan?: boolean }[] = [
  { anahtar: "ozet", ad: "Özet", simge: "grafik" },
  { anahtar: "gorevler", ad: "QR görevleri", simge: "qr" },
  { anahtar: "sponsorlar", ad: "Sponsorlar", simge: "hediye" },
  { anahtar: "kullanicilar", ad: "Kullanıcılar", simge: "topluluk" },
  { anahtar: "seviyeler", ad: "Seviyeler", simge: "yildiz" },
  { anahtar: "kullanimlar", ad: "Kullanımlar", simge: "tik" },
  { anahtar: "denetim", ad: "Denetim", simge: "kalkan", baskan: true },
];

/** Hata/bilgi mesajı taşıyan ortak kanca. */
function useIslem() {
  const [mesaj, setMesaj] = useState<{ tur: "hata" | "bilgi"; metin: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const calistir = useCallback(async <T,>(is: () => Promise<T>, basari?: string): Promise<T | undefined> => {
    setBekliyor(true);
    setMesaj(null);
    try {
      const r = await is();
      if (basari) setMesaj({ tur: "bilgi", metin: basari });
      return r;
    } catch (h) {
      setMesaj({ tur: "hata", metin: h instanceof OdulHatasi ? h.message : "İşlem tamamlanamadı." });
      return undefined;
    } finally {
      setBekliyor(false);
    }
  }, []);
  return { mesaj, bekliyor, calistir, setMesaj };
}

function Mesaj({ m }: { m: { tur: "hata" | "bilgi"; metin: string } | null }) {
  if (!m) return null;
  return <p className={"bildirim" + (m.tur === "bilgi" ? " bilgi" : "")} role={m.tur === "hata" ? "alert" : "status"}>{m.metin}</p>;
}

/**
 * Ödül sistemi yönetim paneli — yalnızca yetkililer (başkan, yönetici).
 * Her işlemin yetkisi veritabanında ayrıca denetlenir; bu ekran yalnızca
 * düğmeleri gösterir ya da gizler.
 */
export default function Yonetim({ onKapat }: { onKapat: () => void }) {
  const { baskanMi } = useOturum();
  const [bolum, setBolum] = useState<Bolum>("ozet");

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".yonetim .katman, .qr-penceresi")) onKapat();
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [onKapat]);

  return createPortal(
    <div className="yonetim" role="dialog" aria-modal="true" aria-label="Ödül yönetimi">
      <header className="yonetim-ust">
        <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        <div>
          <span className="etiket">Community Rewards</span>
          <h1>Yönetim</h1>
        </div>
      </header>
      <nav className="yonetim-bolumler" aria-label="Yönetim bölümleri">
        {BOLUMLER.filter((b) => !b.baskan || baskanMi).map((b) => (
          <button key={b.anahtar} aria-current={bolum === b.anahtar ? "page" : undefined} onClick={() => setBolum(b.anahtar)}>
            <Simge ad={b.simge} boyut={16} /> {b.ad}
          </button>
        ))}
      </nav>
      <main className="yonetim-govde">
        {bolum === "ozet" && <Ozet />}
        {bolum === "gorevler" && <Gorevler />}
        {bolum === "sponsorlar" && <Sponsorlar />}
        {bolum === "kullanicilar" && <Kullanicilar baskan={baskanMi} />}
        {bolum === "seviyeler" && <Seviyeler baskan={baskanMi} />}
        {bolum === "kullanimlar" && <Kullanimlar />}
        {bolum === "denetim" && baskanMi && <Denetim />}
      </main>
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════
// ÖZET
// ═══════════════════════════════════════════════════════════════════
function Ozet() {
  const [o, setO] = useState<YOzet | null>(null);
  const { mesaj, calistir } = useIslem();
  useEffect(() => { calistir(yonetim.ozet).then((r) => r && setO(r)); }, [calistir]);
  if (!o) return <Mesaj m={mesaj} />;
  const kutular: [string, string | number][] = [
    ["Toplam kullanıcı", sayi(o.toplam_kullanici)],
    ["Aktif (30 gün)", sayi(o.aktif_kullanici)],
    ["Etkinlik katılımı", sayi(o.etkinlik_katilimi)],
    ["QR / kod tarama", `${sayi(o.tarama_qr)} / ${sayi(o.tarama_kod)}`],
    ["Dağıtılan puan", `${sayi(o.dagitilan_puan)} XP`],
    ["Stoktaki ödül", sayi(o.stok_kalan)],
    ["Tükenen kalem", sayi(o.tukenen_kalem)],
  ];
  return (
    <>
      <div className="yonetim-kutular">
        {kutular.map(([ad, deger]) => (
          <div key={ad} className="yonetim-kutu"><span className="etiket">{ad}</span><b className="rakam">{deger}</b></div>
        ))}
      </div>
      <dl className="yonetim-oneciler">
        <div><dt className="etiket">En çok katılım</dt><dd>{o.en_cok_gorev ? `${o.en_cok_gorev.baslik} · ${o.en_cok_gorev.sayi}` : "—"}</dd></div>
        <div><dt className="etiket">En çok açılan sponsor</dt><dd>{o.en_cok_acilan_sponsor ? `${o.en_cok_acilan_sponsor.ad} · ${o.en_cok_acilan_sponsor.sayi} kişi` : "—"}</dd></div>
        <div><dt className="etiket">En çok kullanılan ödül</dt><dd>{o.en_cok_kullanilan_odul ? `${o.en_cok_kullanilan_odul.baslik} (${o.en_cok_kullanilan_odul.sponsor}) · ${o.en_cok_kullanilan_odul.sayi}` : "—"}</dd></div>
      </dl>
      <h2 className="yonetim-baslik">Sponsor metrikleri</h2>
      <div className="tablo-kap">
        <table className="yonetim-tablo">
          <thead><tr><th>Sponsor</th><th>Görüntüleme</th><th>QR tarama</th><th>Kazanılan</th><th>Kullanılan</th></tr></thead>
          <tbody>
            {o.sponsorlar.map((s) => (
              <tr key={s.id}><td>{s.ad}</td><td className="rakam">{s.goruntuleme}</td><td className="rakam">{s.tarama}</td>
                <td className="rakam">{s.kazanim}</td><td className="rakam">{s.kullanim}</td></tr>
            ))}
            {o.sponsorlar.length === 0 && <tr><td colSpan={5} className="soluk">Henüz sponsor yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// QR GÖREVLERİ
// ═══════════════════════════════════════════════════════════════════
const GOREV_TURLERI = [
  ["giris", "Etkinlik girişi"], ["workshop", "Workshop"], ["konferans", "Konferans"], ["stand", "Stand görevi"], ["diger", "Diğer"],
] as const;

function Gorevler() {
  const [liste, setListe] = useState<YGorev[] | null>(null);
  const [form, setForm] = useState<Partial<YGorev> | null>(null);
  const [qr, setQr] = useState<YGorev | null>(null);
  const { mesaj, calistir, bekliyor } = useIslem();

  const yukle = useCallback(() => calistir(yonetim.gorevler).then((r) => r && setListe(r)), [calistir]);
  useEffect(() => { yukle(); }, [yukle]);

  const durum = (g: YGorev) => {
    const simdi = Date.now();
    if (g.iptal || !g.aktif) return "Pasif";
    if (new Date(g.baslangic).getTime() > simdi) return "Başlamadı";
    if (new Date(g.bitis).getTime() <= simdi) return "Süresi doldu";
    if (g.toplam_limit && g.kullanim_sayisi >= g.toplam_limit) return "Doldu";
    return "Aktif";
  };

  return (
    <>
      <div className="yonetim-arac">
        <button className="dugme birincil" onClick={() => setForm({ puan: 50, kisi_basi_limit: 1, aktif: true, tur: "giris" })}>
          <Simge ad="arti" boyut={16} /> Yeni QR görevi
        </button>
      </div>
      <Mesaj m={mesaj} />
      <ul className="yonetim-liste">
        {liste?.map((g) => (
          <li key={g.id}>
            <div className="yonetim-satir-bilgi">
              <b>{g.baslik}</b>
              <span className="soluk rakam">
                +{g.puan} XP · {g.kisa_kod} · {g.kullanim_sayisi}{g.toplam_limit ? `/${g.toplam_limit}` : ""} kullanım
                {g.etkinlik ? ` · ${g.etkinlik}` : ""}{g.enlem !== null ? " · konum şartlı" : ""}
              </span>
              <span className="soluk rakam">{tarihSaat(g.baslangic)} → {tarihSaat(g.bitis)}</span>
            </div>
            <span className="etiket" data-durum={durum(g)}>{durum(g)}{g.baskan_kilidi ? " · başkan" : ""}</span>
            <div className="yonetim-satir-eylem">
              <button className="ikon-dugme kucuk" onClick={() => setQr(g)} aria-label="QR göster" data-ipucu="QR"><Simge ad="qr" boyut={16} /></button>
              {g.duzenlenebilir && (
                <>
                  <button className="ikon-dugme kucuk" onClick={() => setForm(g)} aria-label="Düzenle" data-ipucu="Düzenle"><Simge ad="kalem" boyut={16} /></button>
                  <button className="ikon-dugme kucuk" aria-label="QR'yi yenile" data-ipucu="QR yenile (eski baskılar geçersiz)"
                    onClick={() => confirm("QR yenilensin mi? Basılmış eski QR'ler geçersiz olur.") &&
                      calistir(() => yonetim.gorevIptal(g.id, true), "QR yenilendi; eski baskılar geçersiz.").then(yukle)}>
                    <Simge ad="yenile" boyut={16} />
                  </button>
                  {!g.iptal && (
                    <button className="ikon-dugme kucuk tehlike" aria-label="İptal et" data-ipucu="İptal (QR geçersizleşir)"
                      onClick={() => confirm(`"${g.baslik}" iptal edilsin mi?`) &&
                        calistir(() => yonetim.gorevIptal(g.id, false), "Görev iptal edildi.").then(yukle)}>
                      <Simge ad="cop" boyut={16} />
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
        {liste?.length === 0 && <li className="soluk">Henüz görev yok. Etkinlik öncesi bir QR görevi oluştur.</li>}
      </ul>

      {form && <GorevFormu baslangic={form} bekliyor={bekliyor} onKapat={() => setForm(null)}
        onKaydet={async (p) => {
          const r = await calistir(() => yonetim.gorevKaydet(p), "Görev kaydedildi.");
          if (r) { setForm(null); yukle(); }
        }} />}
      {qr && <QrPenceresi baslik={qr.baslik} altBaslik={`+${qr.puan} XP`} icerik={`YAZVEB:G:${qr.token}`}
        kisaKod={qr.kisa_kod} onKapat={() => setQr(null)} />}
    </>
  );
}

function GorevFormu({ baslangic, bekliyor, onKapat, onKaydet }: {
  baslangic: Partial<YGorev>;
  bekliyor: boolean;
  onKapat: () => void;
  onKaydet: (p: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    baslik: baslangic.baslik ?? "",
    aciklama: baslangic.aciklama ?? "",
    tur: baslangic.tur ?? "giris",
    etkinlik_id: baslangic.etkinlik_id ? String(baslangic.etkinlik_id) : "",
    puan: String(baslangic.puan ?? 50),
    baslangic: yerelTarih(baslangic.baslangic) || yerelTarih(new Date().toISOString()),
    bitis: yerelTarih(baslangic.bitis) || yerelTarih(new Date(Date.now() + 8 * 3600e3).toISOString()),
    kisi_basi_limit: String(baslangic.kisi_basi_limit ?? 1),
    toplam_limit: baslangic.toplam_limit ? String(baslangic.toplam_limit) : "",
    kisa_kod: baslangic.kisa_kod ?? "",
    aktif: baslangic.aktif ?? true,
    konumlu: baslangic.enlem != null,
    enlem: baslangic.enlem != null ? String(baslangic.enlem) : "",
    boylam: baslangic.boylam != null ? String(baslangic.boylam) : "",
    yaricap_m: String(baslangic.yaricap_m ?? 200),
  });
  const [etkinlikler, setEtkinlikler] = useState<Etkinlik[]>([]);
  useEffect(() => {
    supabase.from("etkinlikler").select("*").order("baslangic", { ascending: false }).limit(50)
      .then(({ data }) => setEtkinlikler((data as Etkinlik[]) ?? []));
  }, []);
  const d = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));

  function gonder(e: FormEvent) {
    e.preventDefault();
    onKaydet({
      ...(baslangic.id ? { id: baslangic.id } : {}),
      baslik: f.baslik.trim(), aciklama: f.aciklama.trim(), tur: f.tur,
      etkinlik_id: f.etkinlik_id ? Number(f.etkinlik_id) : null,
      puan: Number(f.puan), baslangic: isoTarih(f.baslangic), bitis: isoTarih(f.bitis),
      kisi_basi_limit: Number(f.kisi_basi_limit), toplam_limit: f.toplam_limit ? Number(f.toplam_limit) : null,
      kisa_kod: f.kisa_kod.trim() || null, aktif: f.aktif,
      enlem: f.konumlu ? Number(f.enlem) : null, boylam: f.konumlu ? Number(f.boylam) : null,
      yaricap_m: f.konumlu ? Number(f.yaricap_m) : null,
    });
  }

  return (
    <FormPenceresi baslik={baslangic.id ? "Görevi düzenle" : "Yeni QR görevi"} onKapat={onKapat}>
      <form className="yigin" onSubmit={gonder}>
        <Alan ad="Görev adı"><input className="girdi" value={f.baslik} onChange={(e) => d("baslik", e.target.value)} maxLength={120} required autoFocus /></Alan>
        <div className="alan-ikili">
          <Alan ad="Tür">
            <select className="girdi buyuk-secim" value={f.tur} onChange={(e) => d("tur", e.target.value)}>
              {GOREV_TURLERI.map(([k, a]) => <option key={k} value={k}>{a}</option>)}
            </select>
          </Alan>
          <Alan ad="Puan (XP)"><input className="girdi" type="number" min={1} max={10000} value={f.puan} onChange={(e) => d("puan", e.target.value)} required /></Alan>
        </div>
        <Alan ad="Etkinlik" not="katılım ve seri için">
          <select className="girdi buyuk-secim" value={f.etkinlik_id} onChange={(e) => d("etkinlik_id", e.target.value)}>
            <option value="">— Etkinliğe bağlı değil —</option>
            {etkinlikler.map((e) => <option key={e.id} value={e.id}>{e.baslik} · {tarihSaat(e.baslangic)}</option>)}
          </select>
        </Alan>
        <div className="alan-ikili">
          <Alan ad="Başlangıç"><input className="girdi" type="datetime-local" value={f.baslangic} onChange={(e) => d("baslangic", e.target.value)} required /></Alan>
          <Alan ad="Bitiş"><input className="girdi" type="datetime-local" value={f.bitis} onChange={(e) => d("bitis", e.target.value)} required /></Alan>
        </div>
        <div className="alan-ikili">
          <Alan ad="Kişi başı kullanım"><input className="girdi" type="number" min={1} max={100} value={f.kisi_basi_limit} onChange={(e) => d("kisi_basi_limit", e.target.value)} required /></Alan>
          <Alan ad="Toplam kullanım" not="boş = sınırsız"><input className="girdi" type="number" min={1} value={f.toplam_limit} onChange={(e) => d("toplam_limit", e.target.value)} /></Alan>
        </div>
        <Alan ad="Kısa kod" not="boş bırakılırsa rastgele üretilir">
          <input className="girdi rakam" value={f.kisa_kod} onChange={(e) => d("kisa_kod", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={10} placeholder="Örn. YAZ25" />
        </Alan>
        <Alan ad="Açıklama" not="isteğe bağlı"><textarea className="girdi" rows={2} value={f.aciklama} onChange={(e) => d("aciklama", e.target.value)} maxLength={500} /></Alan>
        <label className="onay-kutusu"><input type="checkbox" checked={f.konumlu} onChange={(e) => d("konumlu", e.target.checked)} /> Konum şartı (etkinlik alanında olmalı)</label>
        {f.konumlu && (
          <>
            <div className="alan-ikili">
              <Alan ad="Enlem"><input className="girdi" type="number" step="any" value={f.enlem} onChange={(e) => d("enlem", e.target.value)} required /></Alan>
              <Alan ad="Boylam"><input className="girdi" type="number" step="any" value={f.boylam} onChange={(e) => d("boylam", e.target.value)} required /></Alan>
            </div>
            <div className="alan-ikili">
              <Alan ad="Yarıçap (m)"><input className="girdi" type="number" min={20} max={5000} value={f.yaricap_m} onChange={(e) => d("yaricap_m", e.target.value)} required /></Alan>
              <button type="button" className="dugme cizgili buyuk" onClick={async () => {
                const k = await konumAl();
                if (k) setF((o) => ({ ...o, enlem: k.enlem.toFixed(6), boylam: k.boylam.toFixed(6) }));
              }}><Simge ad="konum" boyut={16} /> Şu anki konumum</button>
            </div>
            <p className="soluk yonetim-not">Konum telefonun bildirdiği değerdir; kararlı bir hileciyi durdurmaz, yanlışlıkla evden okutulmasını engeller.</p>
          </>
        )}
        <label className="onay-kutusu"><input type="checkbox" checked={f.aktif} onChange={(e) => d("aktif", e.target.checked)} /> Aktif</label>
        <div className="pencere-dip">
          <button type="button" className="dugme" onClick={onKapat}>Vazgeç</button>
          <button type="submit" className="dugme birincil" disabled={bekliyor}>Kaydet</button>
        </div>
      </form>
    </FormPenceresi>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SPONSORLAR VE KAMPANYALAR
// ═══════════════════════════════════════════════════════════════════
function Sponsorlar() {
  const [liste, setListe] = useState<YSponsor[] | null>(null);
  const [seviyeler, setSeviyeler] = useState<YSeviye[]>([]);
  const [sponsorForm, setSponsorForm] = useState<Partial<YSponsor> | null>(null);
  const [kampanyaForm, setKampanyaForm] = useState<{ sponsor: YSponsor; kampanya?: YKampanya } | null>(null);
  const [qr, setQr] = useState<{ s: YSponsor; k: YKampanya } | null>(null);
  const { mesaj, calistir, bekliyor } = useIslem();

  const yukle = useCallback(() => calistir(yonetim.sponsorlar).then((r) => r && setListe(r)), [calistir]);
  useEffect(() => {
    yukle();
    yonetim.seviyeler().then((r) => setSeviyeler(r.seviyeler)).catch(() => {});
  }, [yukle]);

  return (
    <>
      <div className="yonetim-arac">
        <button className="dugme birincil" onClick={() => setSponsorForm({ aktif: true, gerekli_xp: 0, gerekli_etkinlik: 0, siralama: 0 })}>
          <Simge ad="arti" boyut={16} /> Sponsor ekle
        </button>
      </div>
      <Mesaj m={mesaj} />
      {liste?.length === 0 && <p className="soluk">Henüz sponsor yok.</p>}
      {liste?.map((s) => (
        <section key={s.id} className="yonetim-sponsor">
          <div className="yonetim-sponsor-bas">
            <SponsorLogo sponsor={s} boyut={40} />
            <div className="yonetim-satir-bilgi">
              <b>{s.ad}{!s.aktif ? " · pasif" : ""}</b>
              <span className="soluk rakam">
                Kilit: {s.gerekli_xp} XP{s.gerekli_seviye_id ? ` · ${seviyeler.find((v) => v.id === s.gerekli_seviye_id)?.ad ?? "seviye"}` : ""}
                {s.gerekli_etkinlik ? ` · ${s.gerekli_etkinlik} etkinlik` : ""} · PIN {s.pin_tanimli ? "tanımlı" : "YOK"}
              </span>
            </div>
            {s.duzenlenebilir && (
              <div className="yonetim-satir-eylem">
                <button className="dugme cizgili" onClick={() => setKampanyaForm({ sponsor: s })}><Simge ad="arti" boyut={14} /> Kampanya</button>
                <button className="ikon-dugme kucuk" onClick={() => setSponsorForm(s)} aria-label="Sponsoru düzenle"><Simge ad="kalem" boyut={16} /></button>
              </div>
            )}
          </div>
          {!s.pin_tanimli && <p className="bildirim yonetim-not">İşletme PIN'i tanımlanmadan ödüller kullanılamaz.</p>}
          <ul className="yonetim-liste">
            {s.kampanyalar.map((k) => {
              const kalan = k.oduller.some((o) => o.toplam === null) ? null : k.oduller.reduce((t, o) => t + (o.kalan ?? 0), 0);
              const toplam = k.oduller.reduce((t, o) => t + (o.toplam ?? 0), 0);
              return (
                <li key={k.id}>
                  <div className="yonetim-satir-bilgi">
                    <b>{k.ad}</b>
                    <span className="soluk rakam">
                      {kalan === null ? "Sınırsız" : `${kalan}/${toplam} stok`} · {k.kazanim} kazanım · {k.kullanim} kullanım · {k.kisa_kod}
                    </span>
                    <span className="soluk rakam">{tarihSaat(k.baslangic)} → {tarihSaat(k.bitis)}</span>
                    <span className="kampanya-kalem-ozet">
                      {k.oduller.map((o) => (
                        <span key={o.id}><Simge ad={odulIkonu(o.ikon)} boyut={14} /> {o.baslik} {o.toplam === null ? "∞" : `${o.kalan}/${o.toplam}`}</span>
                      ))}
                    </span>
                  </div>
                  <span className="etiket">{k.iptal || !k.aktif ? "Pasif" : new Date(k.bitis) < new Date() ? "Bitti" : kalan === 0 ? "Tükendi" : "Aktif"}</span>
                  <div className="yonetim-satir-eylem">
                    <button className="ikon-dugme kucuk" onClick={() => setQr({ s, k })} aria-label="QR göster"><Simge ad="qr" boyut={16} /></button>
                    {k.duzenlenebilir && (
                      <>
                        <button className="ikon-dugme kucuk" onClick={() => setKampanyaForm({ sponsor: s, kampanya: k })} aria-label="Kampanyayı düzenle"><Simge ad="kalem" boyut={16} /></button>
                        {!k.iptal && (
                          <button className="ikon-dugme kucuk tehlike" aria-label="Kampanyayı iptal et"
                            onClick={() => confirm(`"${k.ad}" iptal edilsin mi? Kazanılmış ödüller geçerli kalır.`) &&
                              calistir(() => yonetim.kampanyaIptal(k.id), "Kampanya iptal edildi.").then(yukle)}>
                            <Simge ad="cop" boyut={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
            {s.kampanyalar.length === 0 && <li className="soluk">Kampanya yok.</li>}
          </ul>
        </section>
      ))}

      {sponsorForm && <SponsorFormu baslangic={sponsorForm} seviyeler={seviyeler} bekliyor={bekliyor}
        onKapat={() => setSponsorForm(null)}
        onKaydet={async (p) => { const r = await calistir(() => yonetim.sponsorKaydet(p), "Sponsor kaydedildi."); if (r) { setSponsorForm(null); yukle(); } }} />}
      {kampanyaForm && <KampanyaFormu sponsor={kampanyaForm.sponsor} baslangic={kampanyaForm.kampanya} bekliyor={bekliyor}
        onKapat={() => setKampanyaForm(null)}
        onKaydet={async (p) => { const r = await calistir(() => yonetim.kampanyaKaydet(p), "Kampanya kaydedildi."); if (r) { setKampanyaForm(null); yukle(); } }} />}
      {qr && <QrPenceresi baslik={qr.s.ad} altBaslik={qr.k.ad} icerik={`YAZVEB:S:${qr.k.token}`} kisaKod={qr.k.kisa_kod} onKapat={() => setQr(null)} />}
    </>
  );
}

function SponsorFormu({ baslangic, seviyeler, bekliyor, onKapat, onKaydet }: {
  baslangic: Partial<YSponsor>; seviyeler: YSeviye[]; bekliyor: boolean;
  onKapat: () => void; onKaydet: (p: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    ad: baslangic.ad ?? "", aciklama: baslangic.aciklama ?? "", website: baslangic.website ?? "", adres: baslangic.adres ?? "",
    gerekli_xp: String(baslangic.gerekli_xp ?? 0), gerekli_seviye_id: baslangic.gerekli_seviye_id ? String(baslangic.gerekli_seviye_id) : "",
    gerekli_etkinlik: String(baslangic.gerekli_etkinlik ?? 0), siralama: String(baslangic.siralama ?? 0),
    aktif: baslangic.aktif ?? true, pin: "",
  });
  const [logo, setLogo] = useState<string | null | undefined>(undefined);   // undefined = değişmedi
  const [logoHata, setLogoHata] = useState<string | null>(null);
  const d = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));

  return (
    <FormPenceresi baslik={baslangic.id ? "Sponsoru düzenle" : "Sponsor ekle"} onKapat={onKapat}>
      <form className="yigin" onSubmit={(e) => {
        e.preventDefault();
        onKaydet({
          ...(baslangic.id ? { id: baslangic.id } : {}),
          ad: f.ad.trim(), aciklama: f.aciklama.trim(), website: f.website.trim(), adres: f.adres.trim(),
          gerekli_xp: Number(f.gerekli_xp), gerekli_seviye_id: f.gerekli_seviye_id ? Number(f.gerekli_seviye_id) : null,
          gerekli_etkinlik: Number(f.gerekli_etkinlik), siralama: Number(f.siralama), aktif: f.aktif,
          ...(f.pin ? { pin: f.pin } : {}),
          ...(logo !== undefined ? { logo: logo ?? "" } : {}),
        });
      }}>
        <div className="logo-secici">
          <SponsorLogo sponsor={{ ad: f.ad || "?", logo: logo === undefined ? baslangic.logo ?? null : logo }} boyut={64} />
          <div className="yigin">
            <label className="dugme cizgili">
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                const dosya = e.target.files?.[0];
                if (!dosya) return;
                setLogoHata(null);
                try { setLogo(await logoHazirla(dosya)); } catch (h) { setLogoHata(h instanceof Error ? h.message : "Logo okunamadı."); }
              }} />
              Logo seç
            </label>
            {(logo || (logo === undefined && baslangic.logo)) && <button type="button" className="dugme" onClick={() => setLogo(null)}>Logoyu kaldır</button>}
            {logoHata && <p className="bildirim">{logoHata}</p>}
          </div>
        </div>
        <Alan ad="Sponsor adı"><input className="girdi" value={f.ad} onChange={(e) => d("ad", e.target.value)} maxLength={60} required autoFocus /></Alan>
        <Alan ad="Kısa açıklama"><textarea className="girdi" rows={2} value={f.aciklama} onChange={(e) => d("aciklama", e.target.value)} maxLength={500} /></Alan>
        <div className="alan-ikili">
          <Alan ad="Web sitesi" not="https://"><input className="girdi" type="url" value={f.website} onChange={(e) => d("website", e.target.value)} placeholder="https://" pattern="https://.*" /></Alan>
          <Alan ad="Adres"><input className="girdi" value={f.adres} onChange={(e) => d("adres", e.target.value)} maxLength={200} /></Alan>
        </div>
        <p className="etiket">Kilit şartları (hepsi birlikte)</p>
        <div className="alan-ucu">
          <Alan ad="Gerekli XP"><input className="girdi" type="number" min={0} value={f.gerekli_xp} onChange={(e) => d("gerekli_xp", e.target.value)} /></Alan>
          <Alan ad="Gerekli seviye">
            <select className="girdi buyuk-secim" value={f.gerekli_seviye_id} onChange={(e) => d("gerekli_seviye_id", e.target.value)}>
              <option value="">—</option>
              {seviyeler.map((s) => <option key={s.id} value={s.id}>{s.ad} ({s.esik} XP)</option>)}
            </select>
          </Alan>
          <Alan ad="Gerekli etkinlik"><input className="girdi" type="number" min={0} value={f.gerekli_etkinlik} onChange={(e) => d("gerekli_etkinlik", e.target.value)} /></Alan>
        </div>
        <div className="alan-ikili">
          <Alan ad="İşletme PIN'i" not={baslangic.pin_tanimli ? "boş = değişmez" : "4-8 rakam"}>
            <input className="girdi rakam" type="password" inputMode="numeric" autoComplete="new-password" value={f.pin}
              onChange={(e) => d("pin", e.target.value.replace(/[^0-9]/g, "").slice(0, 8))} placeholder={baslangic.pin_tanimli ? "••••" : ""} />
          </Alan>
          <Alan ad="Sıralama"><input className="girdi" type="number" value={f.siralama} onChange={(e) => d("siralama", e.target.value)} /></Alan>
        </div>
        <p className="soluk yonetim-not">PIN yalnızca işletme çalışanına verilir; ödül onayında girilir. Sunucuda özetlenerek saklanır, bir daha gösterilmez.</p>
        <label className="onay-kutusu"><input type="checkbox" checked={f.aktif} onChange={(e) => d("aktif", e.target.checked)} /> Aktif (uygulamada görünür)</label>
        <div className="pencere-dip">
          <button type="button" className="dugme" onClick={onKapat}>Vazgeç</button>
          <button type="submit" className="dugme birincil" disabled={bekliyor}>Kaydet</button>
        </div>
      </form>
    </FormPenceresi>
  );
}

type KalemTaslak = YOdulKalemi & { sinirsiz: boolean; adet: string; stok_ekle: string; sil?: boolean };

function KampanyaFormu({ sponsor, baslangic, bekliyor, onKapat, onKaydet }: {
  sponsor: YSponsor; baslangic?: YKampanya; bekliyor: boolean;
  onKapat: () => void; onKaydet: (p: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    ad: baslangic?.ad ?? "", kisa_kod: baslangic?.kisa_kod ?? "",
    baslangic: yerelTarih(baslangic?.baslangic ?? new Date().toISOString()),
    bitis: yerelTarih(baslangic?.bitis ?? new Date(Date.now() + 14 * 86400e3).toISOString()),
    kisi_basi_limit: String(baslangic?.kisi_basi_limit ?? 1), gecerlilik_gun: String(baslangic?.gecerlilik_gun ?? 30),
    surpriz: baslangic?.surpriz ?? true, aktif: baslangic ? baslangic.aktif && !baslangic.iptal : true, token_yenile: false,
  });
  const [kalemler, setKalemler] = useState<KalemTaslak[]>(
    baslangic?.oduller.map((o) => ({ ...o, sinirsiz: o.toplam === null, adet: "", stok_ekle: "" })) ??
    [{ baslik: "", tur: "urun", ikon: "hediye", aciklama: "", toplam: null, kalan: null, agirlik: 1, sinirsiz: false, adet: "10", stok_ekle: "" }],
  );
  const d = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  const kd = (i: number, p: Partial<KalemTaslak>) => setKalemler((l) => l.map((k, j) => (j === i ? { ...k, ...p } : k)));

  return (
    <FormPenceresi baslik={baslangic ? `${sponsor.ad} · kampanyayı düzenle` : `${sponsor.ad} · yeni kampanya`} onKapat={onKapat}>
      <form className="yigin" onSubmit={(e) => {
        e.preventDefault();
        onKaydet({
          ...(baslangic ? { id: baslangic.id } : {}),
          sponsor_id: sponsor.id, ad: f.ad.trim(), kisa_kod: f.kisa_kod || null,
          baslangic: isoTarih(f.baslangic), bitis: isoTarih(f.bitis),
          kisi_basi_limit: Number(f.kisi_basi_limit), gecerlilik_gun: Number(f.gecerlilik_gun),
          surpriz: f.surpriz, aktif: f.aktif, token_yenile: f.token_yenile,
          oduller: kalemler.filter((k) => k.id || !k.sil).map((k) => ({
            ...(k.id ? { id: k.id } : {}), baslik: k.baslik.trim(), tur: k.tur, ikon: k.ikon, aciklama: k.aciklama ?? "",
            agirlik: Number(k.agirlik) || 1, sinirsiz: k.sinirsiz,
            ...(k.id ? { stok_ekle: Number(k.stok_ekle) || 0, sil: !!k.sil } : { adet: Number(k.adet) || 0 }),
          })),
        });
      }}>
        <Alan ad="Kampanya adı"><input className="girdi" value={f.ad} onChange={(e) => d("ad", e.target.value)} maxLength={80} required autoFocus placeholder="Örn. YAZVEB Coffee Drop" /></Alan>
        <div className="alan-ikili">
          <Alan ad="Başlangıç"><input className="girdi" type="datetime-local" value={f.baslangic} onChange={(e) => d("baslangic", e.target.value)} required /></Alan>
          <Alan ad="Bitiş"><input className="girdi" type="datetime-local" value={f.bitis} onChange={(e) => d("bitis", e.target.value)} required /></Alan>
        </div>
        <div className="alan-ucu">
          <Alan ad="Kişi başı hak"><input className="girdi" type="number" min={1} max={100} value={f.kisi_basi_limit} onChange={(e) => d("kisi_basi_limit", e.target.value)} required /></Alan>
          <Alan ad="Ödül geçerliliği (gün)"><input className="girdi" type="number" min={1} max={365} value={f.gecerlilik_gun} onChange={(e) => d("gecerlilik_gun", e.target.value)} required /></Alan>
          <Alan ad="Kısa kod" not="boş = rastgele"><input className="girdi rakam" value={f.kisa_kod} maxLength={10} onChange={(e) => d("kisa_kod", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></Alan>
        </div>
        <label className="onay-kutusu"><input type="checkbox" checked={f.surpriz} onChange={(e) => d("surpriz", e.target.checked)} /> Sürpriz (ödül ancak kazanınca görünür)</label>
        <label className="onay-kutusu"><input type="checkbox" checked={f.aktif} onChange={(e) => d("aktif", e.target.checked)} /> Aktif</label>
        {baslangic && <label className="onay-kutusu"><input type="checkbox" checked={f.token_yenile} onChange={(e) => d("token_yenile", e.target.checked)} /> Sponsor QR'sini yenile (eski baskılar geçersiz)</label>}

        <p className="etiket">Ödüller (envanter)</p>
        {kalemler.map((k, i) => (
          <fieldset key={k.id ?? i} className="kalem" data-silinecek={!!k.sil}>
            <div className="alan-ikili">
              <Alan ad="Ödül"><input className="girdi" value={k.baslik} onChange={(e) => kd(i, { baslik: e.target.value })} maxLength={60} required={!k.sil} placeholder="HEDİYE KAHVE" /></Alan>
              <Alan ad="İkon">
                <div className="ikon-secici" role="radiogroup" aria-label="İkon">
                  {ODUL_IKONLARI.map((ad) => (
                    <button type="button" key={ad} role="radio" aria-checked={k.ikon === ad} aria-label={ad} onClick={() => kd(i, { ikon: ad })}>
                      <Simge ad={ad} boyut={18} />
                    </button>
                  ))}
                </div>
              </Alan>
            </div>
            <div className="alan-ucu">
              <Alan ad="Tür">
                <select className="girdi buyuk-secim" value={k.tur} onChange={(e) => kd(i, { tur: e.target.value })}>
                  <option value="urun">Ürün</option><option value="indirim">İndirim</option>
                  <option value="deneyim">Deneyim</option><option value="diger">Diğer</option>
                </select>
              </Alan>
              {k.id ? (
                <Alan ad={k.sinirsiz ? "Stok" : `Stok ekle (şu an ${k.kalan}/${k.toplam})`}>
                  <input className="girdi" type="number" min={0} disabled={k.sinirsiz} value={k.stok_ekle} onChange={(e) => kd(i, { stok_ekle: e.target.value })} placeholder="0" />
                </Alan>
              ) : (
                <Alan ad="Adet"><input className="girdi" type="number" min={1} disabled={k.sinirsiz} value={k.adet} onChange={(e) => kd(i, { adet: e.target.value })} required={!k.sinirsiz} /></Alan>
              )}
              <Alan ad="Ağırlık" not="sınırsızda olasılık"><input className="girdi" type="number" min={1} max={1000} value={k.agirlik} onChange={(e) => kd(i, { agirlik: Number(e.target.value) })} /></Alan>
            </div>
            <div className="kalem-alt">
              <label className="onay-kutusu"><input type="checkbox" checked={k.sinirsiz} onChange={(e) => kd(i, { sinirsiz: e.target.checked })} /> Sınırsız</label>
              <button type="button" className="dugme tehlike" onClick={() => (k.id ? kd(i, { sil: !k.sil }) : setKalemler((l) => l.filter((_, j) => j !== i)))}>
                {k.sil ? "Silmekten vazgeç" : "Kalemi kaldır"}
              </button>
            </div>
          </fieldset>
        ))}
        <button type="button" className="dugme cizgili" onClick={() => setKalemler((l) => [...l, { baslik: "", tur: "indirim", ikon: "indirim", aciklama: "", toplam: null, kalan: null, agirlik: 1, sinirsiz: false, adet: "10", stok_ekle: "" }])}>
          <Simge ad="arti" boyut={14} /> Ödül kalemi ekle
        </button>
        <p className="soluk yonetim-not">Çekilişte sınırlı kalemlerin şansı kalan stokla orantılıdır. Stok 3 ve altına inince uygulamada "Son 3 ödül" görünür.</p>
        <div className="pencere-dip">
          <button type="button" className="dugme" onClick={onKapat}>Vazgeç</button>
          <button type="submit" className="dugme birincil" disabled={bekliyor}>Kaydet</button>
        </div>
      </form>
    </FormPenceresi>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KULLANICILAR VE ELLE PUAN
// ═══════════════════════════════════════════════════════════════════
function Kullanicilar({ baskan }: { baskan: boolean }) {
  const [ara, setAra] = useState("");
  const [liste, setListe] = useState<YKullanici[] | null>(null);
  const [secili, setSecili] = useState<YKullanici | null>(null);
  const { mesaj, calistir, bekliyor } = useIslem();

  const yukle = useCallback((a?: string) => calistir(() => yonetim.kullanicilar(a)).then((r) => r && setListe(r)), [calistir]);
  useEffect(() => { const z = setTimeout(() => yukle(ara), 250); return () => clearTimeout(z); }, [ara, yukle]);

  return (
    <>
      <div className="yonetim-arac">
        <input className="girdi" value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Kullanıcı ara" aria-label="Kullanıcı ara" />
      </div>
      <Mesaj m={mesaj} />
      <div className="tablo-kap">
        <table className="yonetim-tablo">
          <thead><tr><th>Kullanıcı</th><th>XP</th><th>Seviye</th><th>Etkinlik</th><th>Seri</th><th>Ödül</th>{baskan && <th />}</tr></thead>
          <tbody>
            {liste?.map((k) => (
              <tr key={k.id}>
                <td><b>@{k.kullanici_adi}</b>{k.ad_soyad ? <span className="soluk"> · {k.ad_soyad}</span> : null}</td>
                <td className="rakam">{sayi(k.xp)}</td><td>{k.seviye}</td><td className="rakam">{k.etkinlik}</td>
                <td className="rakam">{k.seri}</td><td className="rakam">{k.odul}</td>
                {baskan && <td><button className="dugme cizgili" onClick={() => setSecili(k)}>Puan</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!baskan && <p className="soluk yonetim-not">Elle puan ekleme ve düşme yalnızca başkana açık.</p>}
      {secili && <PuanFormu kullanici={secili} bekliyor={bekliyor} onKapat={() => setSecili(null)}
        onKaydet={async (miktar, aciklama) => {
          const r = await calistir(() => yonetim.puanAyarla(secili.id, miktar, aciklama), "Puan güncellendi ve denetim kaydına yazıldı.");
          if (r) { setSecili(null); yukle(ara); }
        }} />}
    </>
  );
}

function PuanFormu({ kullanici, bekliyor, onKapat, onKaydet }: {
  kullanici: YKullanici; bekliyor: boolean; onKapat: () => void; onKaydet: (m: number, a: string) => void;
}) {
  const [miktar, setMiktar] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [yon, setYon] = useState<1 | -1>(1);
  return (
    <FormPenceresi baslik={`@${kullanici.kullanici_adi} · ${sayi(kullanici.xp)} XP`} onKapat={onKapat}>
      <form className="yigin" onSubmit={(e) => { e.preventDefault(); onKaydet(yon * Number(miktar), aciklama.trim()); }}>
        <div className="secici" style={{ ["--secim" as string]: yon === 1 ? 0 : 1 }}>
          <span className="secici-gosterge" aria-hidden="true" />
          <button type="button" aria-selected={yon === 1} onClick={() => setYon(1)}>Ekle</button>
          <button type="button" aria-selected={yon === -1} onClick={() => setYon(-1)}>Düş</button>
        </div>
        <Alan ad="Miktar (XP)"><input className="girdi" type="number" min={1} max={100000} value={miktar} onChange={(e) => setMiktar(e.target.value)} required autoFocus /></Alan>
        <Alan ad="Gerekçe" not="denetim kaydına yazılır"><input className="girdi" value={aciklama} onChange={(e) => setAciklama(e.target.value)} maxLength={160} required placeholder="Örn. Gönüllü ekip katkısı" /></Alan>
        <div className="pencere-dip">
          <button type="button" className="dugme" onClick={onKapat}>Vazgeç</button>
          <button type="submit" className="dugme birincil" disabled={bekliyor || !miktar || !aciklama.trim()}>
            {yon === 1 ? "+" : "−"}{miktar || 0} XP uygula
          </button>
        </div>
      </form>
    </FormPenceresi>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SEVİYELER VE AYARLAR
// ═══════════════════════════════════════════════════════════════════
function Seviyeler({ baskan }: { baskan: boolean }) {
  const [liste, setListe] = useState<YSeviye[] | null>(null);
  const [ayarlar, setAyarlar] = useState<YAyarlar | null>(null);
  const [bonus, setBonus] = useState("");
  const { mesaj, calistir, bekliyor } = useIslem();

  const yukle = useCallback(() => calistir(yonetim.seviyeler).then((r) => {
    if (!r) return;
    setListe(r.seviyeler);
    setAyarlar(r.ayarlar);
    setBonus(Object.entries(r.ayarlar.seri_bonuslari).map(([k, v]) => `${k}:${v}`).join(", "));
  }), [calistir]);
  useEffect(() => { yukle(); }, [yukle]);
  if (!liste || !ayarlar) return <Mesaj m={mesaj} />;

  const sd = (i: number, p: Partial<YSeviye>) => setListe((l) => l!.map((s, j) => (j === i ? { ...s, ...p } : s)));

  return (
    <>
      <Mesaj m={mesaj} />
      <fieldset className="yigin yonetim-kume" disabled={!baskan}>
        <legend className="etiket">Seviyeler</legend>
        {liste.map((s, i) => (
          <div key={s.id ?? `yeni${i}`} className="alan-ucu seviye-satiri">
            <Alan ad={`Seviye ${String(i + 1).padStart(2, "0")}`}><input className="girdi" value={s.ad} maxLength={30} onChange={(e) => sd(i, { ad: e.target.value.toUpperCase() })} /></Alan>
            <Alan ad="Eşik XP"><input className="girdi" type="number" min={0} value={s.esik} onChange={(e) => sd(i, { esik: Number(e.target.value) })} /></Alan>
            <Alan ad="Açıklama"><input className="girdi" value={s.aciklama ?? ""} maxLength={200} onChange={(e) => sd(i, { aciklama: e.target.value })} /></Alan>
            {baskan && liste.length > 1 && (
              <button type="button" className="ikon-dugme kucuk tehlike" aria-label="Seviyeyi kaldır" onClick={() => setListe((l) => l!.filter((_, j) => j !== i))}><Simge ad="cop" boyut={16} /></button>
            )}
          </div>
        ))}
        {baskan && (
          <div className="yonetim-arac">
            <button type="button" className="dugme cizgili" onClick={() => setListe((l) => [...l!, { ad: "YENİ", esik: (l!.at(-1)?.esik ?? 0) + 1000, ikon: "yildiz", aciklama: "" }])}><Simge ad="arti" boyut={14} /> Seviye ekle</button>
            <button type="button" className="dugme birincil" disabled={bekliyor}
              onClick={() => calistir(() => yonetim.seviyelerKaydet([...liste].sort((a, b) => a.esik - b.esik)), "Seviyeler kaydedildi.").then(yukle)}>Seviyeleri kaydet</button>
          </div>
        )}
      </fieldset>

      <fieldset className="yigin yonetim-kume" disabled={!baskan}>
        <legend className="etiket">Seri ve sıralama</legend>
        <label className="onay-kutusu"><input type="checkbox" checked={ayarlar.seri_acik} onChange={(e) => setAyarlar({ ...ayarlar, seri_acik: e.target.checked })} /> Etkinlik serisi açık</label>
        <Alan ad="Seri bonusları" not="seri:puan, virgülle — örn. 3:50, 5:100">
          <input className="girdi rakam" value={bonus} onChange={(e) => setBonus(e.target.value)} />
        </Alan>
        <label className="onay-kutusu"><input type="checkbox" checked={ayarlar.liderlik_acik} onChange={(e) => setAyarlar({ ...ayarlar, liderlik_acik: e.target.checked })} /> Sıralama (leaderboard) açık</label>
        {baskan && (
          <button type="button" className="dugme birincil" disabled={bekliyor} onClick={() => {
            const bonuslar: Record<string, number> = {};
            for (const parca of bonus.split(",").map((p) => p.trim()).filter(Boolean)) {
              const [k, v] = parca.split(":").map((x) => x.trim());
              if (!/^\d{1,3}$/.test(k) || !/^\d{1,5}$/.test(v ?? "")) {
                calistir(() => Promise.reject(new OdulHatasi(`Seri bonusu anlaşılamadı: "${parca}"`)));
                return;
              }
              bonuslar[k] = Number(v);
            }
            calistir(() => yonetim.ayarlarKaydet({ ...ayarlar, seri_bonuslari: bonuslar }), "Ayarlar kaydedildi.").then(yukle);
          }}>Ayarları kaydet</button>
        )}
      </fieldset>
      {!baskan && <p className="soluk yonetim-not">Seviye ve ayar değişikliği yalnızca başkana açık.</p>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KULLANIMLAR VE DENETİM
// ═══════════════════════════════════════════════════════════════════
function Kullanimlar() {
  const [liste, setListe] = useState<YKazanim[] | null>(null);
  const { mesaj, calistir } = useIslem();
  useEffect(() => { calistir(yonetim.kazanimlar).then((r) => r && setListe(r)); }, [calistir]);
  return (
    <>
      <Mesaj m={mesaj} />
      <div className="tablo-kap">
        <table className="yonetim-tablo">
          <thead><tr><th>Kullanıcı</th><th>Sponsor</th><th>Ödül</th><th>Kod</th><th>Kazanıldı</th><th>Durum</th></tr></thead>
          <tbody>
            {liste?.map((z) => (
              <tr key={z.id}>
                <td>@{z.kullanici}</td><td>{z.sponsor}</td><td>{z.baslik}</td><td className="rakam">{z.kod}</td>
                <td className="rakam">{tarihSaat(z.zaman)}</td>
                <td>{z.durum === "kullanildi" && z.kullanildi ? `Kullanıldı ${tarihSaat(z.kullanildi)}` : z.durum === "aktif" ? "Aktif" : z.durum === "suresi_doldu" ? "Süresi doldu" : "İptal"}</td>
              </tr>
            ))}
            {liste?.length === 0 && <tr><td colSpan={6} className="soluk">Henüz kazanılmış ödül yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Denetim() {
  const [liste, setListe] = useState<YDenetim[] | null>(null);
  const { mesaj, calistir } = useIslem();
  useEffect(() => { calistir(yonetim.denetim).then((r) => r && setListe(r)); }, [calistir]);
  return (
    <>
      <Mesaj m={mesaj} />
      <ul className="yonetim-liste denetim-liste">
        {liste?.map((d, i) => (
          <li key={i}>
            <div className="yonetim-satir-bilgi">
              <b>{d.islem.replace(/_/g, " ")}</b>
              <span className="soluk rakam">{tarihSaat(d.zaman)} · @{d.yapan ?? "sistem"} · {d.hedef}</span>
              <code className="denetim-ayrinti">{JSON.stringify(d.ayrinti)}</code>
            </div>
          </li>
        ))}
        {liste?.length === 0 && <li className="soluk">Kayıt yok.</li>}
      </ul>
    </>
  );
}

// ── Ortak form parçaları ────────────────────────────────────────────
function Alan({ ad, not, children }: { ad: string; not?: string; children: ReactNode }) {
  return (
    <label className="alan">
      <span className="etiket">{ad}{not ? <i> ({not})</i> : null}</span>
      {children}
    </label>
  );
}

function FormPenceresi({ baslik, onKapat, children }: { baslik: string; onKapat: () => void; children: ReactNode }) {
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onKapat(); } };
    window.addEventListener("keydown", tus, true);
    return () => window.removeEventListener("keydown", tus, true);
  }, [onKapat]);
  return (
    <div className="katman" onClick={onKapat}>
      <div className="pencere yonetim-pencere" role="dialog" aria-modal="true" aria-label={baslik} onClick={(e) => e.stopPropagation()}>
        <div className="pencere-basi">
          <h2>{baslik}</h2>
          <button className="ikon-dugme" onClick={onKapat} aria-label="Kapat"><Simge ad="kapat" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
