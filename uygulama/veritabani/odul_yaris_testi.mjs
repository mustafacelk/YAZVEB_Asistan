// ═══════════════════════════════════════════════════════════════════
// Ödül sistemi — eşzamanlılık (yarış durumu) testi
// ═══════════════════════════════════════════════════════════════════
// Tek bağlantılı testler yarışı kanıtlayamaz. Burada her kullanıcı AYRI bir
// veritabanı oturumu açar; hepsi hazır olunca istekler aynı anda gönderilir.
// Her istek kendi işleminde bir süre bekleyip öyle biter: satır kilidi o
// süre boyunca tutulur, yani çakışma şansa bırakılmaz, ZORLA oluşturulur.
//
//   Y1  stok 5, 20 kullanıcı aynı anda    → tam 5 kazanan, stok 0
//   Y2  tek kullanıcı aynı QR 10 kez       → tam 1 kazanım, puan bir kez
//   Y3  stok 1, 10 kullanıcı               → tam 1 kazanan
//   Y4  toplam limit 3 görev, 15 kullanıcı → tam 3 kazanan
//   Y5  aynı ödül 5 kasada aynı anda onaylanır → tam 1 "kullanildi"
//   Y6  HUB'a ilk giriş aynı anda 5 kez → tek karşılama Coin'i
//   Y7  aynı bakiyeyle aynı anda 5 satın alma → bakiye bir kez harcanır
//   Y8  bekleyen not 5 oturumda aynı anda onaylanır → taban puan bir kez
//   Y9  10 kişi aynı nota aynı anda "işime yaradı" → sayaç 10, puan tutarlı
//   Y10 aynı e-postayı iki hesap aynı anda onaylar → yalnızca biri
//
// Boş bir PostgreSQL veritabanına karşı çalışır (şemayı kendisi kurar):
//   PG_URL=postgres://postgres:test@127.0.0.1:5432/yazveb node veritabani/odul_yaris_testi.mjs
// ═══════════════════════════════════════════════════════════════════
import pg from "pg";
import { readFileSync } from "node:fs";

const URL_ = process.env.PG_URL;
if (!URL_) {
  console.error("PG_URL gerekli (boş bir test veritabanı).");
  process.exit(2);
}
const kok = new URL(".", import.meta.url);
const oku = (ad) => readFileSync(new URL(ad, kok), "utf8");

const yonetici = new pg.Client({ connectionString: URL_ });
await yonetici.connect();
const q = async (sql, p) => (await yonetici.query(sql, p)).rows;

for (const f of ["00_test_altyapisi.sql", "01_sema.sql", "02_yetkiler.sql", "04_guvenlik.sql", "05_oduller.sql",
                 "06_isletme.sql", "07_hub.sql", "08_kimlik.sql", "09_pano.sql"]) {
  await yonetici.query(oku(f));
}

await yonetici.query(`
  update public.kota_ayarlari set dakika = 100000, gun = 1000000, genel = 10000000 where tur = 'odul_tara';
  insert into auth.users (id, email, raw_user_meta_data)
  select ('b0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'y' || i || '@test',
         jsonb_build_object('kullanici_adi', 'yarisci' || i)
  from generate_series(1, 20) i;
  insert into odul.sponsorlar (id, ad) values ('c0000000-0000-0000-0000-000000000001', 'Yarış Kafe');
  insert into odul.kampanyalar (id, sponsor_id, ad, token, kisa_kod, baslangic, bitis) values
    ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'Stok 5',
     'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA5', 'YARIS5', now() - interval '1 hour', now() + interval '1 day'),
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Stok 1',
     'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1', 'YARIS1', now() - interval '1 hour', now() + interval '1 day');
  insert into odul.kampanya_odulleri (kampanya_id, baslik, toplam, kalan) values
    ('d0000000-0000-0000-0000-000000000005', 'Kahve', 3, 3),
    ('d0000000-0000-0000-0000-000000000005', 'Indirim', 2, 2),
    ('d0000000-0000-0000-0000-000000000001', 'Tek kahve', 1, 1);
  insert into odul.gorevler (baslik, token, kisa_kod, puan, baslangic, bitis) values
    ('Cift dokunus', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'CIFT1', 100, now() - interval '1 hour', now() + interval '1 day');
  insert into odul.gorevler (baslik, token, kisa_kod, puan, toplam_limit, baslangic, bitis) values
    ('Ilk uc', 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', 'ILK3', 10, 3, now() - interval '1 hour', now() + interval '1 day');
`);

const kimlik = (n) => "b0000000-0000-0000-0000-" + String(n).padStart(12, "0");

/** Her kullanıcı için ayrı oturum açar, hepsi hazır olunca çağrıyı aynı anda gönderir. */
async function esZamanli(kullanicilar, cagri) {
  const oturumlar = await Promise.all(kullanicilar.map(async (n) => {
    const c = new pg.Client({ connectionString: URL_ });
    await c.connect();
    await c.query("set role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, false)", [kimlik(n)]);
    return c;
  }));
  const sonuclar = await Promise.all(oturumlar.map(async (c) => {
    try {
      await c.query("begin");
      const r = await c.query(`select (${cagri}) ->> 'durum' as durum`);
      await c.query("select pg_sleep(0.15)");      // kilidi tut: diğerleri beklemek zorunda
      await c.query("commit");
      return r.rows[0].durum;
    } catch (h) {
      await c.query("rollback").catch(() => {});
      return "HATA: " + h.message;
    }
  }));
  await Promise.all(oturumlar.map((c) => c.end()));
  return sonuclar;
}

let hata = 0;
const say = (liste, deger) => liste.filter((x) => x === deger).length;
function kontrol(ad, gelen, beklenen) {
  const ok = String(gelen) === String(beklenen);
  if (!ok) hata++;
  console.log(ok ? `  GECTI  ${ad} (${gelen})` : `  BASARISIZ  ${ad}: beklenen ${beklenen}, gelen ${gelen}`);
}

const hatalar = (l) => l.filter((x) => x.startsWith("HATA")).slice(0, 2);

console.log("\n═══ Y1. Stok 5, 20 kullanıcı aynı anda ═══");
let r = await esZamanli([...Array(20).keys()].map((i) => i + 1),
  "public.odul_sponsor_tara('c0000000-0000-0000-0000-000000000001', 'YAZVEB:S:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA5')");
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("tam 5 kazanan", say(r, "tamam"), 5);
kontrol("15 kişi tükendi gördü", say(r, "tukendi"), 15);
kontrol("stok tam 0 (eksiye düşmedi)",
  (await q("select sum(kalan)::int s from odul.kampanya_odulleri where kampanya_id = 'd0000000-0000-0000-0000-000000000005'"))[0].s, 0);
kontrol("5 cüzdan kaydı",
  (await q("select count(*)::int n from odul.kazanimlar where kampanya_id = 'd0000000-0000-0000-0000-000000000005'"))[0].n, 5);
kontrol("3 kahve + 2 indirim (envanterle tutarlı)",
  (await q(`select string_agg(odul_baslik || '=' || n, ',' order by odul_baslik) s from (
            select odul_baslik, count(*) n from odul.kazanimlar
            where kampanya_id = 'd0000000-0000-0000-0000-000000000005' group by 1) x`))[0].s, "Indirim=2,Kahve=3");
kontrol("kazananlar farklı kişiler",
  (await q("select count(distinct kullanici)::int n from odul.kazanimlar where kampanya_id = 'd0000000-0000-0000-0000-000000000005'"))[0].n, 5);

console.log("\n═══ Y2. Tek kullanıcı, aynı QR 10 kez aynı anda ═══");
r = await esZamanli(Array(10).fill(7), "public.odul_gorev_tamamla('YAZVEB:G:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB')");
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("tam 1 başarılı tarama", say(r, "tamam"), 1);
kontrol("9 zaten_alindi", say(r, "zaten_alindi"), 9);
kontrol("puan bir kez (100)", (await q("select xp from odul.hesaplar where kullanici = $1", [kimlik(7)]))[0].xp, 100);
kontrol("defter = önbellek",
  (await q("select sum(miktar)::int s from odul.puan_islemleri where kullanici = $1", [kimlik(7)]))[0].s, 100);

console.log("\n═══ Y3. Stok 1, 10 kullanıcı aynı anda ═══");
r = await esZamanli([...Array(10).keys()].map((i) => i + 11),
  "public.odul_sponsor_tara('c0000000-0000-0000-0000-000000000001', 'YARIS1')");
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("son ödülü tam 1 kişi aldı", say(r, "tamam"), 1);
kontrol("stok 0",
  (await q("select kalan from odul.kampanya_odulleri where kampanya_id = 'd0000000-0000-0000-0000-000000000001'"))[0].kalan, 0);

console.log("\n═══ Y4. Toplam limit 3 olan görev, 15 kullanıcı aynı anda ═══");
r = await esZamanli([...Array(15).keys()].map((i) => i + 1), "public.odul_gorev_tamamla('ILK3')");
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("tam 3 kazanan", say(r, "tamam"), 3);
kontrol("12 tükendi", say(r, "tukendi"), 12);
kontrol("kullanım sayacı 3", (await q("select kullanim_sayisi from odul.gorevler where kisa_kod = 'ILK3'"))[0].kullanim_sayisi, 3);

console.log("\n═══ Y5. Aynı ödül, 5 kasada aynı anda onay ═══");
// Ekran görüntüsü birkaç çalışana gösterilse bile ödül bir kez geçmeli.
await yonetici.query(`
  update odul.sponsorlar set pin_ozet = extensions.crypt('246810', extensions.gen_salt('bf', 4))
  where id = 'c0000000-0000-0000-0000-000000000001';
  insert into odul.kazanimlar (kullanici, kampanya_id, sponsor_ad, odul_baslik, odul_tur, odul_ikon, kod, son_kullanma)
  values ('${kimlik(20)}', 'd0000000-0000-0000-0000-000000000001', 'Yarış Kafe', 'Tek kahve', 'urun', 'kahve',
          'YRS5-KSA', now() + interval '1 day');
`);
r = await esZamanli([1, 2, 3, 4, 5], "public.isletme_odul_dogrula('YRS5-KSA', '246810', true)");
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("tam 1 kasa onayladı", say(r, "kullanildi"), 1);
kontrol("4 kasa 'daha önce kullanılmış' gördü", say(r, "zaten_kullanildi"), 4);
kontrol("tek kullanım kaydı",
  (await q("select count(*)::int n from odul.denetim where islem = 'odul_isletmede_kullanildi'"))[0].n, 1);

console.log("\n═══ Y6. HUB'a ilk giriş, aynı anda 5 istek ═══");
r = await esZamanli([12, 12, 12, 12, 12], "jsonb_build_object('durum', 'tamam', 'p', public.hub_profil())");
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("tek karşılama satırı",
  (await q("select count(*)::int n from hub.coin_islemleri where kullanici = $1 and tur = 'hosgeldin'", [kimlik(12)]))[0].n, 1);
kontrol("bakiye 150", (await q("select coin from hub.oyuncular where kullanici = $1", [kimlik(12)]))[0].coin, 150);

console.log("\n═══ Y7. 150 Coin ile aynı anda 5 kez 120'lik eşya ═══");
r = await esZamanli([12, 12, 12, 12, 12], "public.hub_satin_al('puf')");
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("tam 1 satın alma", say(r, "tamam"), 1);
kontrol("4 yetersiz", say(r, "yetersiz"), 4);
kontrol("bakiye 30, eksiye düşmedi", (await q("select coin from hub.oyuncular where kullanici = $1", [kimlik(12)]))[0].coin, 30);

// ── Notlar ──────────────────────────────────────────────────────────
// Süper kullanıcı oturumunda kimliğe bürünüp doğrular (kod e-posta yerine buradan).
async function dogrula(n, eposta) {
  const kod = (await q("select public.kimlik_kod_olustur($1, $2)->>'kod' as k", [kimlik(n), eposta]))[0].k;
  await q("select set_config('request.jwt.claim.sub', $1, false)", [kimlik(n)]);
  return (await q("select public.kimlik_kod_onayla($1)->>'durum' as d", [kod]))[0].d;
}
for (let n = 1; n <= 11; n++) await dogrula(n, `yarisci${n}@ogr.selcuk.edu.tr`);
await q("select set_config('request.jwt.claim.sub', $1, false)", [kimlik(11)]);
const hazir = (await q(`select public.pano_not_hazirla(jsonb_build_object('baslik', 'Yarış notu', 'ders_adi', 'Algoritma',
  'yil', 2026, 'yariyil', 'guz', 'tur', 'ders_notu', 'dosya_turu', 'pdf', 'boyut', 100, 'bolum', 'Bilgisayar',
  'sinif', '1', 'dosya_ozet', repeat('a', 64))) as r`))[0].r;
await q("insert into storage.objects (bucket_id, name, metadata) values ('notlar', $1, '{\"mimetype\": \"application/pdf\", \"size\": 100}')", [hazir.yol]);
await q("select public.pano_not_yayinla($1)", [hazir.id]);
await q("update pano.notlar set yayinlandi = now() - interval '49 hours' where id = $1", [hazir.id]);

console.log("\n═══ Y8. Bekleyen not, 5 oturum aynı anda onaylar ═══");
r = await esZamanli([1, 2, 3, 4, 5], "jsonb_build_object('durum', 'tamam', 'l', public.pano_notlar())");
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("taban puan bir kez (20)", (await q("select verilen from pano.not_xp where not_id = $1", [hazir.id]))[0].verilen, 20);
kontrol("defterde tek not satırı",
  (await q("select count(*)::int n from odul.puan_islemleri where kullanici = $1 and tur = 'not'", [kimlik(11)]))[0].n, 1);

console.log("\n═══ Y9. 10 kişi aynı nota aynı anda oy ═══");
for (let n = 1; n <= 10; n++) {
  await q("insert into pano.acilislar (not_id, kullanici) values ($1, $2)", [hazir.id, kimlik(n)]);
}
r = await esZamanli([...Array(10).keys()].map((i) => i + 1), `public.pano_not_oy('${hazir.id}', true)`);
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("10 oy kabul", say(r, "tamam"), 10);
kontrol("sayaç 10", (await q("select yararli from pano.notlar where id = $1", [hazir.id]))[0].yararli, 10);
kontrol("puan 20 + 3×10 = 50", (await q("select verilen from pano.not_xp where not_id = $1", [hazir.id]))[0].verilen, 50);
kontrol("defter toplamı verilenle aynı",
  (await q("select sum(miktar)::int s from odul.puan_islemleri where kullanici = $1 and tur = 'not'", [kimlik(11)]))[0].s, 50);
kontrol("XP önbelleği defterle aynı",
  (await q(`select (h.xp = (select sum(miktar) from odul.puan_islemleri p where p.kullanici = h.kullanici))::text t
            from odul.hesaplar h where h.kullanici = $1`, [kimlik(11)]))[0].t, "true");

console.log("\n═══ Y10. Aynı e-posta, iki hesap aynı anda onaylar ═══");
const kodlar = {};
for (const n of [15, 16]) {
  kodlar[n] = (await q("select public.kimlik_kod_olustur($1, 'ortak@ogr.selcuk.edu.tr')->>'kod' as k", [kimlik(n)]))[0].k;
}
r = await Promise.all([15, 16].map(async (n) => {
  const c = new pg.Client({ connectionString: URL_ });
  await c.connect();
  try {
    await c.query("set role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, false)", [kimlik(n)]);
    await c.query("begin");
    const d = (await c.query("select public.kimlik_kod_onayla($1)->>'durum' as d", [kodlar[n]])).rows[0].d;
    await c.query("select pg_sleep(0.15)");
    await c.query("commit");
    return d;
  } catch (h) {
    await c.query("rollback").catch(() => {});
    return "HATA: " + h.message;
  } finally {
    await c.end();
  }
}));
kontrol("hatasız", hatalar(r).join(" | ") || "yok", "yok");
kontrol("tam 1 doğrulandı", say(r, "tamam"), 1);
kontrol("diğeri kullanımda", say(r, "kullanimda"), 1);
kontrol("adres tek hesapta",
  (await q("select count(*)::int n from kimlik.ogrenciler where kullanici in ($1, $2) and dogrulandi is not null",
    [kimlik(15), kimlik(16)]))[0].n, 1);

await yonetici.end();
console.log(hata ? "\n═══ YARIŞ TESTLERİ BAŞARISIZ ═══" : "\n═══ YARIŞ TESTLERİ GEÇTİ ═══");
process.exit(hata ? 1 : 0);
