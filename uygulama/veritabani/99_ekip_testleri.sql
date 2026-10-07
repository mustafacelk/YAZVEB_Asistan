-- ═══════════════════════════════════════════════════════════════════
-- EKİP testleri: kadro, ortak pano, gönüllü havuzu
-- ═══════════════════════════════════════════════════════════════════
--   ... -f 09_pano.sql -f 99_pano_testleri.sql -f 10_ekip.sql -f 99_ekip_testleri.sql
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001', 'op@test',      '{"kullanici_adi":"operasyon"}'),
  ('d0000000-0000-0000-0000-000000000002', 'lidert@test',  '{"kullanici_adi":"lider_t"}'),
  ('d0000000-0000-0000-0000-000000000003', 'tas1@test',    '{"kullanici_adi":"tasarimci1"}'),
  ('d0000000-0000-0000-0000-000000000004', 'lidere@test',  '{"kullanici_adi":"lider_e"}'),
  ('d0000000-0000-0000-0000-000000000005', 'gon1@test',    '{"kullanici_adi":"gonullu1"}'),
  ('d0000000-0000-0000-0000-000000000006', 'gon2@test',    '{"kullanici_adi":"gonullu2"}')
on conflict do nothing;

-- Tarih yardımcısı: İstanbul'a göre bugün + n (ekip şemasına dokunmadan).
create or replace function t_gun(n integer) returns date language sql stable as $$
  select (now() at time zone 'Europe/Istanbul')::date + n $$;
create temporary table e_r (ad text primary key, v jsonb);
grant select, insert, update on e_r to authenticated;
grant execute on function t_gun(integer) to authenticated;
create or replace function e_kaydet(p_ad text, p_v jsonb) returns jsonb language sql as $$
  insert into e_r values (p_ad, p_v) on conflict (ad) do update set v = excluded.v returning v $$;
grant execute on function e_kaydet(text, jsonb) to authenticated;

delete from pano.sinav_donemleri;
insert into pano.sinav_donemleri (kurum_alani, ad, baslangic, bitis) values ('selcuk.edu.tr', 'Vize', t_gun(20), t_gun(26));
insert into public.etkinlikler (baslik, baslangic, ekleyen)
values ('Ekip Atölyesi', now() + interval '3 days', (select id from public.profiller where kullanici_adi = 'baskan'));

\echo ''
\echo '═══ E1. YETKİ ═══'
set role anon;
select test_anonim();
select reddedilmeli('anonim havuzu göremez', $$select public.ekip_havuz()$$);
reset role;
set role authenticated;
select test_kullanici('uye');
select reddedilmeli('üye ekip tablolarını okuyamaz', $$select * from ekip.isler$$);
select reddedilmeli('üye panoyu göremez', $$select public.ekip_pano()$$);
select reddedilmeli('üye kadroya kimseyi ekleyemez', $$select public.ekip_kadro_kaydet(jsonb_build_object('kullanici', kim('uye'), 'rol', 'baskan'))$$);
select reddedilmeli('üye puanı doğrudan veremez', $$select ekip.gonullu_xp_ver(kim('uye'), 3, 'hile')$$);
select reddedilmeli('üye açık iş yazamaz', $$select public.ekip_acik_is_kaydet(jsonb_build_object('ekip','tasarim','baslik','Deneme','sure_saat',1,'tarih',t_gun(3)))$$);
select bekle('üye havuzu görür (boş)', (select jsonb_array_length(public.ekip_havuz()->'isler') = 0));
select bekle('üyenin özeti: kadroda değil', (select (public.ekip_ozet()->>'kadroda')::boolean = false));
select test_kullanici('yonetici');
select reddedilmeli('uygulama yöneticisi kadro sayılmaz (pano kapalı)', $$select public.ekip_pano()$$);
reset role;

\echo ''
\echo '═══ E2. KADRO ═══'
set role authenticated;
select test_kullanici('baskan');
select bekle('uygulamadaki başkan panoyu görür (tam yetki)', (select (public.ekip_pano()->'ben'->>'tam_yetki')::boolean));
select bekle('başkan Operasyon BY atar',
  (select public.ekip_kadro_kaydet(jsonb_build_object('kullanici', kim('operasyon'), 'rol', 'by_operasyon'))->>'durum' = 'tamam'));
select test_kullanici('operasyon');
select bekle('Operasyon kadroyu kurar: tasarım lideri',
  (select public.ekip_kadro_kaydet(jsonb_build_object('kullanici', kim('lider_t'), 'rol', 'lider_tasarim'))->>'durum' = 'tamam'));
select bekle('Operasyon kadroyu kurar: tasarımcı',
  (select public.ekip_kadro_kaydet(jsonb_build_object('kullanici', kim('tasarimci1'), 'rol', 'tasarimci'))->>'durum' = 'tamam'));
select bekle('Operasyon kadroyu kurar: etkinlik lideri',
  (select public.ekip_kadro_kaydet(jsonb_build_object('kullanici', kim('lider_e'), 'rol', 'lider_etkinlik'))->>'durum' = 'tamam'));
select reddedilmeli('olmayan rol reddedilir', $$select public.ekip_kadro_kaydet(jsonb_build_object('kullanici', kim('gonullu1'), 'rol', 'kral'))$$);
select test_kullanici('lider_t');
select reddedilmeli('ekip lideri kadroyu düzenleyemez', $$select public.ekip_kadro_kaydet(jsonb_build_object('kullanici', kim('gonullu1'), 'rol', 'tasarimci'))$$);
select reddedilmeli('ekip lideri kişi arayamaz', $$select public.ekip_kisi_ara('gon')$$);
select test_kullanici('tasarimci1');
select e_kaydet('pano', public.ekip_pano());
select bekle('kadrodaki herkes panoyu görür; kadro 4 kişi, 17 rol, 6 ekip',
  (select jsonb_array_length(v->'kadro') = 4 and jsonb_array_length(v->'roller') = 17 and jsonb_array_length(v->'ekipler') = 6 from e_r where ad = 'pano'));
select bekle('tasarımcı hiçbir ekibi yönetmez', (select jsonb_array_length(v->'ben'->'yonettikleri') = 0 from e_r where ad = 'pano'));
select test_kullanici('lider_t');
select bekle('tasarım lideri yalnızca tasarımı yönetir', (select public.ekip_pano()->'ben'->'yonettikleri' = '["tasarim"]'::jsonb));
select test_kullanici('operasyon');
select bekle('Operasyon bütün ekipleri yönetir', (select jsonb_array_length(public.ekip_pano()->'ben'->'yonettikleri') = 6));
select bekle('sınav haftaları panoda görünür', (select jsonb_array_length(public.ekip_pano()->'sinav') = 1));
reset role;

\echo ''
\echo '═══ E3. PANO ═══'
set role authenticated;
select test_kullanici('lider_t');
select e_kaydet('is1', public.ekip_is_kaydet(jsonb_build_object('baslik', 'Şablon seti', 'ekip', 'tasarim', 'sahibi', kim('tasarimci1'), 'teslim', t_gun(5))));
select bekle('lider kendi ekibine iş yazar', (select v->>'durum' = 'tamam' from e_r where ad = 'is1'));
select reddedilmeli('lider başka ekibe iş yazamaz',
  $$select public.ekip_is_kaydet(jsonb_build_object('baslik','Salon','ekip','etkinlik','sahibi',kim('lider_e'),'teslim',t_gun(5)))$$);
select reddedilmeli('sahibi kadroda olmayan iş reddedilir',
  $$select public.ekip_is_kaydet(jsonb_build_object('baslik','Afiş','ekip','tasarim','sahibi',kim('gonullu1'),'teslim',t_gun(5)))$$);
select reddedilmeli('geçmiş teslim reddedilir',
  $$select public.ekip_is_kaydet(jsonb_build_object('baslik','Afiş','ekip','tasarim','sahibi',kim('tasarimci1'),'teslim',t_gun(-1)))$$);
select reddedilmeli('sınav haftasına teslim konmaz',
  $$select public.ekip_is_kaydet(jsonb_build_object('baslik','Afiş','ekip','tasarim','sahibi',kim('tasarimci1'),'teslim',t_gun(22)))$$);
select bekle('sınav haftasından sonraki gün olur',
  (select public.ekip_is_kaydet(jsonb_build_object('baslik', 'Final afişi', 'ekip', 'tasarim', 'sahibi', kim('tasarimci1'), 'teslim', t_gun(27)))->>'durum' = 'tamam'));
select e_kaydet('is2', public.ekip_is_kaydet(jsonb_build_object('baslik', 'Atölye afişi', 'ekip', 'tasarim', 'sahibi', kim('tasarimci1'), 'teslim', t_gun(2))));
select e_kaydet('is3', public.ekip_is_kaydet(jsonb_build_object('baslik', 'Hikâye görseli', 'ekip', 'tasarim', 'sahibi', kim('tasarimci1'), 'teslim', t_gun(1))));
select test_kullanici('operasyon');
select bekle('Operasyon her ekibe yazar',
  (select public.ekip_is_kaydet(jsonb_build_object('baslik', 'Salon talebi', 'ekip', 'etkinlik', 'sahibi', kim('lider_e'), 'teslim', t_gun(4)))->>'durum' = 'tamam'));

select test_kullanici('tasarimci1');
select bekle('sahibi kendi işini "yapılıyor"a alır',
  (select public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is1'), 'yapiliyor')->>'durum' = 'tamam'));
select bekle('sahibi işi "onayda"ya alır',
  (select public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is1'), 'onayda')->>'durum' = 'tamam'));
select reddedilmeli('sahibi "bitti" diyemez (lider karar verir)',
  $$select public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is1'), 'bitti')$$);
select e_kaydet('salon', (select x from jsonb_array_elements(public.ekip_pano()->'isler') x where x->>'baslik' = 'Salon talebi'));
select bekle('başkasının işi panoda görünür', (select v->>'id' is not null from e_r where ad = 'salon'));
select reddedilmeli('başkasının işine dokunamaz',
  $$select public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'salon'), 'yapiliyor')$$);
select bekle('teslimden önce haber verip erteler (kaçmış sayılmaz)',
  (select public.ekip_is_ertele((select (v->>'id')::bigint from e_r where ad = 'is2'), t_gun(9), 'Sınavım var')->>'durum' = 'tamam'));
select reddedilmeli('sınav haftasına ertelenemez',
  $$select public.ekip_is_ertele((select (v->>'id')::bigint from e_r where ad = 'is2'), t_gun(21))$$);
select reddedilmeli('ertelemede tarih ileri gitmeli',
  $$select public.ekip_is_ertele((select (v->>'id')::bigint from e_r where ad = 'is2'), t_gun(3))$$);
select e_kaydet('pano', public.ekip_pano());
select bekle('ertelenen iş: yeni tarih, sayaç 1, not eklendi, kaçtı yok',
  (select (x->>'teslim')::date = t_gun(9) and (x->>'ertelendi')::int = 1 and x->>'notu' like '%Sınavım var%'
          and not (x->>'kacti_kayit')::boolean
   from e_r, jsonb_array_elements(v->'isler') x where ad = 'pano' and (x->>'id')::bigint = (select (v->>'id')::bigint from e_r where ad = 'is2')));
reset role;
-- Teslim günü geçmiş iki iş (süper kullanıcıyla tarihi geri al).
update ekip.isler set teslim = t_gun(-2) where id = (select (v->>'id')::bigint from e_r where ad = 'is3');
update ekip.isler set teslim = t_gun(-1) where baslik = 'Final afişi';
select e_kaydet('gec', jsonb_build_object('id', (select id from ekip.isler where baslik = 'Final afişi')));
set role authenticated;
select test_kullanici('tasarimci1');
select reddedilmeli('teslim günü geçince sahibi erteleyemez (lidere yazmalı)',
  $$select public.ekip_is_ertele((select (v->>'id')::bigint from e_r where ad = 'is3'), t_gun(6))$$);
select bekle('geciken iş panoda işaretli',
  (select (x->>'gecikti')::boolean from jsonb_array_elements(public.ekip_pano()->'isler') x
   where (x->>'id')::bigint = (select (v->>'id')::bigint from e_r where ad = 'is3')));
select bekle('özet: kadroda, açık işleri listede',
  (select (o->>'kadroda')::boolean and jsonb_array_length(o->'isler') >= 3 from (select public.ekip_ozet() o) s));

select test_kullanici('lider_t');
select e_kaydet('k1', public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is3'), 'kacti'));
select bekle('lider "kaçtı" işler: sayaç 1, görüşme yok', (select (v->>'kacti')::int = 1 and not (v->>'gorusme')::boolean from e_r where ad = 'k1'));
select bekle('"kaçtı" ikinci kez işlenince sayaç artmaz (aynı iş)',
  (select (public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is3'), 'kacti')->>'kacti')::int = 1));
select bekle('kaçan iş sonra bitse de kayıt kalır',
  (select (public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is3'), 'bitti')->>'kacti')::int = 1));
select bekle('ikinci kaçış: sayaç 2',
  (select (public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is2'), 'kacti')->>'kacti')::int = 2));
select e_kaydet('k3', public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is1'), 'kacti'));
select bekle('üçüncüde görüşme uyarısı', (select (v->>'kacti')::int = 3 and (v->>'gorusme')::boolean from e_r where ad = 'k3'));
select bekle('yanlış işlenen "kaçtı" düzeltilir (kayıt silinir)',
  (select (public.ekip_is_durum((select (v->>'id')::bigint from e_r where ad = 'is1'), 'bitti', true)->>'kacti')::int = 2));
select reddedilmeli('kaçan iş ertelenemez', $$select public.ekip_is_ertele((select (v->>'id')::bigint from e_r where ad = 'is2'), t_gun(12))$$);
select bekle('lider teslimi geçmiş işi erteleyebilir',
  (select public.ekip_is_ertele((select (v->>'id')::bigint from e_r where ad = 'gec'), t_gun(6))->>'durum' = 'tamam'));
select bekle('panodaki kadro satırında kaçtı sayısı',
  (select (x->>'kacti')::int = 2 from jsonb_array_elements(public.ekip_pano()->'kadro') x where x->>'kullanici_adi' = 'tasarimci1'));
select test_kullanici('tasarimci1');
select reddedilmeli('sahibi iş silemez', $$select public.ekip_is_sil((select (v->>'id')::bigint from e_r where ad = 'is1'))$$);
select test_kullanici('operasyon');
select reddedilmeli('açık işi olan kişi kadrodan çıkarılamaz', $$select public.ekip_kadro_cikar(kim('tasarimci1'))$$);
select test_kullanici('lider_t');
select bekle('lider kendi ekibinin işini siler',
  (select public.ekip_is_sil((select (v->>'id')::bigint from e_r where ad = 'is1'))->>'durum' = 'tamam'));
reset role;

\echo ''
\echo '═══ E4. GÖNÜLLÜ HAVUZU ═══'
set role authenticated;
select test_kullanici('lider_t');
select e_kaydet('a1', public.ekip_acik_is_kaydet(jsonb_build_object(
  'baslik', 'Afiş metninde hata ara', 'ekip', 'tasarim', 'sure_saat', 2, 'tarih', t_gun(3), 'kontenjan', 1)));
select bekle('lider açık iş yazar', (select v->>'durum' = 'tamam' from e_r where ad = 'a1'));
select reddedilmeli('sponsorla temas açık iş olamaz',
  $$select public.ekip_acik_is_kaydet(jsonb_build_object('baslik','Sponsor firmaya e-posta at','ekip','tasarim','sure_saat',1,'tarih',t_gun(3)))$$);
select reddedilmeli('konuşmacıyı aramak açık iş olamaz',
  $$select public.ekip_acik_is_kaydet(jsonb_build_object('baslik','Konuşmacıyı telefonla ara','ekip','tasarim','sure_saat',1,'tarih',t_gun(3)))$$);
select bekle('konuşmacı afişinde yazım kontrolü serbest',
  (select public.ekip_acik_is_kaydet(jsonb_build_object('baslik', 'Konuşmacı afişindeki yazım hatalarını kontrol et',
     'ekip', 'tasarim', 'sure_saat', 1, 'tarih', t_gun(4)))->>'durum' = 'tamam'));
select reddedilmeli('sınav haftasına açık iş yazılmaz',
  $$select public.ekip_acik_is_kaydet(jsonb_build_object('baslik','Fotoğraf seçkisi','ekip','tasarim','sure_saat',1,'tarih',t_gun(23)))$$);
select reddedilmeli('lider başka ekibe açık iş yazamaz',
  $$select public.ekip_acik_is_kaydet(jsonb_build_object('baslik','Kayıt masası','ekip','etkinlik','sure_saat',1,'tarih',t_gun(3)))$$);
select reddedilmeli('süre 1–3 saat', $$select public.ekip_acik_is_kaydet(jsonb_build_object('baslik','Uzun iş','ekip','tasarim','sure_saat',5,'tarih',t_gun(3)))$$);
select test_kullanici('lider_e');
select e_kaydet('a2', public.ekip_acik_is_kaydet(jsonb_build_object(
  'baslik', 'Kayıt masasında bir saat', 'ekip', 'etkinlik', 'sure_saat', 1, 'tarih', t_gun(3), 'saat', '13:30',
  'etkinlik_id', (select id from public.etkinlikler where baslik = 'Ekip Atölyesi'), 'saha', true, 'kontenjan', 2)));
select bekle('etkinliğe bağlı saha işi', (select v->>'durum' = 'tamam' from e_r where ad = 'a2'));
select test_kullanici('tasarimci1');
select reddedilmeli('lider olmayan kadro açık iş yazamaz',
  $$select public.ekip_acik_is_kaydet(jsonb_build_object('baslik','Deneme işi','ekip','tasarim','sure_saat',1,'tarih',t_gun(3)))$$);

select test_kullanici('gonullu1');
select e_kaydet('h', public.ekip_havuz());
select bekle('üye havuzda 3 açık iş görür; puan süreye göre (2 saat = 55)',
  (select jsonb_array_length(v->'isler') = 3
      and (select (x->>'xp')::int from jsonb_array_elements(v->'isler') x where (x->>'id')::bigint = (select (v->>'id')::bigint from e_r where ad = 'a1')) = 55
   from e_r where ad = 'h'));
select bekle('etkinliğe göre süzgeç',
  (select jsonb_array_length(public.ekip_havuz(jsonb_build_object('etkinlik', (select id from public.etkinlikler where baslik = 'Ekip Atölyesi')))->'isler') = 1));
select bekle('üstlenir', (select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'a1'))->>'durum' = 'tamam'));
select bekle('ikinci kez: zaten', (select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'a1'))->>'durum' = 'zaten'));
select test_kullanici('gonullu2');
select bekle('kontenjan dolu', (select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'a1'))->>'durum' = 'dolu'));
select test_kullanici('gonullu1');
select bekle('bırakır (kayıt tutulmaz)', (select public.ekip_birak((select (v->>'id')::bigint from e_r where ad = 'a1'))->>'durum' = 'tamam'));
select test_kullanici('gonullu2');
select bekle('boşalan yeri başkası alır', (select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'a1'))->>'durum' = 'tamam'));
select bekle('"yaptım" der', (select public.ekip_yaptim((select (v->>'id')::bigint from e_r where ad = 'a1'))->>'durum' = 'tamam'));
select bekle('özetinde üstlendiği iş', (select jsonb_array_length(public.ekip_ozet()->'ustlenmeler') = 1));
select test_kullanici('tasarimci1');
select reddedilmeli('lider olmayan onaylayamaz',
  $$select public.ekip_karar((select (v->>'id')::bigint from e_r where ad = 'a1'), kim('gonullu2'), 'onayla')$$);
select test_kullanici('lider_e');
select reddedilmeli('başka ekibin lideri onaylayamaz',
  $$select public.ekip_karar((select (v->>'id')::bigint from e_r where ad = 'a1'), kim('gonullu2'), 'onayla')$$);
select test_kullanici('lider_t');
select bekle('lider onaylar: 55 XP',
  (select (public.ekip_karar((select (v->>'id')::bigint from e_r where ad = 'a1'), kim('gonullu2'), 'onayla')->>'xp')::int = 55));
reset role;
select bekle('puan defterinde "gonullu" kaydı', (select sum(miktar) = 55 from odul.puan_islemleri where kullanici = kim('gonullu2') and tur = 'gonullu'));
set role authenticated;

-- "Olmadı": kayıt tutulmaz, puan yok.
select test_kullanici('gonullu1');
select bekle('saha işini üstlenir', (select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'a2'))->>'durum' = 'tamam'));
select test_kullanici('lider_e');
select bekle('lider "olmadı" der', (select (public.ekip_karar((select (v->>'id')::bigint from e_r where ad = 'a2'), kim('gonullu1'), 'olmadi')->>'xp')::int = 0));
reset role;
select bekle('olmadı: puan yok', (select count(*) = 0 from odul.puan_islemleri where kullanici = kim('gonullu1') and tur = 'gonullu'));
set role authenticated;
select test_kullanici('gonullu1');
select bekle('olmadı: gönüllünün özetinde iz yok', (select jsonb_array_length(public.ekip_ozet()->'ustlenmeler') = 0));

-- Haftalık tavan: 55 + 80 + 80 → 150'de durur.
select test_kullanici('lider_t');
select e_kaydet('b1', public.ekip_acik_is_kaydet(jsonb_build_object('baslik', 'Fotoğraf seçkisi', 'ekip', 'tasarim', 'sure_saat', 3, 'tarih', t_gun(5))));
select e_kaydet('b2', public.ekip_acik_is_kaydet(jsonb_build_object('baslik', 'Sertifika taslağı', 'ekip', 'tasarim', 'sure_saat', 3, 'tarih', t_gun(5))));
select test_kullanici('gonullu2');
select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'b1'));
select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'b2'));
select test_kullanici('lider_t');
select bekle('üç saatlik iş 80 XP', (select (public.ekip_karar((select (v->>'id')::bigint from e_r where ad = 'b1'), kim('gonullu2'), 'onayla')->>'xp')::int = 80));
select bekle('haftalık tavan: kalan 15', (select (public.ekip_karar((select (v->>'id')::bigint from e_r where ad = 'b2'), kim('gonullu2'), 'onayla')->>'xp')::int = 15));
reset role;
select bekle('gönüllü puanı haftada 150', (select sum(miktar) = 150 from odul.puan_islemleri where kullanici = kim('gonullu2') and tur = 'gonullu'));
set role authenticated;

select test_kullanici('gonullu2');
select bekle('havuz: tamamlanan 3', (select (public.ekip_havuz()->>'tamamlanan')::int = 3));
select test_kullanici('lider_t');
select e_kaydet('y', public.ekip_havuz_yonetim());
select bekle('yönetim görünümü: üstlenenler adıyla',
  (select exists (select 1 from jsonb_array_elements(v->'isler') x, jsonb_array_elements(x->'ustlenenler') u
                  where u->>'kullanici_adi' = 'gonullu2' and u->>'durum' = 'onaylandi') from e_r where ad = 'y'));
select bekle('bu ay tasarım ekibinin açık işi sayılır (hedef 2)',
  (select (v->'ay'->>'tasarim')::int >= 4 and (v->>'hedef')::int = 2 from e_r where ad = 'y'));
select bekle('koltuk için ilk aday: gonullu2 (3 iş)',
  (select v->'adaylar'->0->>'kullanici_adi' = 'gonullu2' and (v->'adaylar'->0->>'tamamlanan')::int = 3 from e_r where ad = 'y'));
select test_kullanici('operasyon');
select bekle('Operasyon kişi ararken gönüllü geçmişini görür',
  (select (x->>'gonullu')::int = 3 from jsonb_array_elements(public.ekip_kisi_ara('gonullu2')) x where x->>'kullanici_adi' = 'gonullu2'));
select test_kullanici('uye');
select reddedilmeli('üye havuz yönetimini göremez', $$select public.ekip_havuz_yonetim()$$);
select reddedilmeli('üye karar veremez', $$select public.ekip_karar((select (v->>'id')::bigint from e_r where ad = 'b1'), kim('gonullu2'), 'onayla')$$);

-- İptal: üstlenenler serbest kalır.
select test_kullanici('gonullu1');
select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'a2'));
select test_kullanici('lider_e');
select bekle('lider iptal eder', (select public.ekip_acik_is_kapat((select (v->>'id')::bigint from e_r where ad = 'a2'), 'iptal')->>'durum' = 'tamam'));
select test_kullanici('gonullu1');
select bekle('iptal edilen iş havuzdan ve özetten düşer',
  (select not exists (select 1 from jsonb_array_elements(public.ekip_havuz()->'isler') x
                      where (x->>'id')::bigint = (select (v->>'id')::bigint from e_r where ad = 'a2'))
      and jsonb_array_length(public.ekip_ozet()->'ustlenmeler') = 0));
select bekle('iptal edilen işe üstlenilemez', (select public.ekip_ustlen((select (v->>'id')::bigint from e_r where ad = 'a2'))->>'durum' = 'kapali'));
reset role;

-- Sınav haftasının içindeyken havuza iş yazılmaz.
insert into pano.sinav_donemleri (kurum_alani, ad, baslangic, bitis) values ('selcuk.edu.tr', 'Final', t_gun(-1), t_gun(1));
set role authenticated;
select test_kullanici('lider_t');
select reddedilmeli('sınav haftasındayken havuza iş yazılmaz',
  $$select public.ekip_acik_is_kaydet(jsonb_build_object('baslik','Bülten taraması','ekip','tasarim','sure_saat',1,'tarih',t_gun(10)))$$);
select bekle('havuz sınav haftasını bildirir', (select public.ekip_havuz()->>'sinav' = 'Final'));
reset role;

\echo ''
\echo '═══ E5. AYARLAR ve SÜZGEÇ ═══'
select bekle('temas süzgeci: e-posta yakalanır', ekip.dis_temas_mi('Sponsor adaylarına e-posta'));
select bekle('temas süzgeci: konuşmacı karşılama serbest', not ekip.dis_temas_mi('Konuşmacıyı salonda karşıla'));
select bekle('temas süzgeci: sponsor logosu serbest', not ekip.dis_temas_mi('Sponsor logosunu afişe yerleştir'));
set role authenticated;
select test_kullanici('operasyon');
select reddedilmeli('Operasyon puan ayarını değiştiremez', $$select public.ekip_ayarlar_kaydet('{"xp_1saat": 500}')$$);
select test_kullanici('baskan');
select bekle('başkan ayar değiştirir', (select (public.ekip_ayarlar_kaydet('{"kacti_esigi": 4}')->>'kacti_esigi')::int = 4));
select reddedilmeli('aralık dışı ayar reddedilir', $$select public.ekip_ayarlar_kaydet('{"kacti_esigi": 99}')$$);
select public.ekip_ayarlar_kaydet('{"kacti_esigi": 3}');
reset role;

delete from pano.sinav_donemleri;
\echo ''
\echo '═══ EKİP testleri tamam ═══'
