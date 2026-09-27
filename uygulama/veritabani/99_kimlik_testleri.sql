-- ═══════════════════════════════════════════════════════════════════
-- ÖĞRENCİ DOĞRULAMA testleri
-- ═══════════════════════════════════════════════════════════════════
--   ... -f 07_hub.sql -f 99_hub_testleri.sql -f 08_kimlik.sql -f 99_kimlik_testleri.sql
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- Kod yalnızca sunucu rolünde görünür; testte süper kullanıcı onu çağırıp
-- kodu geçici tabloda tutar (e-postanın yerine).
create temporary table k_kod (ad text primary key, sonuc jsonb);
grant select on k_kod to authenticated;

create or replace function k_gonder(p_ad text, p_eposta text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  r := public.kimlik_kod_olustur(kim(p_ad), p_eposta);
  insert into k_kod values (p_ad, r) on conflict (ad) do update set sonuc = excluded.sonuc;
  return r;
end $$;
-- "Bir dakika bekle" sınırını testte atlamak için son gönderimi geriye çeker.
create or replace function k_bekleme_bitir(p_ad text) returns void language sql as $$
  update kimlik.gonderimler set zaman = zaman - interval '61 seconds' where kullanici = kim(p_ad) $$;
create or replace function k_onayla(p_ad text) returns jsonb language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', kim(p_ad)::text, false);
  return public.kimlik_kod_onayla((select sonuc->>'kod' from k_kod where ad = p_ad));
end $$;

\echo ''
\echo '═══ K1. YETKİ ═══'
set role anon;
select test_anonim();
select reddedilmeli('anonim durumunu okuyamaz', $$select public.kimlik_durum()$$);
reset role;
set role authenticated;
select test_kullanici('ali');
select reddedilmeli('üye kod ÜRETEMEZ (yalnız sunucu rolü)', $$select public.kimlik_kod_olustur(auth.uid(), 'x@ogr.selcuk.edu.tr')$$);
select reddedilmeli('üye kimlik tablolarını okuyamaz', $$select * from kimlik.ogrenciler$$);
select reddedilmeli('üye doğrulanmış sayılmak için yardımcıyı çağıramaz', $$select kimlik.dogrulanmis(auth.uid())$$);
select reddedilmeli('üye alan adlarını yönetemez', $$select public.kimlik_yonetim_alanlar()$$);
select reddedilmeli('üye üniversite adı veremez', $$select public.kimlik_universite_kaydet('x.edu.tr', 'Sahte')$$);
select bekle('başlangıçta doğrulanmamış', (select not (public.kimlik_durum()->>'dogrulandi')::boolean));
reset role;
set role service_role;
select bekle('sunucu rolü kod üretebilir', (select public.kimlik_kod_olustur('a0000000-0000-0000-0000-000000000004', 'deniz@ogr.selcuk.edu.tr')->>'durum' = 'tamam'));
reset role;
delete from kimlik.kodlar; delete from kimlik.gonderimler;

\echo ''
\echo '═══ K2. ALAN ADLARI ═══'
select bekle('ogr.selcuk.edu.tr → Selçuk, öğrenci',
  (select r->>'durum' = 'tamam' and r->>'universite' = 'Selçuk Üniversitesi' and r->>'tur' = 'ogrenci'
          and r->>'kod' ~ '^[0-9]{6}$' from (select k_gonder('ali', ' Ali.Veli@OGR.Selcuk.EDU.TR ') r) x));
select k_bekleme_bitir('ali');
select bekle('gmail → geçersiz', (select public.kimlik_kod_olustur(kim('ali'), 'ali@gmail.com')->>'durum' = 'gecersiz'));
select bekle('edu.tr kökü kurum değil', (select public.kimlik_kod_olustur(kim('ali'), 'a@edu.tr')->>'durum' = 'gecersiz'));
select bekle('ogr.edu.tr (üniversitesiz) kurum değil', (select public.kimlik_kod_olustur(kim('ali'), 'a@ogr.edu.tr')->>'durum' = 'gecersiz'));
select bekle('harvard.edu (listede yok) → geçersiz', (select public.kimlik_kod_olustur(kim('ali'), 'a@harvard.edu')->>'durum' = 'gecersiz'));
select bekle('biçimsiz adres → geçersiz', (select public.kimlik_kod_olustur(kim('ali'), 'a b@ogr.selcuk.edu.tr')->>'durum' = 'gecersiz'));
select bekle('ana alan (selcuk.edu.tr) → üniversite rozeti',
  (select r->>'tur' = 'kurum' and r->>'universite' = 'Selçuk Üniversitesi'
   from (select public.kimlik_kod_olustur(kim('can'), 'can@selcuk.edu.tr') r) x));
select bekle('listede olmayan .edu.tr kabul, adı alan adı',
  (select r->>'durum' = 'tamam' and r->>'universite' = 'yeniuni.edu.tr' and r->>'tur' = 'ogrenci'
   from (select public.kimlik_kod_olustur(kim('ayse'), 'ayse@std.yeniuni.edu.tr') r) x));
select bekle('izinli yurt dışı alanı (sabanciuniv.edu)',
  (select public.kimlik_kod_olustur(kim('deniz'), 'd@sabanciuniv.edu')->>'universite' = 'Sabancı Üniversitesi'));
delete from kimlik.kodlar where kullanici in (kim('can'), kim('ayse'), kim('deniz'));
delete from kimlik.gonderimler where kullanici in (kim('can'), kim('ayse'), kim('deniz'));

\echo ''
\echo '═══ K3. KOD GİRİŞİ ═══'
set role authenticated;
select test_kullanici('ali');
select bekle('bekleyen kod alanıyla görünür, adres görünmez',
  (select d->'bekleyen'->>'eposta_alani' = 'ogr.selcuk.edu.tr' and (d->'bekleyen'->>'kalan_sn')::int between 1700 and 1800
          and d::text !~* 'ali\.veli' from (select public.kimlik_durum() d) x));
select bekle('yanlış kod → hatalı, 4 hak', (select r->>'durum' = 'hatali' and (r->>'kalan')::int = 4
  from (select public.kimlik_kod_onayla('000000') r) x));
select bekle('biçimsiz kod da hak yer', (select public.kimlik_kod_onayla('abc')->>'kalan' = '3'));
select public.kimlik_kod_onayla('111111');
select public.kimlik_kod_onayla('222222');
select bekle('5. yanlışta kod yanar', (select public.kimlik_kod_onayla('333333')->>'durum' = 'deneme'));
select bekle('yanan kodla giriş yok', (select public.kimlik_kod_onayla('444444')->>'durum' = 'yok'));
reset role;
select k_bekleme_bitir('ali');
select k_gonder('ali', 'ali.veli@ogr.selcuk.edu.tr');
update kimlik.kodlar set olusturuldu = now() - interval '31 minutes' where kullanici = kim('ali');
select bekle('süresi geçen kod → sure', (select k_onayla('ali')->>'durum' = 'sure'));
select k_bekleme_bitir('ali');
select k_gonder('ali', 'ali.veli@ogr.selcuk.edu.tr');
select bekle('doğru kod → doğrulandı, Selçuk, öğrenci',
  (select r->>'durum' = 'tamam' and (r->>'dogrulandi')::boolean and r->>'universite' = 'Selçuk Üniversitesi'
          and r->>'tur' = 'ogrenci' from (select k_onayla('ali') r) x));
select bekle('geçerlilik: 31 Ekim (en az 3 ay sonra)',
  (select (gecerli_bitis at time zone 'Europe/Istanbul')::date = kimlik.bitis_hesapla(now())::date
          and extract(month from gecerli_bitis at time zone 'Europe/Istanbul') = 10
          and gecerli_bitis > now() + interval '3 months' from kimlik.ogrenciler where kullanici = kim('ali')));
select bekle('e-posta adresi hiçbir yerde saklanmaz',
  (select not exists (select 1 from kimlik.ogrenciler o where to_jsonb(o)::text ~* 'ali\.veli')
      and not exists (select 1 from kimlik.kodlar k where to_jsonb(k)::text ~* 'ali\.veli')));
select bekle('kod kullanılınca silinir', (select not exists (select 1 from kimlik.kodlar where kullanici = kim('ali'))));
select bekle('doğrulanmış yardımcı: ali evet, ayse hayır',
  (select kimlik.dogrulanmis(kim('ali')) and not kimlik.dogrulanmis(kim('ayse'))));
select bekle('aynı adres aynı hesapta tekrar → zaten',
  (select public.kimlik_kod_olustur(kim('ali'), 'ALI.VELI@ogr.selcuk.edu.tr')->>'durum' = 'zaten'));
select bekle('aynı adres başka hesapta → kullanımda',
  (select public.kimlik_kod_olustur(kim('ayse'), 'ali.veli@ogr.selcuk.edu.tr')->>'durum' = 'kullanimda'));

\echo ''
\echo '═══ K4. HIZ SINIRLARI ═══'
select bekle('ilk gönderim tamam', (select k_gonder('can', 'can@ogr.erbakan.edu.tr')->>'durum' = 'tamam'));
select bekle('60 sn dolmadan → bekle', (select r->>'durum' = 'bekle' and (r->>'saniye')::int between 1 and 60
  from (select public.kimlik_kod_olustur(kim('can'), 'can@ogr.erbakan.edu.tr') r) x));
do $$ begin
  for i in 1..4 loop
    perform k_bekleme_bitir('can');
    perform k_gonder('can', 'can' || i || '@ogr.erbakan.edu.tr');
  end loop;
end $$;
select k_bekleme_bitir('can');
select bekle('günde 5 gönderimden sonra → sınır', (select public.kimlik_kod_olustur(kim('can'), 'can9@ogr.erbakan.edu.tr')->>'durum' = 'sinir'));
update kimlik.ayarlar set gunluk_genel_sinir = (select count(*) from kimlik.gonderimler where zaman > now() - interval '24 hours');
select bekle('genel günlük bütçe dolunca → genel_sinir', (select public.kimlik_kod_olustur(kim('deniz'), 'deniz@ogr.selcuk.edu.tr')->>'durum' = 'genel_sinir'));
update kimlik.ayarlar set gunluk_genel_sinir = 250;
delete from kimlik.gonderimler where kullanici = kim('can');
select k_gonder('can', 'can@ogr.erbakan.edu.tr');
select bekle('can doğrulandı (Necmettin Erbakan)', (select k_onayla('can')->>'universite' = 'Necmettin Erbakan Üniversitesi'));

\echo ''
\echo '═══ K5. BÖLÜM, SÜRE, KALDIRMA ═══'
set role authenticated;
select test_kullanici('ali');
select bekle('bölüm boşlukları sadeleşir', (select public.kimlik_bilgi_kaydet('  Bilgisayar    Mühendisliği ', '2')->>'bolum' = 'Bilgisayar Mühendisliği'));
select reddedilmeli('geçersiz sınıf', $$select public.kimlik_bilgi_kaydet('Fizik', '9')$$);
select reddedilmeli('görünmez karakterli bölüm', $$select public.kimlik_bilgi_kaydet(E'Fizik​', '1')$$);
select bekle('bölüm kaydı doğrulamayı bozmaz', (select (public.kimlik_durum()->>'dogrulandi')::boolean));
reset role;
update kimlik.ogrenciler set gecerli_bitis = now() - interval '1 day' where kullanici = kim('can');
set role authenticated;
select test_kullanici('can');
select bekle('süresi dolan: doğrulanmamış + suresi_doldu',
  (select not (d->>'dogrulandi')::boolean and (d->>'suresi_doldu')::boolean from (select public.kimlik_durum() d) x));
reset role;
select bekle('süresi dolanın adresi başka hesapça alınabilir',
  (select k_gonder('ayse', 'can@ogr.erbakan.edu.tr')->>'durum' = 'tamam'));
select bekle('ayse aynı adresle doğrulandı', (select (k_onayla('ayse')->>'dogrulandi')::boolean));
select bekle('eski (süresi dolmuş) hesabın özeti bırakıldı',
  (select eposta_ozet is null and dogrulandi is null from kimlik.ogrenciler where kullanici = kim('can')));
set role authenticated;
select test_kullanici('ayse');
select bekle('doğrulamayı kaldır: özet ve alan silinir',
  (select not (d->>'dogrulandi')::boolean and d->>'kurum_alani' is null from (select public.kimlik_dogrulama_sil() d) x));
reset role;
select bekle('kaldırılan satırda özet yok', (select eposta_ozet is null from kimlik.ogrenciler where kullanici = kim('ayse')));
select bekle('bitiş hesabı: 10 Mayıs → aynı yıl 31 Ekim; 15 Ağustos → ertesi yıl',
  ((kimlik.bitis_hesapla('2027-05-10 12:00+03') at time zone 'Europe/Istanbul')::date = '2027-10-31'
   and (kimlik.bitis_hesapla('2027-08-15 12:00+03') at time zone 'Europe/Istanbul')::date = '2028-10-31'));

\echo ''
\echo '═══ K6. YÖNETİM ═══'
set role authenticated;
select test_kullanici('yonetici');
select bekle('yönetici doğrulanan alanları görür', (select jsonb_array_length(public.kimlik_yonetim_alanlar()) >= 1));
select bekle('yönetici üniversiteye ad verir', (select public.kimlik_universite_kaydet('yeniuni.edu.tr', 'Yeni Üniversite')->>'durum' = 'tamam'));
select reddedilmeli('geçersiz alan adı', $$select public.kimlik_universite_kaydet('Not A Domain', 'X')$$);
reset role;
select bekle('ad verilen alan artık adıyla', (select kimlik.universite_adi('yeniuni.edu.tr') = 'Yeni Üniversite'));

-- Sonraki test paketi (pano) için temiz başlangıç.
delete from kimlik.kodlar; delete from kimlik.gonderimler;

\echo ''
\echo '═══ TÜM DOĞRULAMA TESTLERİ GEÇTİ ═══'
