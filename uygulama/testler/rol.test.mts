// Giriş türü ve yönetim paneli önceliği:  npm run test:rol
//
// İki soru: (1) seçilen giriş türü hesabın gerçek rolüyle çelişirse ne
// olur, (2) yönetici paneli açtığında neyi, hangi sırayla görür?

import { etkinGorunum } from "../src/veri/kip.ts";
import { dikkatListesi, etkinlikGorevleri, gorevIsliyor, odakEtkinlik } from "../src/yonetim/oncelik.ts";
import type { Etkinlik } from "../src/veri/supabase.ts";
import type { YGorev, YKampanya, YSponsor } from "../src/yonetim/veri.ts";

let hata = 0;
let adet = 0;
function bekle(ad: string, kosul: boolean, ayrinti = "") {
  adet++;
  if (!kosul) hata++;
  console.log(kosul ? "✓" : "✗", ad, kosul ? "" : ayrinti);
}

// ── Giriş türü × rol ──────────────────────────────────────────────
bekle("üye 'yönetici' seçerse üye görünümü + açıklama",
  etkinGorunum("yonetim", "uye").gorunum === "uye" && !!etkinGorunum("yonetim", "uye").uyari);
bekle("yönetici 'yönetici' seçerse yönetim", etkinGorunum("yonetim", "yonetici").gorunum === "yonetim");
bekle("başkan 'yönetici' seçerse yönetim", etkinGorunum("yonetim", "baskan").gorunum === "yonetim");
bekle("yönetici 'üye' seçerse üye (kendi tercihi)", etkinGorunum("uye", "yonetici").gorunum === "uye");
bekle("seçim yoksa yetkili yönetimle açılır", etkinGorunum(null, "baskan").gorunum === "yonetim");
bekle("seçim yoksa üye üyeyle açılır", etkinGorunum(null, "uye").gorunum === "uye");
bekle("rol henüz gelmediyse yönetim açılmaz", etkinGorunum("yonetim", null).gorunum === "uye");
bekle("uyumlu seçimde uyarı yok",
  etkinGorunum("uye", "uye").uyari === null && etkinGorunum("yonetim", "baskan").uyari === null);

// ── Panel önceliği ────────────────────────────────────────────────
const SIMDI = Date.parse("2026-10-01T12:00:00Z");
const saat = (h: number) => new Date(SIMDI + h * 3_600_000).toISOString();

const etkinlik = (id: number, baslik: string, bas: number, bitis: number | null = null): Etkinlik => ({
  id, baslik, aciklama: null, yer: null, baslangic: saat(bas), bitis: bitis === null ? null : saat(bitis),
  ekleyen: "x", baskan_kilidi: false, olusturuldu: saat(-100), guncellendi: saat(-100),
});
const gorev = (id: number, etkinlik_id: number | null, bas: number, bit: number, ek: Partial<YGorev> = {}): YGorev => ({
  id, etkinlik_id, etkinlik: null, baslik: "Görev " + id, aciklama: null, tur: "giris", token: "t", kisa_kod: "K" + id,
  puan: 50, baslangic: saat(bas), bitis: saat(bit), kisi_basi_limit: 1, toplam_limit: null, kullanim_sayisi: 0,
  aktif: true, dinamik: true, iptal: null, enlem: null, boylam: null, yaricap_m: null, baskan_kilidi: false,
  duzenlenebilir: true, ...ek,
});
const kampanya = (ad: string, kalanlar: (number | null)[], bitis = 24 * 10, ek: Partial<YKampanya> = {}): YKampanya => ({
  id: ad, ad, token: "t", kisa_kod: "K", baslangic: saat(-24), bitis: saat(bitis), aktif: true, iptal: null,
  kisi_basi_limit: 1, surpriz: true, gecerlilik_gun: 30, baskan_kilidi: false, duzenlenebilir: true,
  kazanim: 0, kullanim: 0,
  oduller: kalanlar.map((k, i) => ({ id: ad + i, baslik: "Ö" + i, tur: "urun", ikon: "hediye", aciklama: null,
    toplam: k === null ? null : Math.max(k, 5), kalan: k, agirlik: 1 })),
  ...ek,
});
const sponsor = (ad: string, pin: boolean, kampanyalar: YKampanya[], aktif = true): YSponsor => ({
  id: ad, ad, aciklama: null, logo: null, website: null, adres: null, gerekli_xp: 0, gerekli_seviye_id: null,
  gerekli_etkinlik: 0, aktif, siralama: 0, pin_tanimli: pin, baskan_kilidi: false, duzenlenebilir: true, kampanyalar,
});

{
  const suren = etkinlik(1, "Atölye", -1, 2);
  const yarin = etkinlik(2, "Söyleşi", 20);
  const gelecekHafta = etkinlik(3, "Konferans", 24 * 5);
  const uzak = etkinlik(4, "Bahar şenliği", 24 * 30);
  const gecmis = etkinlik(5, "Eski", -30, -27);
  const liste = [uzak, gecmis, gelecekHafta, yarin, suren];

  bekle("odak: süren etkinlik gelecektekilerden önce", odakEtkinlik(liste, SIMDI)?.id === 1);
  bekle("odak: süren yoksa en yakın gelecek", odakEtkinlik([uzak, yarin, gecmis], SIMDI)?.id === 2);
  bekle("odak: bitişi yazılmamış etkinlik 3 saat sürüyor sayılır",
    odakEtkinlik([etkinlik(9, "Bitişsiz", -2)], SIMDI)?.id === 9 && odakEtkinlik([etkinlik(9, "Bitişsiz", -4)], SIMDI) === null);
  bekle("görev işliyor: aktif, iptalsiz, süresi içinde",
    gorevIsliyor(gorev(1, 1, -1, 1), SIMDI) && !gorevIsliyor(gorev(2, 1, 1, 3), SIMDI)
    && !gorevIsliyor(gorev(3, 1, -1, 1, { iptal: saat(-1) }), SIMDI) && !gorevIsliyor(gorev(4, 1, -1, 1, { aktif: false }), SIMDI));

  const gorevler = [gorev(10, 3, 24 * 5, 24 * 5 + 3)];   // yalnızca konferansın görevi var
  const d = dikkatListesi(liste, gorevler, [], SIMDI);
  const basliklar = d.map((x) => x.baslik);
  bekle("süren ve yarınki etkinlik görevsiz → ŞİMDİ önemiyle",
    d.filter((x) => x.onem === 0 && x.eylem === "gorev").length === 2, JSON.stringify(basliklar));
  bekle("görevi olan etkinlik listede yok", !basliklar.some((b) => b.includes("Konferans")));
  bekle("30 gün sonraki ve geçmiş etkinlik listede yok",
    !basliklar.some((b) => b.includes("şenlik") || b.includes("Eski")));
  bekle("süren etkinlik yarınkinden önce sıralanır", d[0].baslik.includes("Atölye"), JSON.stringify(basliklar));
  bekle("etkinlikGorevleri bitmiş görevi saymaz",
    etkinlikGorevleri(suren, [gorev(20, 1, -5, -2)], SIMDI).length === 0);
}
{
  const d = dikkatListesi([], [], [
    sponsor("Kahveci", false, [kampanya("Kahve", [5])]),
    sponsor("Kitapçı", true, [kampanya("Kitap", [0, 0])]),
    sponsor("Fırın", true, [kampanya("Poğaça", [2])]),
    sponsor("Sınırsız", true, [kampanya("İndirim", [null, 0])]),
    sponsor("Boş", true, []),
    sponsor("Pasif", false, [], false),
    sponsor("Biten", true, [kampanya("Son gün", [4], 24)]),
  ], SIMDI);
  const bul = (p: string) => d.find((x) => x.baslik.startsWith(p));
  bekle("PIN'siz ve kampanyası işleyen sponsor → ŞİMDİ", bul("PIN yok: Kahveci")?.onem === 0);
  bekle("stok bitti → bu hafta", bul("Stok bitti: Kitapçı")?.onem === 1);
  bekle("stok 3 ve altı → bu hafta, kalan söylenir", bul("Stok azaldı: Fırın")?.onem === 1 && bul("Stok azaldı: Fırın")!.ayrinti.includes("2"));
  bekle("sınırsız kalemli kampanya stok uyarısı vermez", !d.some((x) => x.baslik.includes("Sınırsız")));
  bekle("kampanyasız aktif sponsor → bilgi", bul("Aktif kampanya yok: Boş")?.onem === 2);
  bekle("pasif sponsor hiç listelenmez", !d.some((x) => x.baslik.includes("Pasif")));
  bekle("3 gün içinde biten kampanya → bilgi", bul("Kampanya bitiyor: Biten")?.onem === 2);
  bekle("sıra önem düzeninde (0 → 1 → 2)", d.every((x, i) => i === 0 || d[i - 1].onem <= x.onem));
  bekle("stoku biten kampanyaya ayrıca 'bitiyor' denmez",
    !d.some((x) => x.baslik === "Kampanya bitiyor: Kitapçı · Kitap"));
}
{
  // Süren etkinliğin sabit kodlu görevi: paylaşılırsa dışarıdan okutulur.
  const suren = etkinlik(1, "Atölye", -1, 2);
  const d = dikkatListesi([suren], [gorev(1, 1, -1, 2, { dinamik: false })], [], SIMDI);
  bekle("süren etkinlikte sabit kodlu görev → bilgi", d.length === 1 && d[0].onem === 2 && d[0].baslik.startsWith("Sabit kod"));
  const d2 = dikkatListesi([suren], [gorev(1, 1, -1, 2, { dinamik: false, enlem: 38, boylam: 32, yaricap_m: 200 })], [], SIMDI);
  bekle("konum şartlı sabit görev uyarı vermez", d2.length === 0);
  bekle("her şey yolundaysa liste boş", dikkatListesi([suren], [gorev(1, 1, -1, 2)], [], SIMDI).length === 0);
}

console.log(`\n${adet - hata}/${adet} geçti`);
process.exit(hata ? 1 : 0);
