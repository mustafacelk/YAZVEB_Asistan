-- ═══════════════════════════════════════════════════════════════════
-- İŞLETME DOĞRULAMASI — ödül, öğrencinin ekranına güvenmeden onaylanır
-- ═══════════════════════════════════════════════════════════════════
--   ... -f 05_oduller.sql -f 99_odul_testleri.sql
--       -f 06_isletme.sql -f 99_isletme_testleri.sql
--
-- Çalışanın hesabı yok: bütün çağrılar ANONİM roldedir.
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

\echo ''
\echo '═══ İ1. HAZIRLIK — iki sponsor, üç ödül ═══'
set role authenticated;
select test_kullanici('baskan');
create temporary table isp as
select public.odul_sponsor_kaydet('{"ad":"Kantin","pin":"246810","adres":"Fen Fakültesi zemin kat"}') as v;
create temporary table isp2 as
select public.odul_sponsor_kaydet('{"ad":"Fotokopi","pin":"975310"}') as v;
create temporary table ikmp as
select public.odul_kampanya_kaydet(jsonb_build_object(
  'sponsor_id', (select v->>'id' from isp), 'ad', 'Kantin çayı', 'kisi_basi_limit', 1,
  'baslangic', now() - interval '1 hour', 'bitis', now() + interval '7 days',
  'oduller', jsonb_build_array(jsonb_build_object('baslik', 'BEDAVA ÇAY', 'ikon', 'kahve', 'adet', 10)))) as v;
create temporary table ikaz (ad text, v jsonb);
grant select on isp, isp2, ikmp to authenticated;
grant select, insert on ikaz to authenticated;

select test_kullanici('deniz');
insert into ikaz select 'deniz', public.odul_sponsor_tara((select (v->>'id')::uuid from isp), 'YAZVEB:S:' || (select v->>'token' from ikmp));
select test_kullanici('can');
insert into ikaz select 'can', public.odul_sponsor_tara((select (v->>'id')::uuid from isp), 'YAZVEB:S:' || (select v->>'token' from ikmp));
select test_kullanici('ayse');
insert into ikaz select 'ayse', public.odul_sponsor_tara((select (v->>'id')::uuid from isp), 'YAZVEB:S:' || (select v->>'token' from ikmp));
reset role;
select bekle('üç öğrenci birer ödül kazandı', (select count(*) = 3 and bool_and(v->>'durum' = 'tamam') from ikaz));

create temporary table ikod as
select ad, v->'kazanim'->>'kod' as kod, (v->'kazanim'->>'id')::uuid as id from ikaz;
-- PIN'i tanımlanmamış sponsorun (R5'teki Kitapçı) bir ödülü
insert into ikod select 'pinsiz', kod, id from odul.kazanimlar where sponsor_ad = 'Kitapçı' limit 1;
grant select on ikod to anon, authenticated;
delete from public.giris_denemeleri where anahtar like 'isletme_%';


\echo ''
\echo '═══ İ2. YANLIŞ GİRİŞLER — hiçbir ayrıntı verilmez ═══'
set role anon;
select test_anonim();
select bekle('anonim çağırabilir; saçma girdi → gecersiz',
  (select public.isletme_odul_dogrula('xx', '1') = '{"durum":"gecersiz"}'::jsonb));
select bekle('doğru kod + yanlış PIN → yalnızca "gecersiz"',
  (select public.isletme_odul_dogrula(kod, '000000') = '{"durum":"gecersiz"}'::jsonb from ikod where ad = 'deniz'));
select bekle('olmayan kod + doğru PIN → AYNI cevap (kodun varlığı sızmaz)',
  (select public.isletme_odul_dogrula('ZZZZ-ZZZ', '246810') = '{"durum":"gecersiz"}'::jsonb));
select bekle('başka sponsorun PIN''i → gecersiz (Fotokopi çalışanı Kantin ödülünü onaylayamaz)',
  (select public.isletme_odul_dogrula(kod, '975310')->>'durum' = 'gecersiz' from ikod where ad = 'deniz'));
select bekle('PIN''i tanımsız sponsorun ödülü hiçbir PIN''le onaylanmaz',
  (select public.isletme_odul_dogrula(kod, '246810')->>'durum' = 'gecersiz' from ikod where ad = 'pinsiz'));
reset role;
select bekle('yanlış denemeler sayıldı: kaynak 4, deniz''in kodu 2',
  (select count(*) filter (where anahtar like 'isletme_ip:%') = 4
      and count(*) filter (where anahtar = 'isletme_kod:' || (select kod from ikod where ad = 'deniz')) = 2
   from public.giris_denemeleri));
select bekle('hiçbir ödül kullanılmış sayılmadı',
  (select bool_and(kullanildi is null) from odul.kazanimlar where id in (select id from ikod)));


\echo ''
\echo '═══ İ3. DOĞRU AKIŞ — kontrol, onay, ikinci onay ═══'
set role anon;
select test_anonim();
select bekle('doğru kod + PIN → gecerli; ödül, sponsor ve adres görünür',
  (select r->>'durum' = 'gecerli' and r->>'baslik' = 'BEDAVA ÇAY' and r->>'sponsor' = 'Kantin'
      and r->>'adres' like 'Fen%' and r->>'kod' = (select kod from ikod where ad = 'deniz')
   from (select public.isletme_odul_dogrula(kod, '246810') r from ikod where ad = 'deniz') x));
reset role;
select bekle('yalnızca kontrol etmek ödülü KULLANMAZ',
  (select kullanildi is null from odul.kazanimlar where id = (select id from ikod where ad = 'deniz')));
set role anon;
select test_anonim();
select bekle('öğrencinin QR içeriği (YAZVEB:K:…) ve küçük harf/tiresiz yazım tanınır',
  (select public.isletme_odul_dogrula('YAZVEB:K:' || kod, '246810')->>'durum' = 'gecerli'
      and public.isletme_odul_dogrula(lower(replace(kod, '-', '')), '246810')->>'durum' = 'gecerli'
   from ikod where ad = 'deniz'));
select bekle('onay → kullanildi',
  (select public.isletme_odul_dogrula(kod, '246810', true)->>'durum' = 'kullanildi' from ikod where ad = 'deniz'));
select bekle('SAHTE EKRAN / EKRAN GÖRÜNTÜSÜ: ikinci onay → zaten_kullanildi + ilk kullanım zamanı',
  (select r->>'durum' = 'zaten_kullanildi' and r ? 'zaman'
   from (select public.isletme_odul_dogrula(kod, '246810', true) r from ikod where ad = 'deniz') x));
reset role;
select bekle('kullanım denetim kaydına yazıldı',
  (select count(*) = 1 from odul.denetim
   where islem = 'odul_isletmede_kullanildi' and hedef = 'kazanim:' || (select id from ikod where ad = 'deniz')));
set role authenticated;
select test_kullanici('deniz');
select bekle('öğrencinin ekranı artık KULLANILDI der (sunucudan gelir)',
  (select public.odul_goster((select id from ikod where ad = 'deniz'))->>'durum' = 'kullanildi'));
reset role;


\echo ''
\echo '═══ İ4. KABA KUVVET ═══'
set role anon;
select test_anonim();
do $$ declare i int; begin
  for i in 1..5 loop
    perform public.isletme_odul_dogrula((select kod from ikod where ad = 'can'), '11111' || i);
  end loop;
end $$;
select bekle('aynı koda 5 yanlış PIN → sinir (doğru PIN de beklemeli)',
  (select public.isletme_odul_dogrula(kod, '246810')->>'durum' = 'sinir' from ikod where ad = 'can'));
reset role;
select bekle('kilitlenme güvenlik günlüğünde',
  (select count(*) >= 1 from public.guvenlik_olaylari where tur = 'isletme_kilidi'));
set role anon;
select test_anonim();
select public.isletme_odul_dogrula('ABCD-EFG', '000000');   -- kaynaktan 10. yanlış
select bekle('aynı kaynaktan 10 yanlıştan sonra HER kod → sinir',
  (select public.isletme_odul_dogrula(kod, '246810')->>'durum' = 'sinir' from ikod where ad = 'ayse'));
reset role;

-- Dağıtık saldırı: farklı IP'lerden, farklı kodlarla aynı sponsorun PIN'i denenir.
delete from public.giris_denemeleri where anahtar like 'isletme_%';
insert into public.giris_denemeleri (anahtar)
select 'isletme_sponsor:' || (select v->>'id' from isp) from generate_series(1, 30);
set role anon;
select test_anonim();
select bekle('sponsor başına 30 yanlıştan sonra o sponsorun kodları → sinir',
  (select public.isletme_odul_dogrula(kod, '246810')->>'durum' = 'sinir' from ikod where ad = 'ayse'));
reset role;
delete from public.giris_denemeleri where anahtar like 'isletme_%';
set role anon;
select test_anonim();
select bekle('sınır kalkınca doğru kod + PIN yine geçerli',
  (select public.isletme_odul_dogrula(kod, '246810')->>'durum' = 'gecerli' from ikod where ad = 'ayse'));
select bekle('başarılı doğrulamalar sayılmaz (yoğun kasa kilitlenmez)',
  (select bool_and(public.isletme_odul_dogrula(kod, '246810')->>'durum' = 'gecerli')
   from ikod, generate_series(1, 15) where ad = 'ayse'));
reset role;


\echo ''
\echo '═══ İ5. SÜRESİ DOLMUŞ, İPTAL ═══'
update odul.kazanimlar set son_kullanma = now() - interval '1 minute' where id = (select id from ikod where ad = 'ayse');
update odul.kazanimlar set iptal = now() where id = (select id from ikod where ad = 'can');
delete from public.giris_denemeleri where anahtar like 'isletme_%';
set role anon;
select test_anonim();
select bekle('süresi dolmuş ödül → suresi_doldu, onaylanmaz',
  (select public.isletme_odul_dogrula(kod, '246810', true)->>'durum' = 'suresi_doldu' from ikod where ad = 'ayse'));
select bekle('iptal edilmiş ödül → iptal, onaylanmaz',
  (select public.isletme_odul_dogrula(kod, '246810', true)->>'durum' = 'iptal' from ikod where ad = 'can'));
reset role;
select bekle('ikisi de kullanılmış sayılmadı',
  (select bool_and(kullanildi is null) from odul.kazanimlar
   where id in (select id from ikod where ad in ('ayse', 'can'))));


\echo ''
\echo '═══ İ6. YETKİ ═══'
set role anon;
select test_anonim();
select reddedilmeli('anonim deneme tablosunu okuyamaz', $$select * from public.giris_denemeleri$$);
select reddedilmeli('anonim ödül tablolarına dokunamaz', $$select * from odul.kazanimlar$$);
reset role;
select bekle('doğrulama anonime açık; iç yardımcılar kapalı',
  has_function_privilege('anon', 'public.isletme_odul_dogrula(text, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.olay_yaz(text, uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.istek_ip_ozeti()', 'execute'));
delete from public.giris_denemeleri where anahtar like 'isletme_%';

\echo ''
\echo '═══ TÜM İŞLETME TESTLERİ GEÇTİ ═══'
