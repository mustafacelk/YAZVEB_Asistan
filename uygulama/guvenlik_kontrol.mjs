/**
 * Üretim paketinde gizli anahtar var mı?
 *
 *   node guvenlik_kontrol.mjs        (npm run build sonrası)
 *
 * Yayına çıkmadan önce çalıştırılır. Web paketi herkese açıktır: içine
 * yanlışlıkla konan bir "secret"/"service_role" anahtarı, veritabanının
 * bütün kurallarını atlayan bir ana anahtar demektir — satır güvenliği
 * onu bağlamaz. Bu yüzden ayrı bir kapı.
 *
 * Yalnızca DEĞER arar, kelime değil: "sb_secret_" yazan bir uyarı metni
 * sızıntı değildir; "sb_secret_" + gerçek karakterler sızıntıdır.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const KOK = new URL("dist", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function dosyalar(klasor) {
  const cikti = [];
  for (const ad of readdirSync(klasor)) {
    const yol = join(klasor, ad);
    if (statSync(yol).isDirectory()) cikti.push(...dosyalar(yol));
    else if (/\.(js|css|html|json|map)$/.test(ad)) cikti.push(yol);
  }
  return cikti;
}

const KALIPLAR = [
  // Yeni biçim gizli anahtar: sb_secret_ + en az 16 karakter
  { ad: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  // Eski biçim: JWT ve içinde service_role rolü
  { ad: "service_role JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    dogrula: (d) => {
      try {
        return JSON.parse(Buffer.from(d.split(".")[1], "base64").toString()).role === "service_role";
      } catch { return false; }
    } },
  { ad: "Google API anahtarı", re: /AIza[A-Za-z0-9_-]{30,}/g },
  { ad: "OpenAI anahtarı", re: /sk-[A-Za-z0-9]{32,}/g },
];

// Sunucuya ait olup tarayıcı paketinde HİÇ geçmemesi gereken izler. Değer
// değil ad: bunlardan biri görünüyorsa sunucu kodu yanlışlıkla pakete
// girmiş demektir (bir sonraki adım anahtarın kendisinin sızmasıdır).
const SUNUCU_IZLERI = [
  "GOOGLE_API_KEY",
  "SUPABASE_SERVICE_ROLE",
  "x-goog-api-key",
  "generativelanguage.googleapis.com",
  "TrustedClientToken",
  "IZINLI_KOKENLER",
];

let bulgu = 0;
let liste;
try {
  liste = dosyalar(KOK);
} catch {
  console.log("\ndist/ yok — önce `npm run build` çalıştır.\n");
  process.exit(1);
}

for (const yol of liste) {
  const icerik = readFileSync(yol, "utf8");
  for (const { ad, re, dogrula } of KALIPLAR) {
    for (const eslesme of icerik.match(re) ?? []) {
      if (dogrula && !dogrula(eslesme)) continue;
      console.log(`  ✗ ${ad}: ${eslesme.slice(0, 24)}…  (${yol.split(/[\\/]/).pop()})`);
      bulgu++;
    }
  }
}

for (const yol of liste) {
  if (yol.endsWith(".map")) {
    console.log(`  ✗ Kaynak haritası yayında: ${yol.split(/[\\/]/).pop()} (kaynak kodu ve yolları açığa çıkarır)`);
    bulgu++;
    continue;
  }
  const icerik = readFileSync(yol, "utf8");
  for (const iz of SUNUCU_IZLERI) {
    if (icerik.includes(iz)) {
      console.log(`  ✗ Sunucu kodu izi pakette: "${iz}" (${yol.split(/[\\/]/).pop()})`);
      bulgu++;
    }
  }
}

// CSP: sayfada olmalı ve gevşetilmemiş olmalı.
{
  const html = readFileSync(join(KOK, "index.html"), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  if (!csp) {
    console.log("  ✗ index.html'de Content-Security-Policy yok");
    bulgu++;
  } else {
    for (const yasak of ["'unsafe-inline'", "'unsafe-eval'", "*"]) {
      const parcalar = csp.split(";").map((p) => p.trim().split(/\s+/));
      if (parcalar.some((p) => p.slice(1).includes(yasak))) {
        console.log(`  ✗ CSP gevşetilmiş: ${yasak}`);
        bulgu++;
      }
    }
    if (!/script-src 'self'(;|$)/.test(csp)) {
      console.log("  ✗ CSP script-src yalnızca 'self' olmalı");
      bulgu++;
    }
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) {
    console.log("  ✗ index.html'de satır içi <script> var (CSP bunu engeller ya da gevşetmeyi gerektirir)");
    bulgu++;
  }
}

console.log(
  bulgu
    ? `\n═══ ${bulgu} SIZINTI — yayına ÇIKMA, anahtarı iptal et ═══\n`
    : `\n═══ Temiz: ${liste.length} dosyada gizli anahtar yok ═══\n`,
);
process.exit(bulgu ? 1 : 0);
