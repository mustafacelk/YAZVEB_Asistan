-- ═══════════════════════════════════════════════════════════════════
-- YETKİ TESTLERİ
-- ═══════════════════════════════════════════════════════════════════
-- Rol kuralları bu projenin güvenlik omurgası. "Doğru yazdım" yetmez;
-- her kural burada bir kullanıcı kılığına girilerek denenir.
--
-- Çalıştırma (yerel PostgreSQL kabında):
--   psql -f 00_test_altyapisi.sql -f 01_sema.sql -f 02_yetkiler.sql -f 99_testler.sql
--
-- Bir kural bozulursa betik HATA ile durur.
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── Test kullanıcıları ─────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'baskan@test',   '{"kullanici_adi":"baskan"}'),
  ('22222222-2222-2222-2222-222222222222', 'yonetici@test', '{"kullanici_adi":"yonetici"}'),
  ('33333333-3333-3333-3333-333333333333', 'yonetici2@test','{"kullanici_adi":"yonetici2"}'),
  ('44444444-4444-4444-4444-444444444444', 'uye@test',      '{"kullanici_adi":"uye"}')
on conflict do nothing;

-- Tetikleyici profilleri kurdu; rolleri sistem olarak atıyoruz (kurulum anı).
update public.profiller set rol = 'baskan'   where kullanici_adi = 'baskan';
update public.profiller set rol = 'yonetici' where kullanici_adi in ('yonetici','yonetici2');

-- ── Yardımcılar ────────────────────────────────────────────────────
create or replace function test_kullanici(p_ad text) returns void
language plpgsql as $$
declare k uuid;
begin
  select id into k from public.profiller where kullanici_adi = p_ad;
  perform set_config('request.jwt.claim.sub', k::text, false);
end $$;

create or replace function bekle(p_ad text, p_kosul boolean) returns void
language plpgsql as $$
begin
  if p_kosul then
    raise notice '  GECTI  %', p_ad;
  else
    raise exception 'BASARISIZ: %', p_ad;
  end if;
end $$;

-- INSERT ve tetikleyici ihlalleri HATA fırlatır: bunlar için `reddedilmeli`.
create or replace function reddedilmeli(p_ad text, p_sql text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice '  GECTI  % (reddedildi: %)', p_ad, left(sqlerrm, 48);
    return;
  end;
  raise exception 'BASARISIZ: % — islem REDDEDILMELIYDI ama gecti', p_ad;
end $$;

-- UPDATE ve DELETE'te RLS HATA VERMEZ: yetkisiz satırı sessizce atlar ve
-- sıfır satır etkilenir. Güvenlik açısından sonuç aynı (veri değişmez) ama
-- test bunu bilmek zorunda; hata bekleyen bir test burada yanlış alarm verir.
create or replace function etkilenmemeli(p_ad text, p_sql text) returns void
language plpgsql as $$
declare adet integer;
begin
  execute p_sql;
  get diagnostics adet = row_count;
  if adet = 0 then
    raise notice '  GECTI  % (0 satir etkilendi)', p_ad;
  else
    raise exception 'BASARISIZ: % — % satir degisti, degismemeliydi', p_ad, adet;
  end if;
end $$;


\echo ''
\echo '═══ 1. ETKINLIK EKLEME ═══'
set role authenticated;

select test_kullanici('uye');
select reddedilmeli('uye etkinlik ekleyemez',
  $$insert into public.etkinlikler (baslik, baslangic) values ('Uye denemesi', now())$$);

select test_kullanici('yonetici');
insert into public.etkinlikler (baslik, baslangic) values ('Yonetici etkinligi', now() + interval '1 day');
select bekle('yonetici etkinlik ekleyebilir',
  (select count(*) = 1 from public.etkinlikler where baslik = 'Yonetici etkinligi'));
select bekle('yoneticinin ekledigi kayit KILITSIZ',
  (select not baskan_kilidi from public.etkinlikler where baslik = 'Yonetici etkinligi'));

select test_kullanici('baskan');
insert into public.etkinlikler (baslik, baslangic) values ('Baskan etkinligi', now() + interval '2 days');
select bekle('baskanin ekledigi kayit KILITLI',
  (select baskan_kilidi from public.etkinlikler where baslik = 'Baskan etkinligi'));


\echo ''
\echo '═══ 2. BASKAN KILIDI ═══'
select test_kullanici('yonetici');
select etkilenmemeli('yonetici baskanin kaydini DUZENLEYEMEZ',
  $$update public.etkinlikler set baslik = 'ele gecirildi' where baslik = 'Baskan etkinligi'$$);
select bekle('baskanin kaydi degismedi',
  (select count(*) = 1 from public.etkinlikler where baslik = 'Baskan etkinligi'));

select etkilenmemeli('yonetici baskanin kaydini SILEMEZ',
  $$delete from public.etkinlikler where baslik = 'Baskan etkinligi'$$);
select bekle('baskanin kaydi hala duruyor',
  (select count(*) = 1 from public.etkinlikler where baslik = 'Baskan etkinligi'));

select test_kullanici('yonetici2');
update public.etkinlikler set yer = 'B blok' where baslik = 'Yonetici etkinligi';
select bekle('yonetici2 diger yoneticinin kaydini duzenleyebilir',
  (select yer = 'B blok' from public.etkinlikler where baslik = 'Yonetici etkinligi'));

select test_kullanici('baskan');
update public.etkinlikler set yer = 'Konferans salonu' where baslik = 'Yonetici etkinligi';
select bekle('baskan her kaydi duzenleyebilir',
  (select yer = 'Konferans salonu' from public.etkinlikler where baslik = 'Yonetici etkinligi'));
select bekle('baskan dokununca kayit KILITLENIR',
  (select baskan_kilidi from public.etkinlikler where baslik = 'Yonetici etkinligi'));

select test_kullanici('yonetici');
select etkilenmemeli('yonetici artik o kayda dokunamaz',
  $$update public.etkinlikler set yer = 'geri al' where baslik = 'Yonetici etkinligi'$$);
select bekle('yer degeri korundu',
  (select yer = 'Konferans salonu' from public.etkinlikler where baslik = 'Yonetici etkinligi'));


\echo ''
\echo '═══ 3. ROL YUKSELTME ═══'
select test_kullanici('uye');
select reddedilmeli('uye kendini yonetici yapamaz',
  $$update public.profiller set rol = 'yonetici' where kullanici_adi = 'uye'$$);
select reddedilmeli('uye kendini baskan yapamaz',
  $$update public.profiller set rol = 'baskan' where kullanici_adi = 'uye'$$);

select test_kullanici('yonetici');
select reddedilmeli('yonetici kendini baskan yapamaz',
  $$update public.profiller set rol = 'baskan' where kullanici_adi = 'yonetici'$$);
select etkilenmemeli('yonetici baskasini yukseltemez',
  $$update public.profiller set rol = 'yonetici' where kullanici_adi = 'uye'$$);
select bekle('uye hala uye',
  (select rol = 'uye' from public.profiller where kullanici_adi = 'uye'));

select test_kullanici('baskan');
update public.profiller set rol = 'yonetici' where kullanici_adi = 'uye';
select bekle('baskan rol verebilir',
  (select rol = 'yonetici' from public.profiller where kullanici_adi = 'uye'));
update public.profiller set rol = 'uye' where kullanici_adi = 'uye';

select reddedilmeli('baskan KENDI rolunu dusuremez',
  $$update public.profiller set rol = 'uye' where kullanici_adi = 'baskan'$$);


\echo ''
\echo '═══ 4. SOHBET ═══'
select test_kullanici('uye');
insert into public.mesajlar (icerik, yazar) values ('uye mesaji', auth.uid());
select bekle('uye mesaj yazabilir',
  (select count(*) = 1 from public.mesajlar where icerik = 'uye mesaji'));

-- Baskasinin adina mesaj: tetikleyici yazari zorla degistirir, sahtekarlik tutmaz.
insert into public.mesajlar (icerik, yazar)
values ('sahte', '11111111-1111-1111-1111-111111111111');
select bekle('baskasinin adina mesaj yazilamaz (yazar zorlanir)',
  (select yazar = (select id from public.profiller where kullanici_adi = 'uye')
   from public.mesajlar where icerik = 'sahte'));

select test_kullanici('yonetici');
insert into public.mesajlar (icerik, yazar) values ('yonetici mesaji', auth.uid());

select test_kullanici('uye');
select etkilenmemeli('uye baskasinin mesajini silemez',
  $$delete from public.mesajlar where icerik = 'yonetici mesaji'$$);
select bekle('o mesaj hala duruyor',
  (select count(*) = 1 from public.mesajlar where icerik = 'yonetici mesaji'));

delete from public.mesajlar where icerik = 'uye mesaji';
select bekle('uye kendi mesajini silebilir',
  (select count(*) = 0 from public.mesajlar where icerik = 'uye mesaji'));

select test_kullanici('yonetici');
delete from public.mesajlar where icerik = 'sahte';
select bekle('yonetici baskasinin mesajini silebilir (moderasyon)',
  (select count(*) = 0 from public.mesajlar where icerik = 'sahte'));


\echo ''
\echo '═══ 5. GORUNURLUK ═══'
select test_kullanici('uye');
select bekle('uye tum uyeleri gorebilir',
  (select count(*) = 4 from public.profiller));
select bekle('uye tum etkinlikleri gorebilir',
  (select count(*) >= 2 from public.etkinlikler));

reset role;
\echo ''
\echo '═══ TUM TESTLER GECTI ═══'
