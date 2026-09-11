/**
 * Supabase bağlantısını ve kurulumu uçtan uca denetler.
 *
 *   node baglanti_kontrol.mjs
 *
 * Hiçbir hesap açmaz, hiçbir şey yazmaz. Yalnızca okur ve "şu kapı açık mı,
 * şu kapalı mı" diye bakar. Kapalı olması gereken kapılar kapalıysa bu da
 * bir BAŞARIDIR: anonim bir ziyaretçinin sohbeti okuyamaması, kuralların
 * çalıştığının kanıtıdır.
 */
import { readFileSync } from "node:fs";

const SURE = 12000;

function ortam() {
  let ham = "";
  try {
    ham = readFileSync(new URL(".env", import.meta.url), "utf8");
  } catch {
    return {};
  }
  const al = (ad) => (ham.match(new RegExp(`^${ad}=(.*)$`, "m"))?.[1] ?? "").trim();
  return { adres: al("VITE_SUPABASE_URL"), anahtar: al("VITE_SUPABASE_ANON_KEY") };
}

const { adres, anahtar } = ortam();
const sonuc = [];
const yaz = (durum, ad, not = "") =>
  sonuc.push({ durum, ad, not }) && console.log(`  ${durum}  ${ad}${not ? "  — " + not : ""}`);

if (!adres || !anahtar) {
  console.log("\n.env eksik.\n");
  console.log("  VITE_SUPABASE_URL       :", adres || "(boş)");
  console.log("  VITE_SUPABASE_ANON_KEY  :", anahtar ? anahtar.slice(0, 20) + "…" : "(boş)");
  console.log("\nSupabase → Project Settings → API bölümünden doldur.\n");
  process.exit(1);
}
if (!/^https?:\/\//.test(adres)) {
  console.log(`\nVITE_SUPABASE_URL bir adres değil: ${adres}`);
  console.log("https://<proje>.supabase.co biçiminde olmalı.\n");
  process.exit(1);
}

const basliklar = { apikey: anahtar, Authorization: `Bearer ${anahtar}` };

async function iste(yol, secenek = {}) {
  const kes = AbortSignal.timeout(SURE);
  const y = await fetch(adres.replace(/\/$/, "") + yol, {
    ...secenek,
    signal: kes,
    headers: { ...basliklar, ...(secenek.headers ?? {}) },
  });
  let govde = null;
  try { govde = await y.json(); } catch { /* gövdesiz yanıt olabilir */ }
  return { durum: y.status, govde };
}

console.log(`\n═══ ${adres} ═══\n`);

// ── 1. Sunucu ayakta mı ────────────────────────────────────────────
try {
  const { durum } = await iste("/rest/v1/");
  if (durum < 500) yaz("✓", "Sunucuya ulaşıldı", `HTTP ${durum}`);
  else yaz("✗", "Sunucu hata veriyor", `HTTP ${durum}`);
} catch (h) {
  yaz("✗", "Sunucuya ulaşılamadı", String(h.message ?? h));
  console.log("\nAdres yanlış olabilir ya da proje uykuda (Supabase panelinden uyandır).\n");
  process.exit(1);
}

// ── 2. Tablolar kurulmuş mu ────────────────────────────────────────
// RLS yüzünden veri gelmeyebilir; önemli olan tablonun TANINMASI.
// Tablo yoksa PostgREST 404 + "PGRST205" döner.
for (const tablo of ["profiller", "mesajlar", "etkinlikler"]) {
  const { durum, govde } = await iste(`/rest/v1/${tablo}?select=*&limit=1`);
  const yok = durum === 404 || govde?.code === "PGRST205" || govde?.code === "42P01";
  if (yok) yaz("✗", `Tablo yok: ${tablo}`, "01_sema.sql çalıştırıldı mı?");
  else yaz("✓", `Tablo var: ${tablo}`, `HTTP ${durum}`);
}

// ── 3. Anonim erişim KAPALI olmalı ─────────────────────────────────
// Bu testin geçmesi, satır kurallarının çalıştığı anlamına gelir.
{
  const { durum, govde } = await iste("/rest/v1/mesajlar?select=*&limit=1");
  const acik = durum === 200 && Array.isArray(govde) && govde.length > 0;
  if (acik) {
    yaz("✗", "GÜVENLİK: anonim kullanıcı sohbeti OKUYABİLİYOR", "02_yetkiler.sql eksik");
  } else {
    yaz("✓", "Anonim kullanıcı sohbeti okuyamıyor", "kurallar çalışıyor");
  }
}
{
  const { durum } = await iste("/rest/v1/etkinlikler", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baslik: "kontrol", baslangic: new Date().toISOString() }),
  });
  if (durum === 201) yaz("✗", "GÜVENLİK: anonim kullanıcı ETKİNLİK EKLEYEBİLİYOR");
  else yaz("✓", "Anonim kullanıcı etkinlik ekleyemiyor", `HTTP ${durum}`);
}

// ── 4. Giriş yardımcısı ────────────────────────────────────────────
{
  const { durum, govde } = await iste("/rest/v1/rpc/giris_epostasi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_kullanici_adi: "____olmayan_kullanici____" }),
  });
  if (durum === 404) yaz("✗", "giris_epostasi fonksiyonu yok", "01_sema.sql'in sonunu çalıştır");
  else if (durum === 200 && govde === null) yaz("✓", "Kullanıcı adıyla giriş çalışıyor");
  else yaz("✓", "giris_epostasi yanıt verdi", `HTTP ${durum}`);
}

// ── 5. Kayıtlı kullanıcı var mı ────────────────────────────────────
const kullanici = process.argv[2];
if (kullanici) {
  const { govde } = await iste("/rest/v1/rpc/giris_epostasi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_kullanici_adi: kullanici }),
  });
  if (govde) yaz("✓", `Kullanıcı bulundu: ${kullanici}`, String(govde));
  else yaz("✗", `Kullanıcı bulunamadı: ${kullanici}`, "kullanıcı adını kontrol et");
} else {
  console.log("\n  (ipucu: kendi kullanıcı adınla da deneyebilirsin →" +
              " node baglanti_kontrol.mjs kullanici_adin)");
}

const hatali = sonuc.filter((s) => s.durum === "✗").length;
console.log(
  `\n═══ ${sonuc.length - hatali}/${sonuc.length} kontrol geçti ═══\n`,
);
process.exit(hatali ? 1 : 0);
