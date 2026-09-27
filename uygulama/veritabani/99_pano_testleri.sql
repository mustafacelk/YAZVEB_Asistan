-- ═══════════════════════════════════════════════════════════════════
-- PANO / NOTLAR testleri
-- ═══════════════════════════════════════════════════════════════════
--   ... -f 08_kimlik.sql -f 99_kimlik_testleri.sql -f 09_pano.sql -f 99_pano_testleri.sql
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001', 'e1@test', '{"kullanici_adi":"ekip1"}'),
  ('c0000000-0000-0000-0000-000000000002', 'e2@test', '{"kullanici_adi":"ekip2"}'),
  ('c0000000-0000-0000-0000-000000000003', 'e3@test', '{"kullanici_adi":"ekip3"}')
on conflict do nothing;

-- ── Yardımcılar (süper kullanıcıyla; "e-posta kutusu" yerine kod doğrudan) ──
create or replace function p_dogrula(p_ad text, p_eposta text) returns void language plpgsql as $$
declare r jsonb;
begin
  delete from kimlik.gonderimler where kullanici = kim(p_ad);
  r := public.kimlik_kod_olustur(kim(p_ad), p_eposta);
  if r->>'durum' <> 'tamam' then raise exception 'kod % : %', p_ad, r; end if;
  perform set_config('request.jwt.claim.sub', kim(p_ad)::text, false);
  r := public.kimlik_kod_onayla(r->>'kod');
  if r->>'durum' <> 'tamam' then raise exception 'onay % : %', p_ad, r; end if;
end $$;
create or replace function p_ozet(i integer) returns text language sql as $$
  select encode(sha256(convert_to('dosya-' || i, 'UTF8')), 'hex') $$;
create or replace function p_kunye(p_baslik text, i integer, p_turu text default 'pdf') returns jsonb language sql as $$
  select jsonb_build_object('baslik', p_baslik, 'ders_adi', 'Veri Yapıları', 'ders_kodu', 'bm 203',
    'yil', 2026, 'yariyil', 'guz', 'tur', 'ders_notu', 'dosya_turu', p_turu, 'boyut', 1000,
    'dosya_ozet', p_ozet(i), 'bolum', 'Bilgisayar Mühendisliği', 'sinif', '2') $$;
-- Tam paylaşım: künye → depo kaydı → yayın. Not kimliğini döndürür.
create or replace function p_paylas(p_ad text, p_baslik text, i integer) returns uuid language plpgsql as $$
declare r jsonb; y jsonb;
begin
  perform set_config('request.jwt.claim.sub', kim(p_ad)::text, false);
  r := public.pano_not_hazirla(p_kunye(p_baslik, i));
  if r->>'durum' <> 'tamam' then raise exception 'hazirla: %', r; end if;
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('notlar', r->>'yol', kim(p_ad), '{"mimetype": "application/pdf", "size": 1000}');
  y := public.pano_not_yayinla((r->>'id')::uuid);
  if y->>'durum' <> 'tamam' then raise exception 'yayinla: %', y; end if;
  return (r->>'id')::uuid;
end $$;
-- Bekleme süresini geçmişe alıp onay işini çalıştırır.
create or replace function p_onayla(p_id uuid) returns void language plpgsql as $$
begin
  update pano.notlar set yayinlandi = now() - interval '49 hours' where id = p_id;
  perform pano.onaylari_isle();
end $$;
create or replace function p_not_xp(p_ad text) returns integer language sql as $$
  select coalesce(sum(miktar), 0)::int from odul.puan_islemleri where kullanici = kim(p_ad) and tur = 'not' $$;
create or replace function p_verilen(p_id uuid) returns integer language sql as $$
  select coalesce((select verilen from pano.not_xp where not_id = p_id), 0) $$;
create or replace function p_as(p_ad text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', kim(p_ad)::text, false) $$;

create temporary table p_notlar (ad text primary key, id uuid);
create temporary table p_r (ad text primary key, v jsonb);
grant select, insert, update on p_notlar, p_r to authenticated;
grant execute on function p_ozet(integer), p_kunye(text, integer, text) to authenticated;

select p_dogrula('ayse', 'ayse.k@ogr.selcuk.edu.tr');
select p_dogrula('can', 'can.b@ogr.erbakan.edu.tr');
select p_dogrula('ekip1', 'e1@ogr.selcuk.edu.tr');
select p_dogrula('ekip2', 'e2@ogr.selcuk.edu.tr');
select p_dogrula('ekip3', 'e3@ogr.selcuk.edu.tr');
-- ali 99_kimlik_testleri'nde doğrulandı (Selçuk); deniz hiç doğrulanmadı.
select bekle('hazırlık: ali, ayse, can, e1-3 doğrulanmış; deniz değil',
  (select kimlik.dogrulanmis(kim('ali')) and kimlik.dogrulanmis(kim('ayse')) and kimlik.dogrulanmis(kim('can'))
      and kimlik.dogrulanmis(kim('ekip3')) and not kimlik.dogrulanmis(kim('deniz'))));

\echo ''
\echo '═══ P1. YETKİ ═══'
set role anon;
select test_anonim();
select reddedilmeli('anonim not listesini göremez', $$select public.pano_notlar()$$);
reset role;
set role authenticated;
select test_kullanici('deniz');
select reddedilmeli('üye pano tablolarını okuyamaz', $$select * from pano.notlar$$);
select reddedilmeli('üye puanı doğrudan eşitleyemez', $$select pano.xp_esitle(gen_random_uuid())$$);
select reddedilmeli('üye yönetim verisini göremez', $$select public.pano_yonetim()$$);
select reddedilmeli('üye sınav dönemi ekleyemez', $$select public.pano_sinav_kaydet('{"kurum_alani":"selcuk.edu.tr","ad":"Vize","baslangic":"2026-11-10","bitis":"2026-11-20"}')$$);
select reddedilmeli('üye sponsorlu ilan ekleyemez', $$select public.pano_sponsorlu_kaydet('{"kademe":"altin","baslik":"Bedava","bitis":"2027-01-01"}')$$);
select bekle('doğrulanmamış üye paylaşamaz → dogrulama_gerekli',
  (select public.pano_not_hazirla(p_kunye('Deneme', 900))->>'durum' = 'dogrulama_gerekli'));
reset role;

\echo ''
\echo '═══ P2. PAYLAŞIM ═══'
set role authenticated;
select test_kullanici('ali');
insert into p_r select 'hazir', public.pano_not_hazirla(p_kunye('Veri Yapıları vize notları', 1));
select bekle('künye kaydı → yol ali/<id>.pdf',
  (select v->>'durum' = 'tamam' and v->>'yol' = auth.uid()::text || '/' || (v->>'id') || '.pdf' from p_r where ad = 'hazir'));
select bekle('dosya yüklenmeden yayın yok → dosya_yok',
  (select public.pano_not_yayinla((v->>'id')::uuid)->>'durum' = 'dosya_yok' from p_r where ad = 'hazir'));
-- Depo kuralı: yalnızca kendi "yükleniyor" notunun yoluna yazılır.
select reddedilmeli('rastgele bir yola yükleme yok',
  $$insert into storage.objects (bucket_id, name, metadata) values ('notlar', auth.uid()::text || '/uydurma.pdf', '{"mimetype":"application/pdf","size":10}')$$);
insert into storage.objects (bucket_id, name, metadata)
select 'notlar', v->>'yol', '{"mimetype": "application/pdf", "size": 2048}' from p_r where ad = 'hazir';
select bekle('kendi yoluna yükleme kabul', (select count(*) = 1 from storage.objects where name = (select v->>'yol' from p_r where ad = 'hazir')));
reset role;
set role authenticated;
select test_kullanici('ayse');
select reddedilmeli('başkasının notunun yoluna yükleme yok',
  $$insert into storage.objects (bucket_id, name, metadata) select 'notlar', replace(v->>'yol', '.pdf', '-2.pdf'), '{}' from p_r where ad = 'hazir'$$);
reset role;
set role authenticated;
select test_kullanici('ali');
select bekle('yayınla → tamam', (select public.pano_not_yayinla((v->>'id')::uuid)->>'durum' = 'tamam' from p_r where ad = 'hazir'));
insert into p_notlar select 'ali1', (v->>'id')::uuid from p_r where ad = 'hazir';
select bekle('boyut depodan okunur (istemcinin 1000 dediği değil, 2048)',
  (select (x->>'boyut')::int = 2048 from jsonb_array_elements(public.pano_notlar()->'liste') x
   where x->>'id' = (select id::text from p_notlar where ad = 'ali1')));
select bekle('aynı dosya ikinci kez → kopya', (select public.pano_not_hazirla(p_kunye('Kopya', 1))->>'durum' = 'kopya'));
select reddedilmeli('eksik künye (ders adı yok) reddedilir',
  $$select public.pano_not_hazirla(p_kunye('Eksik', 50) - 'ders_adi')$$);
select reddedilmeli('görünmez karakterli başlık reddedilir',
  $$select public.pano_not_hazirla(p_kunye(E'Gizli​metin', 51))$$);
select reddedilmeli('desteklenmeyen dosya türü (exe)', $$select public.pano_not_hazirla(p_kunye('Program', 52, 'exe'))$$);
select reddedilmeli('15 MB üstü reddedilir', $$select public.pano_not_hazirla(p_kunye('Büyük', 53) || '{"boyut": 99999999}')$$);
insert into p_r select 'tur', public.pano_not_hazirla(p_kunye('Tür uyuşmazlığı', 54));
insert into storage.objects (bucket_id, name, metadata)
select 'notlar', v->>'yol', '{"mimetype": "application/x-msdownload", "size": 100}' from p_r where ad = 'tur';
select bekle('depodaki tür künyeyle uyuşmazsa → dosya_gecersiz',
  (select public.pano_not_yayinla((v->>'id')::uuid)->>'durum' = 'dosya_gecersiz' from p_r where ad = 'tur'));
reset role;
set role authenticated;
select test_kullanici('ali');
select etkilenmemeli('yazar yayındaki notunun dosyasını silemez',
  $$delete from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali1') || '%'$$);
reset role;
delete from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali1') || '%';
set role authenticated;
select test_kullanici('ali');
select reddedilmeli('yayındaki notun yoluna başka dosya yüklenemez',
  $$insert into storage.objects (bucket_id, name, metadata) select 'notlar', dosya_yolu, '{"mimetype":"application/pdf","size":10}'
    from (select v->>'yol' as dosya_yolu from p_r where ad = 'hazir') x$$);
reset role;
insert into storage.objects (bucket_id, name, owner, metadata)
select 'notlar', v->>'yol', kim('ali'), '{"mimetype": "application/pdf", "size": 2048}' from p_r where ad = 'hazir';
select bekle('ders kodu büyük harfe çevrilir', (select ders_kodu = 'BM 203' from pano.notlar where id = (select id from p_notlar where ad = 'ali1')));
select bekle('üniversite doğrulamadan (Selçuk)', (select kurum_alani = 'selcuk.edu.tr' from pano.notlar where id = (select id from p_notlar where ad = 'ali1')));
-- Günlük sınır: 5 paylaşım (ali1 dahil).
insert into p_notlar values ('ali2', p_paylas('ali', 'İkinci not', 2)), ('ali3', p_paylas('ali', 'Üçüncü not', 3)),
                            ('ali4', p_paylas('ali', 'Dördüncü not', 4)), ('ali5', p_paylas('ali', 'Beşinci not', 5));
set role authenticated;
select test_kullanici('ali');
select bekle('günde 5 paylaşımdan sonra → sınır', (select public.pano_not_hazirla(p_kunye('Altıncı', 6))->>'durum' = 'sinir'));
reset role;

\echo ''
\echo '═══ P3. GÖRME VE AÇMA ═══'
set role authenticated;
select test_kullanici('deniz');
select bekle('doğrulanmamış üye notu LİSTEDE görür', (select jsonb_array_length(public.pano_notlar('{"kurum":"tum"}')->'liste') = 5));
select bekle('doğrulanmamış üye açamaz → dogrulama_gerekli',
  (select public.pano_not_ac((select id from p_notlar where ad = 'ali1'))->>'durum' = 'dogrulama_gerekli'));
select bekle('depo da vermez (satır kuralı)', (select count(*) = 0 from storage.objects where bucket_id = 'notlar'));
reset role;
set role authenticated;
select test_kullanici('ayse');
select bekle('ayse (Selçuk) kendi üniversitesinde 5 not görür', (select jsonb_array_length(public.pano_notlar()->'liste') = 5));
select bekle('liste künyesi: üniversite adı, yazar kullanıcı adı, benim=false',
  (select x->>'universite' = 'Selçuk Üniversitesi' and x->>'yazar' = 'ali' and not (x->>'benim')::boolean
   from jsonb_array_elements(public.pano_notlar()->'liste') x limit 1));
select bekle('açmadan oy yok → once_ac',
  (select public.pano_not_oy((select id from p_notlar where ad = 'ali1'), true)->>'durum' = 'once_ac'));
select bekle('ayse açar → tamam, yol verilir',
  (select r->>'durum' = 'tamam' and r->>'yol' like '%.pdf' from (select public.pano_not_ac((select id from p_notlar where ad = 'ali1')) r) x));
select public.pano_not_ac((select id from p_notlar where ad = 'ali1'));
select bekle('aynı gün ikinci açılış sayılmaz (1)',
  (select (x->>'acilma')::int = 1 from jsonb_array_elements(public.pano_notlar()->'liste') x
   where x->>'id' = (select id::text from p_notlar where ad = 'ali1')));
select bekle('doğrulanmış kullanıcı dosyayı depodan okuyabilir', (select count(*) = 5 from storage.objects where bucket_id = 'notlar'));
reset role;
set role authenticated;
select test_kullanici('can');
select bekle('can (Erbakan) kendi üniversitesinde not görmez', (select jsonb_array_length(public.pano_notlar()->'liste') = 0));
select bekle('"tüm üniversiteler" ile görür', (select jsonb_array_length(public.pano_notlar('{"kurum":"tum"}')->'liste') = 5));
select bekle('arama: ders koduyla bulur', (select jsonb_array_length(public.pano_notlar('{"kurum":"tum","ara":"bm 20"}')->'liste') = 5));
select bekle('arama: LIKE jokeri kaçırılır (%)', (select jsonb_array_length(public.pano_notlar('{"kurum":"tum","ara":"%"}')->'liste') = 0));
select bekle('filtre: sınıf 3 → yok', (select jsonb_array_length(public.pano_notlar('{"kurum":"tum","sinif":"3"}')->'liste') = 0));
select bekle('bölüm çipleri gelir', (select public.pano_notlar('{"kurum":"tum"}')->'bolumler' ? 'Bilgisayar Mühendisliği'));
reset role;

\echo ''
\echo '═══ P4. OY VE PUAN ═══'
set role authenticated;
select test_kullanici('ali');
select bekle('kendi notuna oy yok', (select public.pano_not_oy((select id from p_notlar where ad = 'ali1'), true)->>'durum' = 'kendi'));
reset role;
set role authenticated;
select test_kullanici('ayse');
select bekle('ayse oy verir → yararlı 1',
  (select (r->>'yararli')::int = 1 and (r->>'oyum')::boolean from (select public.pano_not_oy((select id from p_notlar where ad = 'ali1'), true) r) x));
select bekle('ikinci oy sayılmaz', (select (public.pano_not_oy((select id from p_notlar where ad = 'ali1'), true)->>'yararli')::int = 1));
reset role;
select bekle('onay beklerken puan yok (48 saat)', (select p_not_xp('ali') = 0));
select p_onayla((select id from p_notlar where ad = 'ali1'));
select bekle('onayda 20 + 3×1 = 23 XP', (select p_verilen((select id from p_notlar where ad = 'ali1')) = 23 and p_not_xp('ali') = 23));
set role authenticated;
select test_kullanici('ayse');
select public.pano_not_oy((select id from p_notlar where ad = 'ali1'), false);
reset role;
select bekle('oy geri alınınca 20', (select p_verilen((select id from p_notlar where ad = 'ali1')) = 20 and p_not_xp('ali') = 20));
-- Not tavanı: 20 + 3×20 = 80 değil, 60.
insert into pano.acilislar (not_id, kullanici)
select (select id from p_notlar where ad = 'ali1'), id from public.profiller where id <> kim('ali') on conflict do nothing;
insert into pano.oylar (not_id, kullanici)
select (select id from p_notlar where ad = 'ali1'), id from public.profiller where id <> kim('ali') limit 20 on conflict do nothing;
-- Testte yalnızca 12 oy verebilecek kullanıcı var; sayaç 20'ye çekilir.
update pano.notlar set yararli = 20 where id = (select id from p_notlar where ad = 'ali1');
select pano.xp_esitle((select id from p_notlar where ad = 'ali1'));
select bekle('bir notun tavanı 60 XP', (select p_verilen((select id from p_notlar where ad = 'ali1')) = 60));
-- Haftalık tavan 150: dört not daha onaylanır (her biri 20).
select p_onayla((select id from p_notlar where ad = 'ali2'));
select p_onayla((select id from p_notlar where ad = 'ali3'));
select p_onayla((select id from p_notlar where ad = 'ali4'));
select p_onayla((select id from p_notlar where ad = 'ali5'));
select bekle('60 + 4×20 = 140 (tavanın altında)', (select p_not_xp('ali') = 140));
insert into pano.oylar (not_id, kullanici)
select (select id from p_notlar where ad = 'ali2'), id from public.profiller where id <> kim('ali') limit 10 on conflict do nothing;
update pano.notlar set yararli = 10 where id = (select id from p_notlar where ad = 'ali2');
select pano.xp_esitle((select id from p_notlar where ad = 'ali2'));
select bekle('haftalık tavan: 150''de durur', (select p_not_xp('ali') = 150));
select bekle('eksik kalan kısım notta bekler (hedef 50, verilen 30)', (select p_verilen((select id from p_notlar where ad = 'ali2')) = 30));
update odul.puan_islemleri set zaman = zaman - interval '8 days' where kullanici = kim('ali') and tur = 'not';
select pano.xp_esitle((select id from p_notlar where ad = 'ali2'));
select bekle('yeni haftada kalan 20 tamamlanır', (select p_verilen((select id from p_notlar where ad = 'ali2')) = 50 and p_not_xp('ali') = 170));
select bekle('XP önbelleği defterle aynı', (select h.xp = (select sum(miktar) from odul.puan_islemleri where kullanici = kim('ali'))
  from odul.hesaplar h where h.kullanici = kim('ali')));

\echo ''
\echo '═══ P5. SINAV DÖNEMİ ═══'
set role authenticated;
select test_kullanici('yonetici');
select bekle('yönetici Selçuk vize dönemini girer (10 gün sonra)',
  (select public.pano_sinav_kaydet(jsonb_build_object('kurum_alani', 'selcuk.edu.tr', 'ad', 'Vize',
     'baslangic', (current_date + 10)::text, 'bitis', (current_date + 20)::text))->>'durum' = 'tamam'));
select reddedilmeli('bitişi başlangıçtan önce dönem', $$select public.pano_sinav_kaydet('{"kurum_alani":"selcuk.edu.tr","ad":"Final","baslangic":"2027-01-20","bitis":"2027-01-10"}')$$);
reset role;
set role authenticated;
select test_kullanici('ayse');
select bekle('ana ekran özeti: sınav + bölümündeki not sayısı',
  (select o->'sinav'->>'ad' = 'Vize' and (o->>'dogrulandi')::boolean and (o->>'bu_hafta')::int >= 1
   from (select public.pano_ozet() o) x));
select bekle('Selçuk öğrencisi: sınav yaklaşıyor, 10 gün',
  (select s->>'asama' = 'yaklasiyor' and (s->>'gun')::int = 10 and s->>'ad' = 'Vize' from (select public.pano_notlar()->'sinav' s) x));
reset role;
set role authenticated;
select test_kullanici('can');
select bekle('Erbakan öğrencisi: Selçuk sınavı görünmez', (select public.pano_notlar()->'sinav' = 'null'::jsonb));
reset role;
insert into p_notlar values ('ayse1', p_paylas('ayse', 'Sınav öncesi özet', 10));
select bekle('sınavdan önceki 14 günde paylaşılan not işaretli', (select sinav_oncesi from pano.notlar where id = (select id from p_notlar where ad = 'ayse1')));
select p_onayla((select id from p_notlar where ad = 'ayse1'));
select bekle('sınav öncesi taban ×1,5 = 30 XP', (select p_verilen((select id from p_notlar where ad = 'ayse1')) = 30));

\echo ''
\echo '═══ P6. ŞİKAYET VE MODERASYON ═══'
set role authenticated;
select test_kullanici('ali');
select bekle('kendi notunu şikayet edemez', (select public.pano_sikayet('not', (select id::text from p_notlar where ad = 'ali3'), 'spam')->>'durum' = 'kendi'));
reset role;
set role authenticated;
select test_kullanici('deniz');
select bekle('doğrulanmamış şikayet kaydedilir', (select public.pano_sikayet('not', (select id::text from p_notlar where ad = 'ali3'), 'spam')->>'durum' = 'tamam'));
reset role;
set role authenticated;
select test_kullanici('ekip1');
select public.pano_sikayet('not', (select id::text from p_notlar where ad = 'ali3'), 'telif', 'Hocanın slaytı');
select bekle('aynı kişi ikinci kez → zaten', (select public.pano_sikayet('not', (select id::text from p_notlar where ad = 'ali3'), 'telif')->>'durum' = 'zaten'));
reset role;
set role authenticated;
select test_kullanici('ekip2');
select bekle('2 doğrulanmış + 1 doğrulanmamış: eşik (3) dolmaz',
  (select not (public.pano_sikayet('not', (select id::text from p_notlar where ad = 'ali3'), 'telif')->>'gizlendi')::boolean));
reset role;
set role authenticated;
select test_kullanici('ekip3');
select bekle('3. doğrulanmış şikayet → gizlenir',
  (select (public.pano_sikayet('not', (select id::text from p_notlar where ad = 'ali3'), 'uygunsuz')->>'gizlendi')::boolean));
select bekle('gizli not listede yok', (select not exists (select 1 from jsonb_array_elements(public.pano_notlar()->'liste') x
  where x->>'id' = (select id::text from p_notlar where ad = 'ali3'))));
select bekle('gizli notun dosyası başkasına verilmez',
  (select count(*) = 0 from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali3') || '%'));
reset role;
select bekle('gizlenince puanı geri alındı (20 → 0)', (select p_verilen((select id from p_notlar where ad = 'ali3')) = 0));
set role authenticated;
select test_kullanici('ali');
select bekle('yazar gizli notunu görür (Notlarım, şikayet işaretli)',
  (select x->>'durum' = 'gizli' and (x->>'sikayet')::boolean from jsonb_array_elements(public.pano_notlarim()->'liste') x
   where x->>'id' = (select id::text from p_notlar where ad = 'ali3')));
select bekle('yazar dosyasını hâlâ okuyabilir',
  (select count(*) = 1 from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali3') || '%'));
reset role;
set role authenticated;
select test_kullanici('yonetici');
select bekle('yönetici kuyrukta görür: 4 şikayet, telif 2',
  (select (m->>'sayi')::int = 4 and (m->'nedenler'->>'telif')::int = 2 and m->'icerik'->>'yazar' = 'ali'
   from jsonb_array_elements(public.pano_moderasyon()) m where m->>'hedef' = (select id::text from p_notlar where ad = 'ali3')));
select bekle('yönetici gizli dosyayı inceleyebilir',
  (select count(*) = 1 from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali3') || '%'));
select bekle('karar: tut → yayına döner', (select public.pano_moderasyon_karar('not', (select id::text from p_notlar where ad = 'ali3'), 'tut')->>'durum' = 'tamam'));
reset role;
select bekle('tutulunca puanı geri geldi (20)', (select p_verilen((select id from p_notlar where ad = 'ali3')) = 20
  and (select durum = 'yayinda' from pano.notlar where id = (select id from p_notlar where ad = 'ali3'))));
select bekle('karar denetim kaydında', (select exists (select 1 from odul.denetim where islem = 'moderasyon_tut')));
set role authenticated;
select test_kullanici('yonetici');
select bekle('yetkilinin şikayeti tek başına gizler',
  (select (public.pano_sikayet('not', (select id::text from p_notlar where ad = 'ali4'), 'yanlis')->>'gizlendi')::boolean));
select public.pano_moderasyon_karar('not', (select id::text from p_notlar where ad = 'ali4'), 'kaldir');
reset role;
select bekle('kaldırılan not: durum kaldirildi, puan 0',
  (select durum = 'kaldirildi' from pano.notlar where id = (select id from p_notlar where ad = 'ali4'))
  and (select p_verilen((select id from p_notlar where ad = 'ali4')) = 0));

-- Sohbet mesajı şikayeti
select p_as('deniz');
insert into public.mesajlar (yazar, icerik) values (kim('deniz'), 'Uygunsuz bir mesaj');
insert into p_r select 'mesaj', to_jsonb(max(id)) from public.mesajlar;
set role authenticated;
select test_kullanici('ali');
select public.pano_sikayet('mesaj', (select v::text from p_r where ad = 'mesaj'), 'uygunsuz');
reset role;
set role authenticated;
select test_kullanici('ayse');
select public.pano_sikayet('mesaj', (select v::text from p_r where ad = 'mesaj'), 'uygunsuz');
reset role;
set role authenticated;
select test_kullanici('can');
select bekle('3. şikayette mesaj gizlenir', (select (public.pano_sikayet('mesaj', (select v::text from p_r where ad = 'mesaj'), 'uygunsuz')->>'gizlendi')::boolean));
select bekle('gizli mesajı üyeler okuyamaz', (select count(*) = 0 from public.mesajlar where id = (select v::text::bigint from p_r where ad = 'mesaj')));
reset role;
set role authenticated;
select test_kullanici('deniz');
select bekle('yazarı kendi mesajını görür', (select count(*) = 1 from public.mesajlar where id = (select v::text::bigint from p_r where ad = 'mesaj')));
reset role;
set role authenticated;
select test_kullanici('yonetici');
select bekle('yönetici görür', (select count(*) = 1 from public.mesajlar where id = (select v::text::bigint from p_r where ad = 'mesaj')));
select public.pano_moderasyon_karar('mesaj', (select v::text from p_r where ad = 'mesaj'), 'kaldir');
select bekle('kaldır → mesaj silindi', (select count(*) = 0 from public.mesajlar where id = (select v::text::bigint from p_r where ad = 'mesaj')));
reset role;
set role authenticated;
select test_kullanici('ekip1');
select bekle('olmayan hedef → yok', (select public.pano_sikayet('mesaj', '999999999', 'spam')->>'durum' = 'yok'));
select reddedilmeli('geçersiz neden', $$select public.pano_sikayet('not', gen_random_uuid()::text, 'nefret')$$);
select reddedilmeli('üye karar veremez', $$select public.pano_moderasyon_karar('not', gen_random_uuid()::text, 'kaldir')$$);
reset role;

\echo ''
\echo '═══ P7. SİLME ═══'
set role authenticated;
select test_kullanici('ayse');
select reddedilmeli('başkasının notunu silemez', $$select public.pano_not_sil((select id from p_notlar where ad = 'ali5'))$$);
reset role;
set role authenticated;
select test_kullanici('ali');
select bekle('kendi notunu siler; dosya yolu döner (istemci depodan siler)',
  (select r->>'durum' = 'tamam' and r->>'yol' like auth.uid()::text || '/%' from (select public.pano_not_sil((select id from p_notlar where ad = 'ali5')) r) x));
delete from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali5') || '%';
select bekle('yazar kendi klasöründen dosyayı silebildi',
  (select count(*) = 0 from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali5') || '%'));
reset role;
set role authenticated;
select test_kullanici('ayse');
select etkilenmemeli('başkasının dosyasını silemez',
  $$delete from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali1') || '%'$$);
reset role;
select bekle('ayse''nin silme denemesi dosyaya dokunmadı',
  (select count(*) = 1 from storage.objects where name like '%' || (select id::text from p_notlar where ad = 'ali1') || '%'));
select bekle('silinen notun puanı geri alındı', (select p_verilen((select id from p_notlar where ad = 'ali5')) = 0));

\echo ''
\echo '═══ P8. SPONSORLU ═══'
set role authenticated;
select test_kullanici('yonetici');
select bekle('bronz her zaman', (select public.pano_sponsorlu_kaydet(jsonb_build_object('kademe', 'bronz', 'baslik', 'Kırtasiye indirimi',
  'bitis', (now() + interval '30 days')::text))->>'durum' = 'tamam'));
select bekle('altın, yalnızca sınav döneminde, yalnızca Selçuk', (select public.pano_sponsorlu_kaydet(jsonb_build_object('kademe', 'altin',
  'baslik', 'Vize haftası kahvesi', 'metin', 'Notunu gösterene %20', 'baglam', 'sinav_donemi', 'hedef_kurum', 'selcuk.edu.tr',
  'baglanti', 'https://ornek.com/kampanya', 'bitis', (now() + interval '30 days')::text))->>'durum' = 'tamam'));
select bekle('gümüş her zaman', (select public.pano_sponsorlu_kaydet(jsonb_build_object('kademe', 'gumus', 'baslik', 'Fotokopi',
  'bitis', (now() + interval '30 days')::text))->>'durum' = 'tamam'));
select bekle('süresi geçmiş ilan', (select public.pano_sponsorlu_kaydet(jsonb_build_object('kademe', 'altin', 'baslik', 'Eski',
  'baslangic', (now() - interval '10 days')::text, 'bitis', (now() - interval '1 day')::text))->>'durum' = 'tamam'));
select reddedilmeli('http bağlantı reddedilir', $$select public.pano_sponsorlu_kaydet(jsonb_build_object('kademe','bronz','baslik','X','baglanti','http://kotu.com','bitis',(now() + interval '1 day')::text))$$);
select reddedilmeli('geçersiz kademe', $$select public.pano_sponsorlu_kaydet(jsonb_build_object('kademe','elmas','baslik','X','bitis',(now() + interval '1 day')::text))$$);
reset role;
set role authenticated;
select test_kullanici('ayse');
select bekle('Selçuk, sınav yaklaşırken: altın → gümüş → bronz',
  (select array(select x->>'kademe' from jsonb_array_elements(public.pano_notlar()->'sponsorlu') x) = array['altin', 'gumus', 'bronz']));
select bekle('ikinci sayfada sponsorlu yok', (select jsonb_array_length(public.pano_notlar('{"sayfa":1}')->'sponsorlu') = 0));
reset role;
set role authenticated;
select test_kullanici('can');
select bekle('Erbakan: altın (Selçuk hedefli, sınav) görünmez',
  (select array(select x->>'kademe' from jsonb_array_elements(public.pano_notlar()->'sponsorlu') x) = array['gumus', 'bronz']));
select public.pano_sponsorlu_tikla((select (x->>'id')::uuid from jsonb_array_elements(public.pano_notlar()->'sponsorlu') x limit 1));
reset role;
select bekle('gösterim kişi başı günde bir (ayse 3 + can 2 = 5)', (select count(*) = 5 from pano.sponsorlu_olaylari where tur = 'gosterim'));
select bekle('tıklama sayıldı', (select count(*) = 1 from pano.sponsorlu_olaylari where tur = 'tiklama'));
delete from pano.sinav_donemleri;
set role authenticated;
select test_kullanici('ayse');
select bekle('sınav dönemi yokken altın (sınav bağlamlı) düşer',
  (select array(select x->>'kademe' from jsonb_array_elements(public.pano_notlar()->'sponsorlu') x) = array['gumus', 'bronz']));
reset role;

\echo ''
\echo '═══ P9. YÖNETİM VE GİZLİLİK ═══'
set role authenticated;
select test_kullanici('yonetici');
select bekle('yönetim özeti: istatistik ve sponsorlu metrikleri',
  (select (y->'istatistik'->>'dogrulanmis')::int >= 6 and jsonb_array_length(y->'sponsorlu') = 4
   from (select public.pano_yonetim() y) x));
select reddedilmeli('yönetici puan ayarını değiştiremez (başkan)', $$select public.pano_ayarlar_kaydet('{"taban_xp": 500}')$$);
reset role;
set role authenticated;
select test_kullanici('baskan');
select bekle('başkan puan ayarını değiştirir', (select (public.pano_ayarlar_kaydet('{"taban_xp": 25}')->>'taban_xp')::int = 25));
select reddedilmeli('aralık dışı ayar', $$select public.pano_ayarlar_kaydet('{"taban_xp": -5}')$$);
select public.pano_ayarlar_kaydet('{"taban_xp": 20}');
reset role;
update odul.hesaplar set gizli = true where kullanici = kim('ali');
set role authenticated;
select test_kullanici('ayse');
select bekle('gizli profilin notu adsız görünür',
  (select bool_and(x->>'yazar' is null) from jsonb_array_elements(public.pano_notlar()->'liste') x where x->>'baslik' like '%not%'));
reset role;
update odul.hesaplar set gizli = false where kullanici = kim('ali');

\echo ''
\echo '═══ TÜM PANO TESTLERİ GEÇTİ ═══'
