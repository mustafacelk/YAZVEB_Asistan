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

for (const f of ["00_test_altyapisi.sql", "01_sema.sql", "02_yetkiler.sql", "04_guvenlik.sql", "05_oduller.sql"]) {
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

await yonetici.end();
console.log(hata ? "\n═══ YARIŞ TESTLERİ BAŞARISIZ ═══" : "\n═══ YARIŞ TESTLERİ GEÇTİ ═══");
process.exit(hata ? 1 : 0);
