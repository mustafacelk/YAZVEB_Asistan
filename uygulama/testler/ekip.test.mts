// Ekip: pano ve gönüllü havuzunun saf gösterim mantığı.  npm run test:ekip
//
// Teslim etiketi doğru mu ("2 gün gecikti", "Yarın"), sınav haftası
// yakalanıyor mu, pano geciken işi en üste koyuyor mu, Ana'nın "Bugün"
// listesi gönüllü ve pano işini doğru öncelikle ekliyor mu?

import {
  acikIsZamani,
  ekipOzetleri,
  gunEkle,
  gunFarki,
  panoyuDuzenle,
  sinavHaftasi,
  teslimEtiketi,
  type BenimUstlenmem,
  type Pano,
  type PanoIsi,
} from "../src/veri/ekip_bicim.ts";
import { bugunListesi, durumCumlesi } from "../src/veri/bugun.ts";

let hata = 0;
let adet = 0;
function bekle(ad: string, kosul: boolean, ayrinti = "") {
  adet++;
  if (!kosul) hata++;
  console.log(kosul ? "✓" : "✗", ad, kosul ? "" : ayrinti);
}
const js = (x: unknown) => JSON.stringify(x);

const BUGUN = "2026-11-17";

// ── Tarih ──────────────────────────────────────────────────────────
bekle("gün farkı", gunFarki("2026-11-17", "2026-11-20") === 3 && gunFarki("2026-11-17", "2026-11-15") === -2);
bekle("ay sonunu aşan gün ekleme", gunEkle("2026-10-30", 3) === "2026-11-02");
bekle("yıl dönümü", gunEkle("2026-12-30", 3) === "2027-01-02");
bekle("yaz saati geçişi gün kaydırmaz", gunFarki("2026-10-24", "2026-10-26") === 2);
bekle("teslim: gecikti", js(teslimEtiketi("2026-11-15", BUGUN)) === js({ metin: "2 gün gecikti", ton: "gecikti" }));
bekle("teslim: bugün", teslimEtiketi(BUGUN, BUGUN).metin === "Bugün");
bekle("teslim: yarın", teslimEtiketi("2026-11-18", BUGUN).metin === "Yarın");
bekle("teslim: 3 gün kaldı yakın", js(teslimEtiketi("2026-11-20", BUGUN)) === js({ metin: "3 gün kaldı", ton: "yakin" }));
bekle("teslim: uzak tarih normal", teslimEtiketi("2026-11-30", BUGUN).ton === "normal");

const SINAV = [{ ad: "Vize", baslangic: "2026-10-31", bitis: "2026-11-08" }, { ad: "Final", baslangic: "2026-12-26", bitis: "2027-01-03" }];
bekle("vize haftası içi", sinavHaftasi("2026-11-03", SINAV) === "Vize");
bekle("vize sınır günleri dahil", sinavHaftasi("2026-10-31", SINAV) === "Vize" && sinavHaftasi("2026-11-08", SINAV) === "Vize");
bekle("vize sonrası serbest", sinavHaftasi("2026-11-09", SINAV) === null);
bekle("final yıl aşırı", sinavHaftasi("2027-01-02", SINAV) === "Final");
bekle("açık iş zamanı", acikIsZamani({ tarih: BUGUN, saat: "13:30:00", sure_saat: 1 }, BUGUN) === "Bugün 13:30 · 1 saat");
bekle("yarın, saatsiz", acikIsZamani({ tarih: "2026-11-18", saat: null, sure_saat: 3 }, BUGUN) === "Yarın · 3 saat");

// ── Pano ───────────────────────────────────────────────────────────
const kisi = (id: string) => ({ id, kullanici_adi: id, ad: id.toUpperCase() });
let sayac = 0;
const is_ = (ekip: PanoIsi["ekip"], sahibi: string, teslim: string, durum: PanoIsi["durum"] = "sirada", ek: Partial<PanoIsi> = {}): PanoIsi => ({
  id: ++sayac, baslik: "İş " + sayac, ekip, sahibi: kisi(sahibi), teslim, durum, notu: null, ertelendi: 0,
  gecikti: (durum === "sirada" || durum === "yapiliyor") && teslim < BUGUN, kacti_kayit: durum === "kacti",
  bitti_zaman: durum === "bitti" ? BUGUN + "T10:00:00Z" : null, olusturuldu: "2026-11-01T00:00:00Z", ...ek,
});
const pano: Pano = {
  bugun: BUGUN,
  ben: { id: "ben", tam_yetki: false, yonettikleri: ["tasarim"], rol: null },
  ayarlar: { kacti_esigi: 3, aylik_acik_is: 2, donem_baslangic: "2026-09-01" },
  sinav: SINAV,
  ekipler: [{ kod: "cekirdek", ad: "Çekirdek" }, { kod: "etkinlik", ad: "Etkinlik" }, { kod: "tasarim", ad: "Tasarım" }],
  roller: [],
  kadro: [],
  isler: [
    is_("tasarim", "ben", "2026-11-25"),
    is_("tasarim", "ali", "2026-11-14", "yapiliyor"),      // gecikti
    is_("tasarim", "ben", "2026-11-19", "onayda"),
    is_("tasarim", "ali", "2026-11-10", "bitti"),
    is_("etkinlik", "can", "2026-11-12", "kacti"),
    is_("etkinlik", "can", "2026-11-18"),
  ],
};
let g = panoyuDuzenle(pano, { kim: "hepsi", ekip: "hepsi", bitenler: false });
bekle("biten ve kaçan gizli; boş ekip grubu yok", g.length === 2 && g.every((x) => x.isler.every((i) => i.durum !== "bitti" && i.durum !== "kacti")),
  js(g.map((x) => [x.ekip.kod, x.isler.map((i) => i.durum)])));
bekle("ekipler sabit sırada (Etkinlik, Tasarım)", js(g.map((x) => x.ekip.kod)) === js(["etkinlik", "tasarim"]));
bekle("geciken iş en üstte, sonra teslime göre",
  js(g[1].isler.map((i) => i.teslim)) === js(["2026-11-14", "2026-11-19", "2026-11-25"]));
g = panoyuDuzenle(pano, { kim: "benim", ekip: "hepsi", bitenler: false });
bekle("yalnızca benim işlerim", g.length === 1 && g[0].isler.every((i) => i.sahibi.id === "ben"));
g = panoyuDuzenle(pano, { kim: "hepsi", ekip: "etkinlik", bitenler: true });
bekle("ekip süzgeci + bitenler", g.length === 1 && g[0].isler.length === 2);
const oz = ekipOzetleri(pano);
bekle("ekip özeti: tasarım 3 açık, 1 geciken, 1 bu hafta biten",
  js(oz.tasarim) === js({ acik: 3, geciken: 1, biten: 1 }), js(oz.tasarim));

// ── Ana: Bugün ─────────────────────────────────────────────────────
const SIMDI = new Date(2026, 10, 17, 12, 0).getTime();     // 17 Kasım 12:00 (yerel)
const ustlenme = (tarih: string, durum: BenimUstlenmem["durum"] = "ustlendi"): BenimUstlenmem =>
  ({ is_id: 1, baslik: "Kayıt masası", tarih, saat: "13:30:00", sure_saat: 1, durum, xp: 30 });
const temel = { simdi: SIMDI, etkinlikler: [], ozet: [], sinav: null, cuzdan: [] };

let b = bugunListesi({ ...temel, ekip: { ustlenmeler: [ustlenme(BUGUN)], isler: [] } });
bekle("bugünkü gönüllü işi Bugün'de", b[0]?.tur === "gonullu" && b[0].tur === "gonullu" && b[0].fark === 0);
bekle("durum cümlesi gönüllü işini söyler", durumCumlesi(b, SIMDI) === "Bugün üstlendiğin bir gönüllü işi var.");
b = bugunListesi({ ...temel, ekip: { ustlenmeler: [ustlenme("2026-11-20")], isler: [] } });
bekle("3 gün sonraki gönüllü işi Bugün'e girmez", b.length === 0);
b = bugunListesi({ ...temel, ekip: { ustlenmeler: [ustlenme(BUGUN, "teslim")], isler: [] } });
bekle("'Yaptım' denmiş iş Bugün'de değil", b.length === 0);
b = bugunListesi({ ...temel, ekip: { ustlenmeler: [], isler: [is_("tasarim", "ben", "2026-11-15"), is_("tasarim", "ben", "2026-11-18")] } });
bekle("geciken pano işi önce, diğer sayısıyla",
  b[0]?.tur === "ekip_isi" && b[0].tur === "ekip_isi" && b[0].fark === -2 && b[0].digerleri === 1, js(b));
bekle("durum cümlesi gecikmeyi söyler", durumCumlesi(b, SIMDI) === "Ekip panosunda geciken bir işin var.");
b = bugunListesi({ ...temel, ekip: { ustlenmeler: [], isler: [is_("tasarim", "ben", "2026-11-30")] } });
bekle("uzak teslimli iş Bugün'e girmez", b.length === 0);
b = bugunListesi({ ...temel, ekip: { ustlenmeler: [], isler: [is_("tasarim", "ben", "2026-11-18", "onayda")] } });
bekle("onaydaki iş Bugün'de değil (top liderde)", b.length === 0);
b = bugunListesi({ ...temel, ekip: null });
bekle("ekip modülü yoksa liste bozulmaz", b.length === 0);

console.log(`\n${adet - hata}/${adet} geçti`);
process.exit(hata ? 1 : 0);
