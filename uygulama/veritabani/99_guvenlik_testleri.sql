-- ═══════════════════════════════════════════════════════════════════
-- GÜVENLİK SERTLEŞTİRMESİ TESTLERİ  (04_guvenlik.sql)
-- ═══════════════════════════════════════════════════════════════════
-- 99_testler.sql'den SONRA çalışır; onun kurduğu kullanıcıları kullanır.
--
--   psql -f 00_test_altyapisi.sql -f 01_sema.sql -f 02_yetkiler.sql \
--        -f 04_guvenlik.sql -f 99_testler.sql -f 99_guvenlik_testleri.sql
--
-- Her saldırı senaryosu burada gerçekten denenir.
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- Test parolaları (yalnızca yerel kapta, gerçek bir hesaba ait değil).
update auth.users set encrypted_password = extensions.crypt('Dogru-Parola-1', extensions.gen_salt('bf', 10))
where email = 'uye@test';
update auth.users set encrypted_password = extensions.crypt('Baskan-Parola-2', extensions.gen_salt('bf', 10))
where email = 'baskan@test';

create or replace function test_ip(p_ip text) returns void language sql as $$
  select set_config('request.headers', json_build_object('cf-connecting-ip', p_ip)::text, false);
$$;
create or replace function test_anonim() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false);
$$;
grant execute on function test_ip(text), test_anonim() to anon, authenticated;


\echo ''
\echo '═══ A. KULLANICI ADIYLA GİRİŞ — e-posta sızıntısı ve kaba kuvvet ═══'
set role anon;
select test_anonim();
select test_ip('10.0.0.1');

select bekle('doğru parola → e-posta döner',
  public.giris_epostasi('uye', 'Dogru-Parola-1') = 'uye@test');
select bekle('büyük harf ve boşluklu kullanıcı adı da çalışır',
  public.giris_epostasi('  UYE ', 'Dogru-Parola-1') = 'uye@test');
select bekle('yanlış parola → e-posta DÖNMEZ',
  public.giris_epostasi('uye', 'yanlis') is null);
select bekle('var olmayan kullanıcı → aynı cevap (null)',
  public.giris_epostasi('boyle_biri_yok', 'herhangi') is null);
select bekle('SQL enjeksiyonu denemesi → null, hata yok',
  public.giris_epostasi($$uye' or '1'='1$$, $$' or '1'='1$$) is null);
select bekle('128 karakterden uzun parola bcrypt''e hiç gitmez',
  public.giris_epostasi('uye', repeat('a', 5000)) is null);

select reddedilmeli('ESKİ tek parametreli fonksiyon artık yok',
  $$select public.giris_epostasi('uye')$$);

-- Zamanlama: "kullanıcı yok" cevabı "yanlış parola"dan belirgin hızlı
-- dönerse kullanıcı adının varlığı süreden okunur.
select test_ip('10.0.0.2');
do $$
declare
  t0 timestamptz; var_ms numeric := 0; yok_ms numeric := 0; i int;
begin
  for i in 1..3 loop
    t0 := clock_timestamp();
    perform public.giris_epostasi('baskan', 'yanlis-' || i);
    var_ms := var_ms + extract(epoch from clock_timestamp() - t0) * 1000;
    t0 := clock_timestamp();
    perform public.giris_epostasi('yok_kullanici' || i, 'yanlis');
    yok_ms := yok_ms + extract(epoch from clock_timestamp() - t0) * 1000;
  end loop;
  raise notice '  ölçüm: var olan hesap %.1f ms, olmayan %.1f ms (3 deneme toplamı)', var_ms, yok_ms;
  if yok_ms < var_ms * 0.5 then
    raise exception 'BASARISIZ: olmayan kullanıcı belirgin hızlı dönüyor — zamanlama sızıntısı';
  end if;
  raise notice '  GECTI  zamanlama eşit (kullanıcı adı süreden okunamıyor)';
end $$;

-- Kaba kuvvet: kullanıcı başına 15 dakikada 8 hatalı deneme.
select test_ip('10.0.0.3');
do $$ declare i int; begin
  for i in 1..8 loop perform public.giris_epostasi('uye', 'tahmin-' || i); end loop;
end $$;
select test_ip('10.0.0.4');   -- saldırgan IP değiştirse bile
select bekle('8 hatalı denemeden sonra DOĞRU parola bile e-posta vermez (kilit)',
  public.giris_epostasi('uye', 'Dogru-Parola-1') is null);
do $$
declare t0 timestamptz := clock_timestamp(); ms numeric;
begin
  perform public.giris_epostasi('uye', 'bir-daha');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if ms > 25 then raise exception 'BASARISIZ: kilitliyken bcrypt çalışıyor (% ms)', ms; end if;
  raise notice '  GECTI  kilitliyken bcrypt çalışmıyor (% ms) — işlemci yakılamaz', round(ms, 1);
end $$;

select bekle('kilit başka kullanıcıyı etkilemez',
  public.giris_epostasi('baskan', 'Baskan-Parola-2') = 'baskan@test');

-- IP başına 5 dakikada 30 deneme (kullanıcı adı püskürtme saldırısı).
select test_ip('10.0.0.9');
do $$ declare i int; begin
  for i in 1..30 loop perform public.giris_epostasi('ad' || i || 'xx', 'p'); end loop;
end $$;
select bekle('aynı IP''den 30 denemeden sonra doğru bilgi de reddedilir',
  public.giris_epostasi('baskan', 'Baskan-Parola-2') is null);
select test_ip('10.0.0.10');
select bekle('başka IP''den giriş çalışmaya devam eder',
  public.giris_epostasi('baskan', 'Baskan-Parola-2') = 'baskan@test');

select reddedilmeli('anonim güvenlik günlüğüne yazamaz (olay_yaz)',
  $$select public.olay_yaz('sel', null, '{"x":1}'::jsonb)$$);
select reddedilmeli('anonim IP özeti fonksiyonunu çağıramaz',
  $$select public.istek_ip_ozeti()$$);
select reddedilmeli('anonim deneme kayıtlarını okuyamaz',
  $$select count(*) from public.giris_denemeleri$$);
reset role;

select bekle('günlükte parola YOK',
  (select count(*) = 0 from public.guvenlik_olaylari
   where ayrinti::text ilike '%parola%' or ayrinti::text ilike '%tahmin%' or ayrinti::text ilike '%Dogru%'));
select bekle('günlükte ham IP YOK (yalnızca özet)',
  (select count(*) = 0 from public.guvenlik_olaylari where ayrinti::text like '%10.0.0.%'));
select bekle('kilit olayı günlüğe düştü',
  (select count(*) >= 1 from public.guvenlik_olaylari where tur = 'giris_kilidi'));


\echo ''
\echo '═══ B. KOTA — maliyet saldırısına karşı ═══'
update public.kota_ayarlari set dakika = 3, gun = 5, genel = 7 where tur = 'asistan';

set role anon;
select test_anonim();
-- Publishable anahtarla gelen istek PostgREST'te "anon" rolüdür; fonksiyonu
-- çağırma yetkisi bile yoktur (PostgREST bunu 401'e çevirir).
select reddedilmeli('anonim (publishable anahtar) kotayı hiç çağıramaz',
  $$select public.kota_harca('asistan')$$);
reset role;

set role authenticated;
select test_kullanici('uye');
select bekle('1. istek tamam', public.kota_harca('asistan') = 'tamam');
select bekle('2. istek tamam', public.kota_harca('asistan') = 'tamam');
select bekle('3. istek tamam', public.kota_harca('asistan') = 'tamam');
select bekle('dakika sınırında 4. istek → sinir', public.kota_harca('asistan') = 'sinir');
select bekle('bilinmeyen tür → bilinmeyen', public.kota_harca('baska_bir_sey') = 'bilinmeyen');

-- Günlük sınır: bir dakika öncesine taşınmış kayıtlarla.
reset role;
select bekle('sınırda sayaç artmaz (reddedilen istek kota yemez)',
  (select count(*) = 3 from public.kota_kayitlari
   where kullanici = (select id from public.profiller where kullanici_adi = 'uye')));
update public.kota_kayitlari set zaman = now() - interval '2 minutes';
set role authenticated;
select test_kullanici('uye');
select bekle('dakika dolunca 4. istek tamam', public.kota_harca('asistan') = 'tamam');
select bekle('5. istek tamam', public.kota_harca('asistan') = 'tamam');
reset role;
update public.kota_kayitlari set zaman = now() - interval '2 minutes';
set role authenticated;
select test_kullanici('uye');
select bekle('günlük sınırda (5) → sinir', public.kota_harca('asistan') = 'sinir');

-- Genel bütçe: sahte hesaplarla kişi başı kotayı katlama saldırısı.
select test_kullanici('yonetici');
select bekle('başka hesap: 6. toplam istek tamam', public.kota_harca('asistan') = 'tamam');
select bekle('başka hesap: 7. toplam istek tamam', public.kota_harca('asistan') = 'tamam');
select test_kullanici('yonetici2');
select bekle('üçüncü hesap bile genel bütçe (7) dolunca → sinir', public.kota_harca('asistan') = 'sinir');

select reddedilmeli('üye kota kayıtlarını okuyamaz', $$select count(*) from public.kota_kayitlari$$);
select reddedilmeli('üye kota kaydı ekleyip başkasının kotasını dolduramaz',
  $$insert into public.kota_kayitlari (tur, kullanici) values ('asistan', '11111111-1111-1111-1111-111111111111')$$);
select reddedilmeli('üye kendi kotasını silemez', $$delete from public.kota_kayitlari$$);
select reddedilmeli('üye kota ayarlarını değiştiremez', $$update public.kota_ayarlari set gun = 999999$$);
select reddedilmeli('üye olay yazma fonksiyonunu doğrudan çağıramaz (günlük seli)',
  $$select public.olay_yaz('sahte', null, '{}'::jsonb)$$);

select test_kullanici('uye');
select bekle('üye güvenlik olaylarını göremez',
  (select count(*) = 0 from public.guvenlik_olaylari));
select test_kullanici('baskan');
select bekle('başkan güvenlik olaylarını görür',
  (select count(*) > 0 from public.guvenlik_olaylari));
select bekle('kota aşımı olayları günlükte',
  (select count(*) >= 2 from public.guvenlik_olaylari where tur in ('kota_asimi', 'genel_butce_asimi')));
reset role;

-- Günlük seli: aynı olay dakikada bir kez yazılır.
set role authenticated;
select test_kullanici('uye');
do $$ declare i int; begin
  for i in 1..50 loop perform public.kota_harca('asistan'); end loop;
end $$;
reset role;
select bekle('50 aşım denemesi günlüğü şişirmez (en fazla birkaç satır)',
  (select count(*) <= 3 from public.guvenlik_olaylari
   where tur = 'kota_asimi' and kullanici = (select id from public.profiller where kullanici_adi = 'uye')));

update public.kota_ayarlari set dakika = 12, gun = 150, genel = 3000 where tur = 'asistan';


\echo ''
\echo '═══ C. SOHBET — sel ve zaman sahteciliği ═══'
set role authenticated;
select test_kullanici('uye');
insert into public.mesajlar (icerik, olusturuldu) values ('gelecekten', now() + interval '10 years');
select bekle('istemcinin verdiği zaman yok sayılır (geleceğe çivilenemez)',
  (select olusturuldu < now() + interval '1 minute' from public.mesajlar where icerik = 'gelecekten'));

insert into public.mesajlar (icerik) values ('s1'), ('s2'), ('s3');
select test_kullanici('uye');
insert into public.mesajlar (icerik) values ('s4');
select reddedilmeli('10 saniyede 6. mesaj reddedilir (P0429)',
  $$insert into public.mesajlar (icerik) values ('sel')$$);
select bekle('reddedilen mesaj kaydedilmedi',
  (select count(*) = 0 from public.mesajlar where icerik = 'sel'));

select test_kullanici('yonetici');
insert into public.mesajlar (icerik) values ('başka kullanıcı etkilenmez');
select bekle('sınır kişi başına: başka üye yazabiliyor',
  (select count(*) = 1 from public.mesajlar where icerik = 'başka kullanıcı etkilenmez'));
reset role;


\echo ''
\echo '═══ D. KİMLİĞE BÜRÜNME — görünen ad ═══'
set role authenticated;
select test_kullanici('uye');
update public.profiller set ad_soyad = 'Ayşe Gül Çağlar' where id = auth.uid();
select bekle('Türkçe karakterli normal ad kaydedilir',
  (select ad_soyad = 'Ayşe Gül Çağlar' from public.profiller where id = auth.uid()));
select reddedilmeli('yön değiştiren karakter (U+202E) reddedilir',
  format('update public.profiller set ad_soyad = %L where id = auth.uid()', 'Mustafa' || chr(8238) || 'kilec'));
select reddedilmeli('sıfır genişlikli boşluk (U+200B) reddedilir',
  format('update public.profiller set ad_soyad = %L where id = auth.uid()', 'Mus' || chr(8203) || 'tafa'));
select reddedilmeli('61 karakterlik ad reddedilir',
  format('update public.profiller set ad_soyad = %L where id = auth.uid()', repeat('a', 61)));
reset role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'kayit@test',
   json_build_object('kullanici_adi', 'yeni_uye', 'ad_soyad', 'Sahte' || chr(8238) || ' Başkan' || repeat('x', 80))::jsonb);
select bekle('kayıtta gelen görünmez karakter temizlenir, ad 60 karaktere kırpılır (kayıt düşmez)',
  (select not public.gorunmez_karakter_var(ad_soyad) and char_length(ad_soyad) <= 60
   from public.profiller where kullanici_adi = 'yeni_uye'));


\echo ''
\echo '═══ E. ETKİNLİK — zaman damgaları ═══'
set role authenticated;
select test_kullanici('yonetici');
insert into public.etkinlikler (baslik, baslangic, olusturuldu, guncellendi)
values ('zaman testi', now() + interval '1 day', '2000-01-01', '2000-01-01');
select bekle('oluşturma zamanı sunucudan',
  (select olusturuldu > now() - interval '1 minute' from public.etkinlikler where baslik = 'zaman testi'));
update public.etkinlikler set olusturuldu = '1999-01-01' where baslik = 'zaman testi';
select bekle('oluşturma zamanı sonradan değiştirilemez',
  (select olusturuldu > now() - interval '1 minute' from public.etkinlikler where baslik = 'zaman testi'));
reset role;


\echo ''
\echo '═══ F. ANONİM ERİŞİM ═══'
set role anon;
select test_anonim();
select reddedilmeli('anonim profilleri okuyamaz', $$select count(*) from public.profiller$$);
select reddedilmeli('anonim sohbeti okuyamaz', $$select count(*) from public.mesajlar$$);
select bekle('kurulum_durumu fonksiyonu gerçekten var (test boş geçmesin)',
  to_regprocedure('public.kurulum_durumu()') is not null);
select reddedilmeli('anonim kurulum sayaçlarını göremez', $$select public.kurulum_durumu()$$);
select reddedilmeli('anonim rol yardımcılarını çağıramaz', $$select public.baskan_mi()$$);
reset role;

\echo ''
\echo '═══ TÜM GÜVENLİK TESTLERİ GEÇTİ ═══'
