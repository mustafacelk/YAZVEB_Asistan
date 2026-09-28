// Bilgi mimarisi — saf mantık:  npm run test:gezinme
//
// Eski adlar yeni dünyalara doğru mu gidiyor, "Bugün" en fazla üç şeyi doğru
// sırayla mı gösteriyor, QR şeridi yalnızca gerektiğinde mi çıkıyor, Türkçe
// "I" aynı dersi ikiye bölüyor mu?

import { rotaAnahtari, rotaKur, UST_SEKME } from "../src/veri/gezinme.ts";
import { bugunListesi, canliEtkinlik, durumCumlesi } from "../src/veri/bugun.ts";
import { dersKimligi, dersleriGrupla, dersNormal, dersUyar } from "../src/veri/pano_bicim.ts";
import type { Etkinlik } from "../src/veri/supabase.ts";
import type { KazanimOzeti } from "../src/veri/odul.ts";

let hata = 0;
let adet = 0;
function bekle(ad: string, kosul: boolean, ayrinti = "") {
  adet++;
  if (!kosul) hata++;
  console.log(kosul ? "✓" : "✗", ad, kosul ? "" : ayrinti);
}
const js = (x: unknown) => JSON.stringify(x);

// ── Rotalar ────────────────────────────────────────────────────────
bekle("eski 'odul' üyede Ben'e gider", js(rotaKur("odul", { bolum: "sponsorlar" })) === js({ g: "ben", ben: "sponsorlar" }));
bekle("eski 'odul' yönetimde Yönetim'e gider", js(rotaKur("odul", { yonetim: "gorevler" }, true)) === js({ g: "yonetim", yonetim: "gorevler" }));
bekle("eski 'notlar' Akademi'ye gider", rotaKur("notlar").g === "akademi");
bekle("asistan sorusunu taşır", rotaKur("asistan", { soru: "Merhaba" }).soru === "Merhaba");
bekle("ders rotası dersi taşır", rotaKur("akademi", { ders: { kod: "BM 203", ad: "Veri", kurum: "selcuk.edu.tr" } }).ders?.kod === "BM 203");
bekle("soru ekranı değiştirmez (aynı anahtar)", rotaAnahtari({ g: "asistan", soru: "a" }) === rotaAnahtari({ g: "asistan", soru: "b" }));
bekle("farklı ders farklı ekran", rotaAnahtari({ g: "akademi", ders: { kod: "A", ad: "x" } }) !== rotaAnahtari({ g: "akademi", ders: { kod: "B", ad: "x" } }));
bekle("Ben alt sayfası farklı ekran", rotaAnahtari({ g: "ben" }) !== rotaAnahtari({ g: "ben", ben: "oduller" }));
bekle("sohbet Topluluk sekmesinde, asistan Ana'da", UST_SEKME.sohbet === "topluluk" && UST_SEKME.asistan === "ana");

// ── Bugün ─────────────────────────────────────────────────────────
const SIMDI = new Date("2026-09-28T12:00:00+03:00").getTime();
const saat = (h: number) => new Date(SIMDI + h * 3_600_000).toISOString();
const etk = (id: number, bas: number, baslik = "E" + id): Etkinlik =>
  ({ id, baslik, aciklama: null, yer: null, baslangic: saat(bas), bitis: null, ekleyen: "x", baskan_kilidi: false, olusturuldu: "", guncellendi: "" }) as unknown as Etkinlik;
const odulO = (gun: number): KazanimOzeti =>
  ({ id: "k" + gun, sponsor: "Kafe", baslik: "Kahve", ikon: "kahve", durum: "aktif", zaman: saat(-48), son_kullanma: saat(gun * 24) }) as unknown as KazanimOzeti;
const sinav = { sinav: { id: 1, ad: "Vize", baslangic: "", bitis: "", asama: "yaklasiyor" as const, gun: 10 }, bolum: "BM", bolum_notlari: 4 };

let b = bugunListesi({ simdi: SIMDI, etkinlikler: [etk(1, -1), etk(2, 30)], ozet: [{ etkinlik_id: 1, puan: 100, katildi: false }], sinav, cuzdan: [odulO(10)] });
bekle("süren etkinlik en üstte, canlı", b[0].tur === "etkinlik" && b[0].canli && b[0].etkinlik.id === 1, js(b.map((x) => x.tur)));
bekle("en fazla üç öğe", b.length === 3);
bekle("acil olmayan ödül sınavdan sonra", js(b.map((x) => x.tur)) === js(["etkinlik", "sinav", "odul"]));
b = bugunListesi({ simdi: SIMDI, etkinlikler: [etk(2, 30)], ozet: [], sinav: null, cuzdan: [odulO(1)] });
bekle("süresi 3 gün içinde dolan ödül yaklaşan etkinliğin önünde", js(b.map((x) => x.tur)) === js(["odul", "etkinlik"]));
b = bugunListesi({ simdi: SIMDI, etkinlikler: [etk(3, 24 * 9)], ozet: [], sinav: null, cuzdan: [] });
bekle("7 günden uzak etkinlik Bugün'e girmez", b.length === 0);
bekle("boşsa sakin cümle", durumCumlesi([], SIMDI) === "Bugün sakin.");
b = bugunListesi({ simdi: SIMDI, etkinlikler: [etk(4, 3)], ozet: [], sinav: null, cuzdan: [] });
bekle("bugünkü etkinlik cümlesi", durumCumlesi(b, SIMDI) === "Bugün bir etkinlik var.");
b = bugunListesi({ simdi: SIMDI, etkinlikler: [etk(5, -1)], ozet: [{ etkinlik_id: 5, puan: 50, katildi: true }], sinav, cuzdan: [] });
bekle("katıldığın süren etkinlik sınavdan sonra gelir", js(b.map((x) => x.tur)) === js(["sinav", "etkinlik"]));

// ── Canlı QR şeridi ────────────────────────────────────────────────
bekle("süren, puanlı, okutulmamış → şerit", canliEtkinlik([etk(1, -1)], [{ etkinlik_id: 1, puan: 100, katildi: false }], SIMDI)?.puan === 100);
bekle("okutulmuşsa şerit yok", canliEtkinlik([etk(1, -1)], [{ etkinlik_id: 1, puan: 100, katildi: true }], SIMDI) === null);
bekle("puansız etkinlikte şerit yok", canliEtkinlik([etk(1, -1)], [{ etkinlik_id: 1, puan: 0, katildi: false }], SIMDI) === null);
bekle("başlamamış etkinlikte şerit yok", canliEtkinlik([etk(1, 2)], [{ etkinlik_id: 1, puan: 100, katildi: false }], SIMDI) === null);
bekle("3 saati geçen (bitişsiz) etkinlikte şerit yok", canliEtkinlik([etk(1, -4)], [{ etkinlik_id: 1, puan: 100, katildi: false }], SIMDI) === null);

// ── Dersler: Türkçe I ──────────────────────────────────────────────
bekle("OLASILIK = Olasılık = olasilik", dersNormal("OLASILIK") === dersNormal("Olasılık") && dersNormal("olasilik") === dersNormal("Olasılık"));
bekle("İNGİLİZCE = İngilizce = ingilizce", dersNormal("İNGİLİZCE") === dersNormal("İngilizce") && dersNormal("ingilizce") === dersNormal("İngilizce"));
bekle("Introduction = INTRODUCTION", dersNormal("Introduction") === dersNormal("INTRODUCTION"));
bekle("fazla boşluk yok sayılır", dersNormal("  Veri   Yapıları ") === dersNormal("Veri Yapıları"));
bekle("farklı dersler ayrı kalır", dersNormal("Fizik I") !== dersNormal("Fizik II"));
bekle("kod büyük/küçük harf ve boşluk duyarsız", dersKimligi({ kod: "bm  203", ad: "x" }) === dersKimligi({ kod: "BM 203", ad: "y" }));
bekle("aynı kod farklı üniversite ayrı ders", dersKimligi({ kod: "MAT 101", ad: "x", kurum: "a.edu.tr" }) !== dersKimligi({ kod: "MAT 101", ad: "x", kurum: "b.edu.tr" }));

const not = (ad: string, kod: string | null, tur: "ders_notu" | "cikmis_cozum" | "ozet", kurum = "selcuk.edu.tr") => ({
  ders_kodu: kod, ders_adi: ad, kurum_alani: kurum, universite: "Selçuk", bolum: "BM", sinif: "2" as const, tur, yararli: 1, yayinlandi: "2026-09-2" + (ad.length % 9),
});
const gruplar = dersleriGrupla([
  not("Olasılık", null, "ozet"), not("OLASILIK", null, "cikmis_cozum"), not("Olasılık", null, "ders_notu"),
  not("Veri Yapıları", "BM 203", "ders_notu"), not("Veri yapilari", "BM 203", "ozet"),
  not("Olasılık", null, "ozet", "erbakan.edu.tr"),
]);
bekle("yedek gruplama: 3 ders (Olasılık ×2 üniversite, BM 203)", gruplar.length === 3, js(gruplar.map((g) => [g.ad, g.kurum, g.not])));
const olas = gruplar.find((g) => g.kurum === "selcuk.edu.tr" && g.kod === null);
bekle("yedek gruplama: en sık yazım gösterilir, sayımlar doğru", olas?.ad === "Olasılık" && olas.not === 3 && olas.cikmis === 1 && olas.ozet === 1);
const eşit = dersleriGrupla([not("OLASILIK", null, "ozet"), not("Olasılık", null, "ozet")]);
bekle("eşitlikte düzgün yazım (tamamı büyük harf değil)", eşit[0].ad === "Olasılık");
bekle("ders filtresi: ada göre Türkçe I duyarsız", dersUyar(not("OLASILIK", null, "ozet"), { kod: null, ad: "olasılık", kurum: "selcuk.edu.tr" }));
bekle("ders filtresi: başka üniversite eşleşmez", !dersUyar(not("Olasılık", null, "ozet", "erbakan.edu.tr"), { kod: null, ad: "Olasılık", kurum: "selcuk.edu.tr" }));
bekle("ders filtresi: kodlu ders adla eşleşmez", !dersUyar(not("Olasılık", "MAT 204", "ozet"), { kod: null, ad: "Olasılık", kurum: "selcuk.edu.tr" }));

console.log(`\n${adet - hata}/${adet} geçti`);
process.exit(hata ? 1 : 0);
