// Ödül sistemi istemci testleri:  npm run test:odul
//
// En önemlisi QR gidiş-dönüşü: yönetim panelinin ürettiği QR matrisi
// piksele çevrilir ve tarayıcının kullandığı çözücüyle (jsQR) geri okunur.
// "QR ekranda güzel görünüyor" yetmez; telefonda okunduğu kanıtlanmalı.

import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import { randomBytes } from "node:crypto";
import { kisaKodSadelestir, yazvebKoduMu } from "../src/odul/qr.ts";
import { hedefCumlesi, seviyeIlerlemesi } from "../src/veri/odul_bicim.ts";

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

console.log(`\n${adet - hata}/${adet} geçti`);
process.exit(hata ? 1 : 0);
