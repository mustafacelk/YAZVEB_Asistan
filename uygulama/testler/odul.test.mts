// Ödül sistemi istemci testleri:  npm run test:odul
//
// En önemlisi QR gidiş-dönüşü: yönetim panelinin ürettiği QR matrisi
// piksele çevrilir ve tarayıcının kullandığı çözücüyle (jsQR) geri okunur.
// "QR ekranda güzel görünüyor" yetmez; telefonda okunduğu kanıtlanmalı.

import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import { randomBytes } from "node:crypto";
import { kisaKodSadelestir, yazvebKoduMu } from "../src/odul/qr.ts";
import { hedefCumlesi, seviyeIlerlemesi, sonKullanimEtiketi, sonrakiAdim } from "../src/veri/odul_bicim.ts";

let hata = 0;
let adet = 0;
function bekle(ad: string, kosul: boolean, ayrinti = "") {
  adet++;
  if (!kosul) hata++;
  console.log(kosul ? "✓" : "✗", ad, kosul ? "" : ayrinti);
}

/** Sunucudaki odul.token() ile aynı biçim: 24 rastgele bayt → 32 karakter base64url. */
const token = () => randomBytes(24).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

/** QrSvg ile aynı matris + 4 modül sessiz alan, modül başına `olcek` piksel. */
function qrPiksel(icerik: string, olcek = 6) {
  const qr = qrcode(0, "M");
  qr.addData(icerik);
  qr.make();
  const n = qr.getModuleCount() + 8;
  const boyut = n * olcek;
  const veri = new Uint8ClampedArray(boyut * boyut * 4).fill(255);
  for (let y = 0; y < n - 8; y++) {
    for (let x = 0; x < n - 8; x++) {
      if (!qr.isDark(y, x)) continue;
      for (let dy = 0; dy < olcek; dy++) {
        for (let dx = 0; dx < olcek; dx++) {
          const i = (((y + 4) * olcek + dy) * boyut + (x + 4) * olcek + dx) * 4;
          veri[i] = veri[i + 1] = veri[i + 2] = 0;
        }
      }
    }
  }
  return { veri, boyut };
}

// ── QR gidiş-dönüş ────────────────────────────────────────────────
for (const [tur, onek] of [["görev", "YAZVEB:G:"], ["sponsor", "YAZVEB:S:"]] as const) {
  let dogru = 0;
  const deneme = 25;
  for (let i = 0; i < deneme; i++) {
    const icerik = onek + token();
    const { veri, boyut } = qrPiksel(icerik);
    const okunan = jsQR(veri, boyut, boyut)?.data;
    if (okunan === icerik) dogru++;
  }
  bekle(`${tur} QR'leri üretilip geri okunuyor (${deneme} rastgele token)`, dogru === deneme, `${dogru}/${deneme}`);
}
{
  // Küçük basılmış / uzaktan okunan QR: modül başına 3 piksel.
  const icerik = "YAZVEB:G:" + token();
  const { veri, boyut } = qrPiksel(icerik, 3);
  bekle("küçük ölçekte (3 px/modül) de okunuyor", jsQR(veri, boyut, boyut)?.data === icerik);
}

// ── İçerik sınıflandırma ──────────────────────────────────────────
const t = token();
bekle("görev QR'si tanınır", yazvebKoduMu("YAZVEB:G:" + t) === "gorev");
bekle("sponsor QR'si tanınır", yazvebKoduMu("YAZVEB:S:" + t) === "sponsor");
bekle("baş/son boşluk tolere edilir", yazvebKoduMu("  YAZVEB:S:" + t + "\n") === "sponsor");
bekle("yabancı QR (menü linki) sunucuya gönderilmez", yazvebKoduMu("https://kafe.example/menu") === null);
bekle("sahte önek + kısa token reddedilir", yazvebKoduMu("YAZVEB:G:abc") === null);
bekle("fazladan içerik eklenmiş token reddedilir", yazvebKoduMu("YAZVEB:G:" + t + "<script>") === null);

// ── Kısa kod sadeleştirme ─────────────────────────────────────────
bekle("küçük harf ve tire", kisaKodSadelestir(" yaz-25 ") === "YAZ25");
bekle("boşluk ve noktalama silinir", kisaKodSadelestir("a7k 9p!") === "A7K9P");
bekle("10 karakterle kırpılır", kisaKodSadelestir("ABCDEFGHIJKLMNOP") === "ABCDEFGHIJ");
bekle("SQL/HTML karakterleri silinir", kisaKodSadelestir("YAZ'25;<b>") === "YAZ25B");

// ── İlerleme dili ─────────────────────────────────────────────────
const k = { acik: false, gerekli_xp: 500, gerekli_seviye: null, gerekli_etkinlik: 0, eksik_xp: 120, eksik_etkinlik: 0 };
bekle("hedef cümlesi: XP", hedefCumlesi({ ...k, sponsor: "Coffee Lab" }) === "Coffee Lab kilidine 120 XP kaldı.");
bekle("hedef cümlesi: etkinlik", hedefCumlesi({ ...k, eksik_xp: 0, eksik_etkinlik: 2, sponsor: "X" }) === "X kilidine 2 etkinlik kaldı.");
bekle("hedef cümlesi: ikisi birden", hedefCumlesi({ ...k, eksik_etkinlik: 1, sponsor: "X" }) === "X kilidine 120 XP ve 1 etkinlik kaldı.");
bekle("hedef yoksa null", hedefCumlesi(null) === null);
bekle("binlik ayraç Türkçe", hedefCumlesi({ ...k, eksik_xp: 1250, sponsor: "X" }) === "X kilidine 1.250 XP kaldı.");

const sv = { sira: 2, ad: "EXPLORER", esik: 250, ikon: "", sonraki: { ad: "BUILDER", esik: 500 } };
bekle("seviye ilerlemesi yarı yolda 0.5", seviyeIlerlemesi(375, sv) === 0.5);
bekle("seviye ilerlemesi eşik altında 0", seviyeIlerlemesi(100, sv) === 0);
bekle("en üst seviyede 1", seviyeIlerlemesi(9999, { ...sv, sonraki: null }) === 1);

// ── Bir sonraki adım ──────────────────────────────────────────────
const svB = { sira: 2, ad: "EXPLORER", esik: 250, ikon: "", sonraki: { ad: "BUILDER", esik: 500 } };
const kilitK = (eksik: number, sponsor = "Coffee Lab", gerekli = 450, eksikEtk = 0) =>
  ({ acik: false, gerekli_xp: gerekli, gerekli_seviye: null, gerekli_etkinlik: 0, eksik_xp: eksik, eksik_etkinlik: eksikEtk, sponsor, id: "x" });
const pr = (xp: number, kilit: ReturnType<typeof kilitK> | null, etk = 3) =>
  ({ xp, etkinlik_sayisi: etk, seviye: svB, sonraki_kilit: kilit, toplam_sponsor: 2 });

{
  const a = sonrakiAdim(pr(420, kilitK(30)));
  bekle("sponsor seviyeden yakın: ana cümle sponsor", a.ana === "Coffee Lab kilidine 30 XP kaldı." && a.ikincil === "BUILDER seviyesine 80 XP.", JSON.stringify(a));
}
{
  const a = sonrakiAdim(pr(420, kilitK(180, "Kitapçı", 600)));
  bekle("seviye sponsordan yakın: ana cümle seviye", a.ana === "BUILDER seviyesine 80 XP kaldı." && a.ikincil === "Kitapçı kilidine 180 XP.", JSON.stringify(a));
}
{
  const a = sonrakiAdim(pr(420, kilitK(80, "Kitapçı", 500)));
  bekle("aynı eşik: aynı anda seviye", a.ana === "Kitapçı kilidine 80 XP kaldı." && a.ikincil === "Aynı anda BUILDER seviyesine çıkarsın.", JSON.stringify(a));
}
{
  const a = sonrakiAdim(pr(420, kilitK(0, "Kitapçı", 400, 2)));
  bekle("yalnız etkinlik eksik", a.ana === "Kitapçı için 2 etkinliğe daha katıl.", JSON.stringify(a));
}
{
  const a = sonrakiAdim({ ...pr(0, kilitK(450), 0) });
  bekle("sıfır puan: ilk adım + neyin açılacağı", a.ana.startsWith("İlk etkinliğinde") && a.ikincil === "450 XP'de Coffee Lab kilidi açılıyor.", JSON.stringify(a));
}
{
  const a = sonrakiAdim({ ...pr(9999, null), seviye: { ...svB, sonraki: null } });
  bekle("en üst seviye, kilit kalmadı", a.ana === "En üst seviyedesin." && a.ikincil === "Bütün sponsor kilitleri açık.", JSON.stringify(a));
}

// ── Son kullanım ──────────────────────────────────────────────────
const simdi = Date.parse("2026-09-17T12:00:00Z");
const sonra = (saat: number) => new Date(simdi + saat * 3_600_000).toISOString();
bekle("uzak son kullanım: etiket yok", sonKullanimEtiketi(sonra(24 * 10), simdi) === null);
bekle("3 gün içinde: gün sayısı", sonKullanimEtiketi(sonra(50), simdi) === "3 gün kaldı");
bekle("24 saatten az", sonKullanimEtiketi(sonra(5), simdi) === "Son 24 saat");
bekle("geçmiş: etiket yok (süresi doldu ayrıca gösterilir)", sonKullanimEtiketi(sonra(-1), simdi) === null);

console.log(`\n${adet - hata}/${adet} geçti`);
process.exit(hata ? 1 : 0);
