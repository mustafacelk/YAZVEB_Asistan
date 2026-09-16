-- ═══════════════════════════════════════════════════════════════════
-- YAZVEB COMMUNITY REWARDS — iş mantığı ve saldırı testleri
-- ═══════════════════════════════════════════════════════════════════
--   psql -f 00_test_altyapisi.sql -f 01_sema.sql -f 02_yetkiler.sql \
--        -f 99_testler.sql -f 03_kurulum.sql -f 04_guvenlik.sql \
--        -f 05_oduller.sql -f 99_odul_testleri.sql
--
-- Eşzamanlılık (son ödül yarışı) ayrıca: veritabani/odul_yaris_testi.sh
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── Yardımcılar (bağımsız çalışabilsin) ────────────────────────────
create or replace function test_kullanici(p_ad text) returns void language plpgsql as $$
declare k uuid;
begin
  select id into k from public.profiller where kullanici_adi = p_ad;
  if k is null then raise exception 'test kullanıcısı yok: %', p_ad; end if;
  perform set_config('request.jwt.claim.sub', k::text, false);
end $$;
create or replace function test_anonim() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false);
$$;
create or replace function kim(p_ad text) returns uuid language sql as $$
  select id from public.profiller where kullanici_adi = p_ad;
$$;
grant execute on function test_kullanici(text), test_anonim(), kim(text) to anon, authenticated;

-- Ek kullanıcılar
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'ali@test',  '{"kullanici_adi":"ali"}'),
  ('a0000000-0000-0000-0000-000000000002', 'ayse@test', '{"kullanici_adi":"ayse"}'),
  ('a0000000-0000-0000-0000-000000000003', 'can@test',  '{"kullanici_adi":"can"}'),
  ('a0000000-0000-0000-0000-000000000004', 'deniz@test','{"kullanici_adi":"deniz"}')
on conflict do nothing;

-- Testte hız sınırı bol; kendi bölümünde daraltılır.
update public.kota_ayarlari set dakika = 100000, gun = 1000000, genel = 10000000 where tur = 'odul_tara';


\echo ''
\echo '═══ R1. YETKİ — kim neye dokunabilir ═══'
set role anon;
select test_anonim();
select reddedilmeli('anonim profil göremez', $$select public.odul_profil()$$);
select reddedilmeli('anonim görev tamamlayamaz', $$select public.odul_gorev_tamamla('X')$$);
reset role;

set role authenticated;
select test_kullanici('uye');
select reddedilmeli('üye odul şemasındaki tabloyu okuyamaz (şema kapalı)', $$select * from odul.gorevler$$);
select reddedilmeli('üye puanını doğrudan değiştiremez', $$update odul.hesaplar set xp = 999999$$);
select reddedilmeli('üye iç puan fonksiyonunu çağıramaz', $$select odul.puan_ekle(auth.uid(), 5000, 'yonetici', 'hile', null, null)$$);
select reddedilmeli('üye görev oluşturamaz', $$select public.odul_gorev_kaydet('{"baslik":"hile","puan":9999,"baslangic":"2020-01-01","bitis":"2099-01-01"}')$$);
select reddedilmeli('üye yönetim özetini göremez', $$select public.odul_yonetim_ozet()$$);
select reddedilmeli('üye elle puan veremez', $$select public.odul_puan_ayarla(auth.uid(), 5000, 'hile')$$);
select reddedilmeli('üye sponsor oluşturamaz', $$select public.odul_sponsor_kaydet('{"ad":"hile"}')$$);
select reddedilmeli('istemci puan değeri gönderemez (öyle bir parametre yok)',
  $$select public.odul_gorev_tamamla(p_icerik => 'X', p_puan => 5000)$$);

select test_kullanici('yonetici');
select reddedilmeli('yönetici elle puan veremez (yalnız başkan)', $$select public.odul_puan_ayarla(auth.uid(), 10, 'x')$$);
select reddedilmeli('yönetici seviyeleri değiştiremez', $$select public.odul_seviyeler_kaydet('[{"ad":"A","esik":0}]')$$);
select reddedilmeli('yönetici denetim kaydını göremez', $$select public.odul_yonetim_denetim()$$);
reset role;


\echo ''
\echo '═══ R2. QR GÖREVİ — tekrar tarama, kısa kod, süre, iptal ═══'
set role authenticated;
select test_kullanici('baskan');
insert into public.etkinlikler (baslik, baslangic) values ('AI Summit', now() - interval '1 hour');

create temporary table g as
select public.odul_gorev_kaydet(jsonb_build_object(
  'baslik', 'AI Summit giriş', 'puan', 100, 'kisa_kod', 'YAZ25', 'tur', 'giris',
  'etkinlik_id', (select id from public.etkinlikler where baslik = 'AI Summit'),
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '8 hours')) as v;
grant select on g to authenticated;

select bekle('token 32 karakter, tahmin edilemez biçim', (select (v->>'token') ~ '^[A-Za-z0-9_-]{32}$' from g));
select bekle('özel kısa kod korundu', (select v->>'kisa_kod' = 'YAZ25' from g));

select test_kullanici('uye');
select bekle('QR ile ilk tarama → tamam, +100',
  (select r->>'durum' = 'tamam' and (r->>'puan')::int = 100 and (r->>'xp')::int = 100
   from (select public.odul_gorev_tamamla('YAZVEB:G:' || (select v->>'token' from g)) r) x));
select bekle('aynı QR ikinci kez → zaten_alindi',
  (select public.odul_gorev_tamamla('YAZVEB:G:' || (select v->>'token' from g))->>'durum' = 'zaten_alindi'));
select bekle('aynı görev kısa kodla → zaten_alindi',
  (select public.odul_gorev_tamamla('yaz-25')->>'durum' = 'zaten_alindi'));
select bekle('puan artmadı (100)', (select (public.odul_profil()->>'xp')::int = 100));

select test_kullanici('ali');
select bekle('başka üye kısa kodla (küçük harf, tire) → tamam', (select public.odul_gorev_tamamla(' yaz-25 ')->>'durum' = 'tamam'));

select test_kullanici('baskan');
create temporary table g_eski as
select public.odul_gorev_kaydet(jsonb_build_object('baslik', 'Bitmiş görev', 'puan', 50,
  'baslangic', now() - interval '3 hours', 'bitis', now() - interval '1 hour')) as v;
create temporary table g_ileri as
select public.odul_gorev_kaydet(jsonb_build_object('baslik', 'Yarınki görev', 'puan', 50,
  'baslangic', now() + interval '1 day', 'bitis', now() + interval '2 days')) as v;
grant select on g_eski, g_ileri to authenticated;
select test_kullanici('ayse');
select bekle('süresi dolmuş QR → suresi_doldu',
  (select public.odul_gorev_tamamla('YAZVEB:G:' || (select v->>'token' from g_eski))->>'durum' = 'suresi_doldu'));
select bekle('başlamamış görev → baslamadi',
  (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_ileri))->>'durum' = 'baslamadi'));

-- İptal ve QR yenileme
select test_kullanici('baskan');
create temporary table g_iptal as
select public.odul_gorev_kaydet(jsonb_build_object('baslik', 'Stand görevi', 'puan', 25,
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '1 hour')) as v;
grant select on g_iptal to authenticated;
create temporary table g_yeni as
select public.odul_gorev_iptal((select (v->>'id')::bigint from g_iptal), true) as v;
grant select on g_yeni to authenticated;
select test_kullanici('ayse');
select bekle('QR yenilenince ESKİ baskı geçersiz',
  (select public.odul_gorev_tamamla('YAZVEB:G:' || (select v->>'token' from g_iptal))->>'durum' = 'gecersiz'));
select bekle('YENİ QR çalışır',
  (select public.odul_gorev_tamamla('YAZVEB:G:' || (select v->>'token' from g_yeni))->>'durum' = 'tamam'));
select test_kullanici('baskan');
select public.odul_gorev_iptal((select (v->>'id')::bigint from g_iptal), false);
select test_kullanici('can');
select bekle('iptal edilen görev → gecersiz',
  (select public.odul_gorev_tamamla('YAZVEB:G:' || (select v->>'token' from g_yeni))->>'durum' = 'gecersiz'));

-- Toplam limit ve kişi başı limit
select test_kullanici('baskan');
create temporary table g_limit as
select public.odul_gorev_kaydet(jsonb_build_object('baslik', 'İlk gelen alır', 'puan', 10, 'toplam_limit', 1,
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '1 hour')) as v;
create temporary table g_coklu as
select public.odul_gorev_kaydet(jsonb_build_object('baslik', 'İki kez', 'puan', 10, 'kisi_basi_limit', 2,
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '1 hour')) as v;
grant select on g_limit, g_coklu to authenticated;
select test_kullanici('can');
select bekle('toplam limit 1: ilk kullanıcı alır', (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_limit))->>'durum' = 'tamam'));
select test_kullanici('deniz');
select bekle('toplam limit 1: ikinci kullanıcı → tukendi', (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_limit))->>'durum' = 'tukendi'));
select bekle('kişi başı 2: birinci tamam', (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_coklu))->>'durum' = 'tamam'));
select bekle('kişi başı 2: ikinci tamam',  (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_coklu))->>'durum' = 'tamam'));
select bekle('kişi başı 2: üçüncü → zaten_alindi', (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_coklu))->>'durum' = 'zaten_alindi'));

-- Konum şartı
select test_kullanici('baskan');
create temporary table g_konum as
select public.odul_gorev_kaydet(jsonb_build_object('baslik', 'Salonda', 'puan', 10,
  'enlem', 37.8700, 'boylam', 32.5000, 'yaricap_m', 150,
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '1 hour')) as v;
grant select on g_konum to authenticated;
select test_kullanici('can');
select bekle('konum şartlı görev, konum yok → konum_gerekli',
  (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_konum))->>'durum' = 'konum_gerekli'));
select bekle('2 km uzakta → konum_uzak',
  (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_konum), 37.8880, 32.5000)->>'durum' = 'konum_uzak'));
select bekle('50 m yakında → tamam',
  (select public.odul_gorev_tamamla((select v->>'kisa_kod' from g_konum), 37.8704, 32.5000)->>'durum' = 'tamam'));

-- Yanlış kod kaba kuvveti
select test_kullanici('deniz');
do $$ declare i int; begin
  for i in 1..10 loop perform public.odul_gorev_tamamla('YANLIS' || i); end loop;
end $$;
select bekle('10 hatalı koddan sonra DOĞRU kod da reddedilir (sinir)',
  (select public.odul_gorev_tamamla('YAZ25')->>'durum' = 'sinir'));
reset role;
delete from odul.denemeler;

-- Defter bütünlüğü: önbellek = defter toplamı
select bekle('her hesapta xp = puan defteri toplamı',
  not exists (select 1 from odul.hesaplar h
              where h.xp <> coalesce((select sum(miktar) from odul.puan_islemleri i where i.kullanici = h.kullanici), 0)));


\echo ''
\echo '═══ R3. SERİ VE SEVİYE ═══'
set role authenticated;
select test_kullanici('baskan');
select public.odul_ayarlar_kaydet('{"seri_acik": true, "seri_bonuslari": {"3": 50}}');
insert into public.etkinlikler (baslik, baslangic) values
  ('Seri 1', now() - interval '30 days'), ('Seri 2', now() - interval '20 days'), ('Seri 3', now() - interval '2 hours');
create temporary table seri as
select e.baslik, public.odul_gorev_kaydet(jsonb_build_object('baslik', e.baslik || ' giriş', 'puan', 60,
  'etkinlik_id', e.id, 'baslangic', now() - interval '1 hour', 'bitis', now() + interval '1 hour')) as v
from public.etkinlikler e where e.baslik like 'Seri %';
grant select on seri to authenticated;

select test_kullanici('deniz');
select bekle('seri 1', (select (public.odul_gorev_tamamla((select v->>'kisa_kod' from seri where baslik = 'Seri 1'))->>'seri')::int = 1));
select bekle('seri 2', (select (public.odul_gorev_tamamla((select v->>'kisa_kod' from seri where baslik = 'Seri 2'))->>'seri')::int = 2));
select bekle('seri 3 + bonus 50',
  (select (r->>'seri')::int = 3 and (r->>'bonus')::int = 50 from (
     select public.odul_gorev_tamamla((select v->>'kisa_kod' from seri where baslik = 'Seri 3')) r) x));
reset role;
select bekle('seri bonusu defterde ayrı satır',
  (select count(*) = 1 from odul.puan_islemleri where kullanici = kim('deniz') and tur = 'seri_bonusu'));

set role authenticated;
select test_kullanici('ayse');
-- İki tarama AYRI ifadede: SQL "a and b" içinde çalışma sırası garanti değildir.
select bekle('atlayan kullanıcı: Seri 1 → seri 1',
  (select (public.odul_gorev_tamamla((select v->>'kisa_kod' from seri where baslik = 'Seri 1'))->>'seri')::int = 1));
select bekle('ortadaki etkinliği atlayan: Seri 3''te seri 1''e döner, bonus yok',
  (select (r->>'seri')::int = 1 and (r->>'bonus')::int = 0
   from (select public.odul_gorev_tamamla((select v->>'kisa_kod' from seri where baslik = 'Seri 3')) r) x));

-- Seviye atlama: 200 XP'deki kullanıcı 60 XP'lik görevle 250 eşiğini geçer.
select test_kullanici('baskan');
select public.odul_puan_ayarla(kim('yonetici2'), 200, 'eşik testi hazırlığı');
select test_kullanici('yonetici2');
select bekle('seviye atlama bildirilir (200 → 260 XP, EXPLORER)',
  (select (r->>'seviye_atladi')::boolean and r->'seviye'->>'ad' = 'EXPLORER' and (r->>'xp')::int = 260
   from (select public.odul_gorev_tamamla((select v->>'kisa_kod' from seri where baslik = 'Seri 2')) r) x));
select bekle('eşiği geçmeyen tarama seviye atladı demez',
  (select not (r->>'seviye_atladi')::boolean
   from (select public.odul_gorev_tamamla((select v->>'kisa_kod' from seri where baslik = 'Seri 3')) r) x));
reset role;
select bekle('profil seviyesi xp''ye göre hesaplanır',
  (select odul.seviye_bilgisi(260)->>'ad' = 'EXPLORER' and odul.seviye_bilgisi(249)->>'ad' = 'STARTER'
      and (odul.seviye_bilgisi(249)->'sonraki'->>'esik')::int = 250));


\echo ''
\echo '═══ R4. ELLE PUAN VE DENETİM ═══'
set role authenticated;
select test_kullanici('baskan');
select bekle('başkan elle puan ekler', (select (public.odul_puan_ayarla(kim('uye'), 400, 'Gönüllü emeği')->>'xp')::int = 500));
select reddedilmeli('puan sıfırın altına düşürülemez', $$select public.odul_puan_ayarla(kim('uye'), -100000, 'fazla')$$);
select reddedilmeli('açıklamasız elle puan olmaz', $$select public.odul_puan_ayarla(kim('uye'), 10, '  ')$$);
select bekle('denetim kaydında puan işlemi var',
  (select exists (select 1 from jsonb_array_elements(public.odul_yonetim_denetim()) d
                  where d->>'islem' = 'puan_ayarla' and (d->'ayrinti'->>'miktar')::int = 400)));
reset role;


\echo ''
\echo '═══ R5. SPONSOR KİLİDİ, STOK, SON 3, TÜKENME ═══'
set role authenticated;
select test_kullanici('baskan');
create temporary table sp as
select public.odul_sponsor_kaydet('{"ad":"Coffee Lab","aciklama":"Kampüs kahvecisi","gerekli_xp":500,"pin":"4321","website":"https://coffeelab.example"}') as v;
create temporary table sp2 as
select public.odul_sponsor_kaydet('{"ad":"Kitapçı","gerekli_xp":0}') as v;
grant select on sp, sp2 to authenticated;

select reddedilmeli('javascript: bağlantısı kabul edilmez',
  $$select public.odul_sponsor_kaydet('{"ad":"X","website":"javascript:alert(1)"}')$$);
select reddedilmeli('SVG logo kabul edilmez (betik taşıyabilir)',
  $$select public.odul_sponsor_kaydet('{"ad":"X","logo":"data:image/svg+xml;base64,PHN2Zz4="}')$$);

create temporary table kmp as
select public.odul_kampanya_kaydet(jsonb_build_object(
  'sponsor_id', (select v->>'id' from sp), 'ad', 'Coffee Drop', 'kisi_basi_limit', 1,
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '7 days',
  'oduller', jsonb_build_array(
    jsonb_build_object('baslik', 'HEDİYE KAHVE', 'tur', 'urun', 'ikon', 'kahve', 'adet', 1),
    jsonb_build_object('baslik', '%20 İNDİRİM', 'tur', 'indirim', 'ikon', 'indirim', 'adet', 2)))) as v;
create temporary table kmp2 as
select public.odul_kampanya_kaydet(jsonb_build_object(
  'sponsor_id', (select v->>'id' from sp2), 'ad', 'Sınırsız indirim', 'kisi_basi_limit', 1, 'surpriz', false,
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '7 days',
  'oduller', jsonb_build_array(jsonb_build_object('baslik', '%10 İNDİRİM', 'tur', 'indirim', 'sinirsiz', true)))) as v;
grant select on kmp, kmp2 to authenticated;

select test_kullanici('ali');   -- 100 XP
select bekle('kilitli sponsor: kart kilitli, eksik 400 XP',
  (select (s->'kilit'->>'acik')::boolean = false and (s->'kilit'->>'eksik_xp')::int = 400
   from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Coffee Lab'));
select bekle('kilidi açılmamış sponsorda tarama → kilitli',
  (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), 'YAZVEB:S:' || (select v->>'token' from kmp))->>'durum' = 'kilitli'));
select bekle('profil: sonraki kilit Coffee Lab, 400 XP kaldı',
  (select public.odul_profil()->'sonraki_kilit'->>'sponsor' = 'Coffee Lab'
      and (public.odul_profil()->'sonraki_kilit'->>'eksik_xp')::int = 400));

select test_kullanici('uye');   -- 500 XP
select bekle('500 XP: kilit açık',
  (select (s->'kilit'->>'acik')::boolean from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Coffee Lab'));
select bekle('sürpriz kampanyada ödül kalemleri istemciye GÖNDERİLMEZ',
  (select s->'kampanya'->'oduller' = 'null'::jsonb from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Coffee Lab'));
select bekle('stok 3 → SON 3 durumu (az)',
  (select s->'kampanya'->>'durum' = 'az' and (s->'kampanya'->>'kalan')::int = 3
   from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Coffee Lab'));
select bekle('yanlış sponsorun QR''si → yanlis_sponsor',
  (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), 'YAZVEB:S:' || (select v->>'token' from kmp2))->>'durum' = 'yanlis_sponsor'));
select bekle('görev QR''si sponsor ekranında → gorev_qr (yol gösterilir)',
  (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), 'YAZVEB:G:' || (select v->>'token' from g))->>'durum' = 'gorev_qr'));

create temporary table kazanc1 as
select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), 'YAZVEB:S:' || (select v->>'token' from kmp)) as v;
grant select on kazanc1 to authenticated;
select bekle('kilit açık: sürpriz ödül kazanıldı, kod biçimi XXXX-XXX',
  (select v->>'durum' = 'tamam' and v->'kazanim'->>'kod' ~ '^[A-Z0-9]{4}-[A-Z0-9]{3}$' from kazanc1));
select bekle('aynı kampanya ikinci kez → zaten_alindi',
  (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), 'YAZVEB:S:' || (select v->>'token' from kmp))->>'durum' = 'zaten_alindi'));
select bekle('stok 2 → durum hâlâ az',
  (select s->'kampanya'->>'durum' = 'az' and (s->'kampanya'->>'kalan')::int = 2
   from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Coffee Lab'));

-- İki kullanıcıya daha kilit aç ve stoku bitir
reset role;
select odul.puan_ekle(kim('ayse'), 1000, 'yonetici', 'test', null, null);
select odul.puan_ekle(kim('can'), 1000, 'yonetici', 'test', null, null);
select odul.puan_ekle(kim('deniz'), 1000, 'yonetici', 'test', null, null);
set role authenticated;
select test_kullanici('ayse');
select bekle('ikinci ödül', (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), (select v->>'kisa_kod' from kmp))->>'durum' = 'tamam'));
select bekle('stok 1 → SON ÖDÜL',
  (select s->'kampanya'->>'durum' = 'son' from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Coffee Lab'));
select test_kullanici('can');
select bekle('son ödül', (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), (select v->>'kisa_kod' from kmp))->>'durum' = 'tamam'));
select test_kullanici('deniz');
select bekle('stok 0 → tukendi', (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), (select v->>'kisa_kod' from kmp))->>'durum' = 'tukendi'));
select bekle('tükenen sponsor listede kalır, durum tukendi',
  (select s->'kampanya'->>'durum' = 'tukendi' from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Coffee Lab'));
reset role;
select bekle('stok eksiye düşmedi, dağıtılan = 3',
  (select sum(kalan) = 0 from odul.kampanya_odulleri where kampanya_id = (select (v->>'id')::uuid from kmp))
  and (select count(*) = 3 from odul.kazanimlar where kampanya_id = (select (v->>'id')::uuid from kmp)));
select bekle('dağıtılan kalemler envanterle tutarlı (1 kahve, 2 indirim)',
  (select count(*) filter (where odul_baslik = 'HEDİYE KAHVE') = 1 and count(*) filter (where odul_baslik = '%20 İNDİRİM') = 2
   from odul.kazanimlar where kampanya_id = (select (v->>'id')::uuid from kmp)));

-- Stok eklemek tükenen kampanyayı yeniden açar
create temporary table stok_id as select id from odul.kampanya_odulleri
  where kampanya_id = (select (v->>'id')::uuid from kmp) and baslik = 'HEDİYE KAHVE';
grant select on stok_id to authenticated;
set role authenticated;
select test_kullanici('baskan');
select public.odul_kampanya_kaydet(jsonb_build_object(
  'id', (select v->>'id' from kmp), 'sponsor_id', (select v->>'id' from sp), 'ad', 'Coffee Drop',
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '7 days',
  'oduller', jsonb_build_array(jsonb_build_object('id', (select id from stok_id), 'baslik', 'HEDİYE KAHVE',
                                                  'tur', 'urun', 'ikon', 'kahve', 'stok_ekle', 5))));
select test_kullanici('deniz');
select bekle('stok eklenince kampanya yeniden açılır ve kazanılır',
  (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp), (select v->>'kisa_kod' from kmp))->>'durum' = 'tamam'));

-- Sınırsız kampanya
select test_kullanici('ali');
select bekle('sürprizsiz kampanyada kalemler görünür',
  (select jsonb_array_length(s->'kampanya'->'oduller') = 1 from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Kitapçı'));
select bekle('sınırsız: ilk kullanıcı', (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp2), (select v->>'kisa_kod' from kmp2))->>'durum' = 'tamam'));
select bekle('sınırsız: kişi başı limit yine işler', (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp2), (select v->>'kisa_kod' from kmp2))->>'durum' = 'zaten_alindi'));
select test_kullanici('ayse');
select bekle('sınırsız: ikinci kullanıcı', (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp2), (select v->>'kisa_kod' from kmp2))->>'durum' = 'tamam'));
reset role;
select bekle('sınırsız kalemde stok düşülmez (kalan boş)',
  (select bool_and(kalan is null) from odul.kampanya_odulleri where kampanya_id = (select (v->>'id')::uuid from kmp2)));

-- Süresi dolan kampanya
update odul.kampanyalar set bitis = now() - interval '1 minute', baslangic = now() - interval '2 days'
where id = (select (v->>'id')::uuid from kmp2);
set role authenticated;
select test_kullanici('can');
select bekle('süresi dolan kampanya → suresi_doldu',
  (select public.odul_sponsor_tara((select (v->>'id')::uuid from sp2), (select v->>'kisa_kod' from kmp2))->>'durum' = 'suresi_doldu'));
select bekle('kart kaybolmaz: durum bitti ("kaçırdın")',
  (select s->'kampanya'->>'durum' = 'bitti' from jsonb_array_elements(public.odul_sponsorlar()) s where s->>'ad' = 'Kitapçı'));
reset role;


\echo ''
\echo '═══ R6. CÜZDAN, GÖSTER, KULLAN — ekran görüntüsü ve kimlik manipülasyonu ═══'
set role authenticated;
select test_kullanici('uye');
select bekle('cüzdanda ödül var, kod listede YOK',
  (select count(*) = 1 and bool_and(not (z ? 'kod')) from jsonb_array_elements(public.odul_cuzdan()) z));
select bekle('göster: kod + 4 haneli dönen doğrulama + sunucu saati',
  (select r->>'durum' = 'aktif' and r->>'kod' = (select v->'kazanim'->>'kod' from kazanc1)
      and r->>'dogrulama' ~ '^[0-9]{4}$' and r ? 'sunucu_zamani'
   from (select public.odul_goster((select (v->'kazanim'->>'id')::uuid from kazanc1)) r) x));

select test_kullanici('ali');
select bekle('başkası ödül kimliğiyle GÖREMEZ (bulunamadi)',
  (select public.odul_goster((select (v->'kazanim'->>'id')::uuid from kazanc1))->>'durum' = 'bulunamadi'));
select bekle('başkası ödülü KULLANAMAZ (bulunamadi)',
  (select public.odul_kullan((select (v->'kazanim'->>'id')::uuid from kazanc1), '4321')->>'durum' = 'bulunamadi'));
select bekle('uydurma ödül kimliği → bulunamadi',
  (select public.odul_goster(gen_random_uuid())->>'durum' = 'bulunamadi'));

select test_kullanici('uye');
select bekle('yanlış işletme PIN''i → pin_hatali',
  (select public.odul_kullan((select (v->'kazanim'->>'id')::uuid from kazanc1), '0000')->>'durum' = 'pin_hatali'));
select bekle('harf içeren PIN → pin_hatali (bcrypt''e gitmeden)',
  (select public.odul_kullan((select (v->'kazanim'->>'id')::uuid from kazanc1), 'abcd')->>'durum' = 'pin_hatali'));
do $$ declare i int; begin
  for i in 1..3 loop perform public.odul_kullan((select (v->'kazanim'->>'id')::uuid from kazanc1), '1111'); end loop;
end $$;
select bekle('5 yanlış PIN → sinir (doğru PIN de beklemeli)',
  (select public.odul_kullan((select (v->'kazanim'->>'id')::uuid from kazanc1), '4321')->>'durum' = 'sinir'));
reset role;
delete from odul.denemeler;
set role authenticated;
select test_kullanici('uye');
select bekle('doğru PIN → kullanildi',
  (select public.odul_kullan((select (v->'kazanim'->>'id')::uuid from kazanc1), '4321')->>'durum' = 'kullanildi'));
select bekle('EKRAN GÖRÜNTÜSÜ SENARYOSU: aynı ödül tekrar → zaten_kullanildi',
  (select public.odul_kullan((select (v->'kazanim'->>'id')::uuid from kazanc1), '4321')->>'durum' = 'zaten_kullanildi'));
select bekle('göster ekranı artık KULLANILDI der',
  (select public.odul_goster((select (v->'kazanim'->>'id')::uuid from kazanc1))->>'durum' = 'kullanildi'));
reset role;

update odul.kazanimlar set son_kullanma = now() - interval '1 minute'
where kullanici = kim('ayse') and sponsor_ad = 'Coffee Lab';
set role authenticated;
select test_kullanici('ayse');
select bekle('süresi dolan ödül cüzdanda suresi_doldu',
  (select bool_or(z->>'durum' = 'suresi_doldu') from jsonb_array_elements(public.odul_cuzdan()) z));
select bekle('süresi dolan ödül kullanılamaz',
  (select public.odul_kullan((select (z->>'id')::uuid from jsonb_array_elements(public.odul_cuzdan()) z
                              where z->>'sponsor' = 'Coffee Lab'), '4321')->>'durum' = 'suresi_doldu'));
select bekle('PIN tanımsız sponsorda → pin_tanimsiz',
  (select public.odul_kullan((select (z->>'id')::uuid from jsonb_array_elements(public.odul_cuzdan()) z
                              where z->>'sponsor' = 'Kitapçı'), '1234')->>'durum' = 'pin_tanimsiz'));
reset role;


\echo ''
\echo '═══ R7. HIZ SINIRI ═══'
update public.kota_ayarlari set dakika = 3 where tur = 'odul_tara';
set role authenticated;
select test_kullanici('yonetici2');
select public.odul_gorev_tamamla('YOK1'), public.odul_gorev_tamamla('YOK2'), public.odul_gorev_tamamla('YOK3');
select bekle('dakikada 3 taramadan sonra → sinir',
  (select public.odul_gorev_tamamla('YAZ25')->>'durum' = 'sinir'));
reset role;
update public.kota_ayarlari set dakika = 100000 where tur = 'odul_tara';
delete from odul.denemeler;


\echo ''
\echo '═══ R8. SIRALAMA VE GİZLİLİK ═══'
set role authenticated;
select test_kullanici('can');
select public.odul_gizlilik(true);
select test_kullanici('uye');
select bekle('gizli profil sıralamada görünmez',
  (select not exists (select 1 from jsonb_array_elements(public.odul_liderlik()->'liste') l where l->>'ad' = 'can')));
select bekle('sıralamada gerçek ad değil kullanıcı adı var',
  (select bool_and(l ? 'ad' and not (l ? 'ad_soyad')) from jsonb_array_elements(public.odul_liderlik()->'liste') l));
select bekle('kendi sıram hesaplanır', (select (public.odul_liderlik()->'ben'->>'sira') is not null));
reset role;


\echo ''
\echo '═══ R9. SEVİYE YÖNETİMİ VE BAŞKAN KİLİDİ ═══'
-- BUILDER (500) ile CREATOR (1000) eşiklerini takas eden liste.
create temporary table takas as
select jsonb_agg(jsonb_build_object('id', id, 'ad', ad,
                 'esik', case esik_xp when 500 then 1000 when 1000 then 500 else esik_xp end, 'ikon', ikon)) as v
from odul.seviyeler;
grant select on takas to authenticated;
set role authenticated;
select test_kullanici('baskan');
select reddedilmeli('0 XP başlangıç seviyesi zorunlu', $$select public.odul_seviyeler_kaydet('[{"ad":"A","esik":10}]')$$);
select public.odul_seviyeler_kaydet((select v from takas));
reset role;
select bekle('eşikler yer değiştirebildi (ertelenmiş benzersizlik)',
  (select count(distinct esik_xp) = count(*) from odul.seviyeler)
  and exists (select 1 from odul.seviyeler where ad = 'BUILDER' and esik_xp = 1000));

set role authenticated;
select test_kullanici('yonetici');
select reddedilmeli('yönetici başkanın görevini düzenleyemez',
  format($$select public.odul_gorev_kaydet(%L)$$, jsonb_build_object('id', (select v->>'id' from g), 'baslik', 'ele geçir',
         'puan', 9999, 'baslangic', now(), 'bitis', now() + interval '1 day')));
select reddedilmeli('yönetici başkanın görevini iptal edemez',
  format($$select public.odul_gorev_iptal(%s)$$, (select v->>'id' from g)));
create temporary table g_yon as
select public.odul_gorev_kaydet(jsonb_build_object('baslik', 'Yönetici görevi', 'puan', 30,
  'baslangic', now(), 'bitis', now() + interval '1 day')) as v;
select bekle('yönetici kendi görevini oluşturur', (select (v->>'id') is not null from g_yon));
reset role;


\echo ''
\echo '═══ R10. ANALİTİK ═══'
set role authenticated;
select test_kullanici('yonetici');
select bekle('özet tutarlı: dağıtılan puan > 0, tarama > 0, sponsor metrikleri var',
  (select (o->>'dagitilan_puan')::int > 0 and (o->>'tarama')::int > 0
          and (o->>'tarama_qr')::int + (o->>'tarama_kod')::int = (o->>'tarama')::int
          and jsonb_array_length(o->'sponsorlar') = 2
          and (select (s->>'kullanim')::int = 1 from jsonb_array_elements(o->'sponsorlar') s where s->>'ad' = 'Coffee Lab')
   from (select public.odul_yonetim_ozet() o) x));
reset role;

\echo ''
\echo '═══ TÜM ÖDÜL TESTLERİ GEÇTİ ═══'
