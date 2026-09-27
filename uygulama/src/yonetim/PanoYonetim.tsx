import { useCallback, useEffect, useState } from "react";
import Simge from "../tasarim/Simge";
import { supabase } from "../veri/supabase";
import { sayi, tarihSaat } from "../veri/odul";
import { useOturum } from "../veri/oturum";
import { Alan, FormPenceresi, Mesaj } from "./ortak";
import { useIslem } from "./islem";
import { isoTarih, panoYonetim, yerelTarih, type YPano, type YPanoAyarlar, type YSikayet, type YSinavDonemi, type YSponsorlu } from "./veri";

const NEDEN_ADI: Record<string, string> = {
  telif: "telif", uygunsuz: "uygunsuz", spam: "spam", yanlis: "yanlış bilgi", diger: "diğer",
};

// ═══════════════════════════════════════════════════════════════════
// MODERASYON — şikayet edilen notlar ve sohbet mesajları
// ═══════════════════════════════════════════════════════════════════
export function Moderasyon() {
  const [liste, setListe] = useState<YSikayet[] | null>(null);
  const { mesaj, calistir, bekliyor } = useIslem();
  const yukle = useCallback(() => calistir(panoYonetim.moderasyon).then((r) => r && setListe(r)), [calistir]);
  useEffect(() => { yukle(); }, [yukle]);

  async function dosyaAc(yol: string) {
    // Yetkili gizlenmiş notun dosyasını da görebilir (Storage kuralı).
    const sekme = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("notlar").download(yol);
    if (error || !data) { sekme?.close(); return; }
    const adres = URL.createObjectURL(data);
    if (sekme) { sekme.opener = null; sekme.location.href = adres; }
  }

  return (
    <>
      <p className="soluk yonetim-not">
        Doğrulanmış öğrencilerden gelen şikayetler eşiğe ulaşınca içerik kendiliğinden gizlenir; yetkili şikayeti tek başına gizler.
        “Yayında tut” şikayetleri reddeder ve içeriği geri açar; “Kaldır” notu kaldırır (puanı geri alınır) ya da mesajı siler.
      </p>
      <Mesaj m={mesaj} />
      {liste?.length === 0 && <p className="soluk">Açık şikayet yok.</p>}
      <ul className="yonetim-liste">
        {liste?.map((s) => (
          <li key={s.tur + s.hedef} className="moderasyon-ogesi">
            <div className="yonetim-satir-bilgi">
              <b>
                {s.tur === "not" ? "Not" : "Sohbet mesajı"} · {s.sayi} şikayet
                {s.icerik && "durum" in s.icerik && s.icerik.durum === "gizli" ? " · gizlendi" : ""}
                {s.icerik && "gizli" in s.icerik && s.icerik.gizli ? " · gizlendi" : ""}
              </b>
              {s.icerik && "baslik" in s.icerik && (
                <span>{s.icerik.baslik} <span className="soluk">— {s.icerik.ders}, {s.icerik.bolum}, {s.icerik.universite} · @{s.icerik.yazar}</span></span>
              )}
              {s.icerik && "metin" in s.icerik && (
                <span>“{s.icerik.metin}” <span className="soluk">— @{s.icerik.yazar}</span></span>
              )}
              {!s.icerik && <span className="soluk">İçerik artık yok.</span>}
              <span className="soluk rakam">
                {Object.entries(s.nedenler).map(([n, a]) => `${NEDEN_ADI[n] ?? n} ${a}`).join(" · ")} · son {tarihSaat(s.son)}
              </span>
              {s.aciklamalar.slice(0, 3).map((a, i) => <span key={i} className="soluk">“{a}”</span>)}
            </div>
            <div className="yonetim-satir-eylem">
              {s.icerik && "yol" in s.icerik && (
                <button className="dugme cizgili" onClick={() => dosyaAc((s.icerik as { yol: string }).yol)}>
                  <Simge ad="kitap" boyut={14} /> İncele
                </button>
              )}
              <button className="dugme" disabled={bekliyor}
                onClick={() => calistir(() => panoYonetim.karar(s.tur, s.hedef, "tut"), "Yayında tutuldu.").then(yukle)}>
                Yayında tut
              </button>
              <button className="dugme tehlike" disabled={bekliyor}
                onClick={() => confirm(s.tur === "not" ? "Not kaldırılsın mı? Yazarın puanı geri alınır." : "Mesaj silinsin mi?") &&
                  calistir(() => panoYonetim.karar(s.tur, s.hedef, "kaldir"), "Kaldırıldı.").then(yukle)}>
                Kaldır
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// NOTLAR — istatistik, sınav dönemleri, sponsorlu ilanlar, üniversiteler
// ═══════════════════════════════════════════════════════════════════
const KADEME = { altin: "Altın", gumus: "Gümüş", bronz: "Bronz" } as const;

export function NotYonetimi() {
  const { baskanMi } = useOturum();
  const [v, setV] = useState<YPano | null>(null);
  const [sinavForm, setSinavForm] = useState<YSinavDonemi | null>(null);
  const [sponsorluForm, setSponsorluForm] = useState<Partial<YSponsorlu> | null>(null);
  const [adlar, setAdlar] = useState<Record<string, string>>({});
  const { mesaj, calistir, bekliyor } = useIslem();

  const yukle = useCallback(() => calistir(panoYonetim.ozet).then((r) => {
    if (!r) return;
    setV(r);
    setAdlar(Object.fromEntries(r.alanlar.map((a) => [a.kurum_alani, a.ad ?? ""])));
  }), [calistir]);
  useEffect(() => { yukle(); }, [yukle]);

  if (!v) return <Mesaj m={mesaj} />;
  const kurumlar = [...new Set(["selcuk.edu.tr", ...v.alanlar.map((a) => a.kurum_alani)])];

  return (
    <>
      <div className="yonetim-kutular">
        {([
          ["Yayındaki not", sayi(v.istatistik.not)],
          ["Bu hafta paylaşılan", sayi(v.istatistik.bu_hafta)],
          ["Doğrulanmış öğrenci", sayi(v.istatistik.dogrulanmis)],
          ["Bu hafta açılma", sayi(v.istatistik.acilma_hafta)],
          ["Açık şikayet", sayi(v.istatistik.acik_sikayet)],
        ] as [string, string][]).map(([ad, deger]) => (
          <div key={ad} className="yonetim-kutu"><span className="etiket">{ad}</span><b className="rakam">{deger}</b></div>
        ))}
      </div>
      <Mesaj m={mesaj} />

      <h3 className="yonetim-baslik">Sınav dönemleri</h3>
      <p className="soluk yonetim-not">
        Akademik takvimden vize, final, bütünleme haftaları. Dönemden {v.ayarlar.sinav_oncesi_gun} gün önce notlar öne çıkar,
        o sırada paylaşılan not ×{Number(v.ayarlar.sinav_carpani).toLocaleString("tr-TR")} taban puan alır ve “sınav dönemi” sponsorlu ilanları görünür.
      </p>
      <div className="yonetim-arac">
        <button className="dugme birincil" onClick={() => setSinavForm({ kurum_alani: "selcuk.edu.tr", ad: "Vize", baslangic: "", bitis: "" })}>
          <Simge ad="arti" boyut={16} /> Dönem ekle
        </button>
      </div>
      <ul className="yonetim-liste">
        {v.sinav_donemleri.map((s) => (
          <li key={s.id}>
            <div className="yonetim-satir-bilgi">
              <b>{s.ad} · {s.universite}</b>
              <span className="soluk rakam">{tarihGun(s.baslangic)} → {tarihGun(s.bitis)}</span>
            </div>
            <div className="yonetim-satir-eylem">
              <button className="ikon-dugme kucuk" onClick={() => setSinavForm(s)} aria-label="Dönemi düzenle"><Simge ad="kalem" boyut={16} /></button>
              <button className="ikon-dugme kucuk tehlike" aria-label="Dönemi sil"
                onClick={() => confirm(`${s.ad} dönemi silinsin mi?`) && calistir(() => panoYonetim.sinavSil(s.id!), "Silindi.").then(yukle)}>
                <Simge ad="cop" boyut={16} />
              </button>
            </div>
          </li>
        ))}
        {v.sinav_donemleri.length === 0 && <li className="soluk">Tanımlı dönem yok.</li>}
      </ul>

      <h3 className="yonetim-baslik">Sponsorlu ilanlar</h3>
      <p className="soluk yonetim-not">
        Notlar akışında kademeye göre üstte ve dikkat çekici görünür (altın → gümüş → bronz), her zaman “Sponsorlu” etiketiyle ve
        en fazla her beş kartta bir. Öğrencinin notunu listeden itmez. Hedefleme kişisel veriyle değil: üniversite ve sınav dönemi.
      </p>
      <div className="yonetim-arac">
        <button className="dugme birincil" onClick={() => setSponsorluForm({ kademe: "bronz", baglam: "her_zaman", aktif: true, sponsor_id: null, hedef_kurum: null })}>
          <Simge ad="arti" boyut={16} /> İlan ekle
        </button>
      </div>
      <ul className="yonetim-liste">
        {v.sponsorlu.map((s) => (
          <li key={s.id}>
            <div className="yonetim-satir-bilgi">
              <b>{KADEME[s.kademe]} · {s.baslik}{!s.aktif ? " · pasif" : new Date(s.bitis) < new Date() ? " · bitti" : ""}</b>
              <span className="soluk">{s.sponsor ? `${s.sponsor} · ` : ""}{s.baglam === "sinav_donemi" ? "Yalnızca sınav döneminde" : "Her zaman"} · {s.hedef_kurum ?? "tüm üniversiteler"}</span>
              <span className="soluk rakam">{tarihSaat(s.baslangic)} → {tarihSaat(s.bitis)} · {sayi(s.gosterim ?? 0)} gösterim · {sayi(s.tiklama ?? 0)} tıklama</span>
            </div>
            <div className="yonetim-satir-eylem">
              <button className="ikon-dugme kucuk" onClick={() => setSponsorluForm(s)} aria-label="İlanı düzenle"><Simge ad="kalem" boyut={16} /></button>
              <button className="ikon-dugme kucuk tehlike" aria-label="İlanı sil"
                onClick={() => confirm(`"${s.baslik}" silinsin mi?`) && calistir(() => panoYonetim.sponsorluSil(s.id!), "Silindi.").then(yukle)}>
                <Simge ad="cop" boyut={16} />
              </button>
            </div>
          </li>
        ))}
        {v.sponsorlu.length === 0 && <li className="soluk">İlan yok.</li>}
      </ul>

      <h3 className="yonetim-baslik">Üniversiteler</h3>
      <p className="soluk yonetim-not">Doğrulanan e-posta alanları. Listede olmayan bir .edu.tr alanı adıyla görünmüyorsa buradan ad ver.</p>
      <ul className="yonetim-liste">
        {v.alanlar.map((a) => (
          <li key={a.kurum_alani}>
            <div className="yonetim-satir-bilgi">
              <b className="rakam">{a.kurum_alani}</b>
              <span className="soluk">{a.uye} doğrulanmış üye</span>
            </div>
            <form className="yonetim-satir-eylem universite-adi"
                  onSubmit={(e) => { e.preventDefault(); calistir(() => panoYonetim.universiteKaydet(a.kurum_alani, adlar[a.kurum_alani] ?? ""), "Kaydedildi.").then(yukle); }}>
              <input className="girdi" value={adlar[a.kurum_alani] ?? ""} placeholder="Üniversite adı" maxLength={80}
                     onChange={(e) => setAdlar((x) => ({ ...x, [a.kurum_alani]: e.target.value }))} aria-label={`${a.kurum_alani} adı`} />
              <button className="dugme cizgili" disabled={bekliyor || (adlar[a.kurum_alani] ?? "") === (a.ad ?? "")}>Kaydet</button>
            </form>
          </li>
        ))}
        {v.alanlar.length === 0 && <li className="soluk">Henüz doğrulanmış öğrenci yok.</li>}
      </ul>

      <PuanAyarlari ayarlar={v.ayarlar} baskan={baskanMi} bekliyor={bekliyor}
        onKaydet={(p) => calistir(() => panoYonetim.ayarlarKaydet(p), "Puan ayarları kaydedildi.").then(yukle)} />

      {sinavForm && (
        <SinavFormu baslangic={sinavForm} kurumlar={kurumlar} bekliyor={bekliyor} onKapat={() => setSinavForm(null)}
          onKaydet={async (p) => { const r = await calistir(() => panoYonetim.sinavKaydet(p), "Dönem kaydedildi."); if (r) { setSinavForm(null); yukle(); } }} />
      )}
      {sponsorluForm && (
        <SponsorluFormu baslangic={sponsorluForm} kurumlar={kurumlar} sponsorlar={v.sponsorlar} bekliyor={bekliyor} onKapat={() => setSponsorluForm(null)}
          onKaydet={async (p) => { const r = await calistir(() => panoYonetim.sponsorluKaydet(p), "İlan kaydedildi."); if (r) { setSponsorluForm(null); yukle(); } }} />
      )}
    </>
  );
}

function tarihGun(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function SinavFormu({ baslangic, kurumlar, bekliyor, onKapat, onKaydet }: {
  baslangic: YSinavDonemi; kurumlar: string[]; bekliyor: boolean; onKapat: () => void; onKaydet: (p: YSinavDonemi) => void;
}) {
  const [f, setF] = useState(baslangic);
  return (
    <FormPenceresi baslik={baslangic.id ? "Sınav dönemini düzenle" : "Sınav dönemi ekle"} onKapat={onKapat}>
      <form className="yigin" onSubmit={(e) => { e.preventDefault(); onKaydet(f); }}>
        <Alan ad="Üniversite (e-posta alanı)">
          <input className="girdi" list="kurum-listesi" value={f.kurum_alani} onChange={(e) => setF({ ...f, kurum_alani: e.target.value.trim().toLowerCase() })} required />
          <datalist id="kurum-listesi">{kurumlar.map((k) => <option key={k} value={k} />)}</datalist>
        </Alan>
        <Alan ad="Dönem">
          <input className="girdi" list="donem-adlari" value={f.ad} maxLength={40} onChange={(e) => setF({ ...f, ad: e.target.value })} required />
          <datalist id="donem-adlari">{["Vize", "Final", "Bütünleme", "Ara sınav"].map((a) => <option key={a} value={a} />)}</datalist>
        </Alan>
        <div className="alan-ikili">
          <Alan ad="Başlangıç"><input className="girdi" type="date" value={f.baslangic} onChange={(e) => setF({ ...f, baslangic: e.target.value })} required /></Alan>
          <Alan ad="Bitiş"><input className="girdi" type="date" value={f.bitis} onChange={(e) => setF({ ...f, bitis: e.target.value })} required /></Alan>
        </div>
        <div className="pencere-dip">
          <button type="button" className="dugme" onClick={onKapat}>Vazgeç</button>
          <button type="submit" className="dugme birincil" disabled={bekliyor}>Kaydet</button>
        </div>
      </form>
    </FormPenceresi>
  );
}

function SponsorluFormu({ baslangic, kurumlar, sponsorlar, bekliyor, onKapat, onKaydet }: {
  baslangic: Partial<YSponsorlu>; kurumlar: string[]; sponsorlar: { id: string; ad: string }[]; bekliyor: boolean;
  onKapat: () => void; onKaydet: (p: Partial<YSponsorlu>) => void;
}) {
  const [f, setF] = useState({
    sponsor_id: baslangic.sponsor_id ?? "", kademe: baslangic.kademe ?? "bronz", baslik: baslangic.baslik ?? "",
    metin: baslangic.metin ?? "", baglanti: baslangic.baglanti ?? "", baglam: baslangic.baglam ?? "her_zaman",
    hedef_kurum: baslangic.hedef_kurum ?? "", baslangic: yerelTarih(baslangic.baslangic ?? new Date().toISOString()),
    bitis: yerelTarih(baslangic.bitis ?? new Date(Date.now() + 30 * 86_400_000).toISOString()), aktif: baslangic.aktif ?? true,
  });
  return (
    <FormPenceresi baslik={baslangic.id ? "Sponsorlu ilanı düzenle" : "Sponsorlu ilan ekle"} onKapat={onKapat}>
      <form className="yigin" onSubmit={(e) => {
        e.preventDefault();
        onKaydet({
          id: baslangic.id, sponsor_id: f.sponsor_id || null, kademe: f.kademe as YSponsorlu["kademe"], baslik: f.baslik,
          metin: f.metin || null, baglanti: f.baglanti || null, baglam: f.baglam as YSponsorlu["baglam"],
          hedef_kurum: f.hedef_kurum || null, baslangic: isoTarih(f.baslangic) ?? undefined, bitis: isoTarih(f.bitis) ?? undefined, aktif: f.aktif,
        });
      }}>
        <div className="alan-ikili">
          <Alan ad="Kademe">
            <select className="girdi buyuk-secim" value={f.kademe} onChange={(e) => setF({ ...f, kademe: e.target.value as YSponsorlu["kademe"] })}>
              <option value="altin">Altın (en üstte, vurgulu)</option>
              <option value="gumus">Gümüş</option>
              <option value="bronz">Bronz</option>
            </select>
          </Alan>
          <Alan ad="Sponsor" not="varsa uygulama içi sayfası açılır">
            <select className="girdi buyuk-secim" value={f.sponsor_id} onChange={(e) => setF({ ...f, sponsor_id: e.target.value })}>
              <option value="">Yok</option>
              {sponsorlar.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
            </select>
          </Alan>
        </div>
        <Alan ad="Başlık"><input className="girdi" value={f.baslik} maxLength={80} onChange={(e) => setF({ ...f, baslik: e.target.value })} required /></Alan>
        <Alan ad="Metin" not="en fazla 200"><textarea className="girdi" rows={2} maxLength={200} value={f.metin} onChange={(e) => setF({ ...f, metin: e.target.value })} /></Alan>
        <Alan ad="Bağlantı" not="https, sponsor seçiliyse gerekmez">
          <input className="girdi" type="url" value={f.baglanti} placeholder="https://" onChange={(e) => setF({ ...f, baglanti: e.target.value })} />
        </Alan>
        <div className="alan-ikili">
          <Alan ad="Ne zaman">
            <select className="girdi buyuk-secim" value={f.baglam} onChange={(e) => setF({ ...f, baglam: e.target.value as YSponsorlu["baglam"] })}>
              <option value="her_zaman">Her zaman</option>
              <option value="sinav_donemi">Yalnızca sınav döneminde</option>
            </select>
          </Alan>
          <Alan ad="Üniversite">
            <select className="girdi buyuk-secim" value={f.hedef_kurum} onChange={(e) => setF({ ...f, hedef_kurum: e.target.value })}>
              <option value="">Tümü</option>
              {kurumlar.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Alan>
        </div>
        <div className="alan-ikili">
          <Alan ad="Başlangıç"><input className="girdi" type="datetime-local" value={f.baslangic} onChange={(e) => setF({ ...f, baslangic: e.target.value })} /></Alan>
          <Alan ad="Bitiş"><input className="girdi" type="datetime-local" value={f.bitis} onChange={(e) => setF({ ...f, bitis: e.target.value })} required /></Alan>
        </div>
        <label className="onay-kutusu"><input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} /> Aktif</label>
        <div className="pencere-dip">
          <button type="button" className="dugme" onClick={onKapat}>Vazgeç</button>
          <button type="submit" className="dugme birincil" disabled={bekliyor}>Kaydet</button>
        </div>
      </form>
    </FormPenceresi>
  );
}

function PuanAyarlari({ ayarlar, baskan, bekliyor, onKaydet }: {
  ayarlar: YPanoAyarlar; baskan: boolean; bekliyor: boolean; onKaydet: (p: Partial<YPanoAyarlar>) => void;
}) {
  const [f, setF] = useState(ayarlar);
  useEffect(() => setF(ayarlar), [ayarlar]);
  const alanlar: [keyof YPanoAyarlar, string, string?][] = [
    ["taban_xp", "Onay puanı (XP)"],
    ["oy_xp", "“İşime yaradı” başına (XP)"],
    ["not_tavan", "Not başına tavan (XP)"],
    ["haftalik_tavan", "Haftalık not tavanı (XP)"],
    ["sinav_carpani", "Sınav öncesi çarpan", "1-3"],
    ["sinav_oncesi_gun", "Sınavdan kaç gün önce"],
    ["onay_saat", "Onay bekleme (saat)"],
    ["sikayet_esigi", "Gizleme eşiği (şikayet)"],
    ["gunluk_yukleme", "Günlük paylaşım sınırı"],
  ];
  return (
    <>
      <h3 className="yonetim-baslik">Puan ve kurallar</h3>
      <p className="soluk yonetim-not">
        Cazip ama abartısız: puanın çoğu yüklemekten değil, notun başkasının işine yaramasından gelir.
        {!baskan && " Değiştirmek yalnızca başkana açık."}
      </p>
      <form className="yigin" onSubmit={(e) => { e.preventDefault(); onKaydet(f); }}>
        <div className="alan-ucu">
          {alanlar.map(([a, ad, not]) => (
            <Alan key={a} ad={ad} not={not}>
              <input className="girdi rakam" type="number" step={a === "sinav_carpani" ? 0.1 : 1} min={a === "sinav_carpani" ? 1 : 0}
                     value={String(f[a])} disabled={!baskan} onChange={(e) => setF({ ...f, [a]: Number(e.target.value) })} />
            </Alan>
          ))}
        </div>
        {baskan && <div className="yonetim-arac"><button className="dugme birincil" disabled={bekliyor}>Kaydet</button></div>}
      </form>
    </>
  );
}
