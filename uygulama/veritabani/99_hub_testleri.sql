-- ═══════════════════════════════════════════════════════════════════
-- YAZVEB HUB — ekonomi, oda, sosyal, çark testleri
-- ═══════════════════════════════════════════════════════════════════
--   ... -f 05_oduller.sql -f 99_odul_testleri.sql -f 06_isletme.sql
--       -f 99_isletme_testleri.sql -f 07_hub.sql -f 99_hub_testleri.sql
-- ═══════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

create or replace function hub_coin(p_ad text) returns integer language sql as $$
  select coin from hub.oyuncular where kullanici = kim(p_ad) $$;
create or replace function hub_adet(p_ad text, p_esya text) returns integer language sql as $$
  select coalesce((select adet from hub.envanter where kullanici = kim(p_ad) and esya_id = p_esya), 0) $$;

\echo ''
\echo '═══ H1. YETKİ ═══'
set role anon;
select test_anonim();
select reddedilmeli('anonim HUB profili açamaz', $$select public.hub_profil()$$);
select reddedilmeli('anonim oda göremez', $$select public.hub_bina()$$);
reset role;
set role authenticated;
select test_kullanici('uye');
select reddedilmeli('üye hub tablolarını okuyamaz (şema kapalı)', $$select * from hub.oyuncular$$);
select reddedilmeli('üye Coin''i doğrudan yazamaz', $$select hub.coin_ekle(auth.uid(), 99999, 'gorev', 'hile')$$);
select reddedilmeli('istemci fiyat gönderemez (öyle parametre yok)', $$select public.hub_satin_al(p_esya => 'konsol', p_fiyat => 0)$$);
reset role;

\echo ''
\echo '═══ H2. İLK GİRİŞ ═══'
set role authenticated;
select test_kullanici('uye');
create temporary table h_ilk as select public.hub_profil() as v;
grant select on h_ilk to authenticated;
select bekle('karşılama: 150 Coin', (select (v->>'coin')::int = 150 from h_ilk));
select bekle('başlangıç eşyaları envanterde (5)', (select (select count(*) from jsonb_object_keys(v->'envanter')) = 5 from h_ilk));
select bekle('oda masa + sandalyeyle başlar', (select jsonb_array_length(v->'ben'->'oda') = 2 from h_ilk));
select bekle('karakter giyinik başlar', (select v->'ben'->'avatar'->'giyili' ? 'ust' from h_ilk));
select bekle('ikinci giriş karşılamayı tekrarlamaz', (select (public.hub_profil()->>'coin')::int = 150));
select bekle('çark ilk hafta hazır, olasılıklar toplamı 100',
  (select (v->'cark'->>'hazir')::boolean
      and abs((select sum((d->>'olasilik')::numeric) from jsonb_array_elements(v->'cark'->'dilimler') d) - 100) < 0.5 from h_ilk));
reset role;
select bekle('defterde tek karşılama satırı',
  (select count(*) = 1 from hub.coin_islemleri where kullanici = kim('uye') and tur = 'hosgeldin'));

\echo ''
\echo '═══ H3. SATIN ALMA ═══'
set role authenticated;
select test_kullanici('uye');
select bekle('mavi tişört (80) → tamam, bakiye 70',
  (select r->>'durum' = 'tamam' and (r->>'coin')::int = 70 from (select public.hub_satin_al('tisort_mavi') r) x));
select bekle('aynı kıyafet ikinci kez → zaten_var', (select public.hub_satin_al('tisort_mavi')->>'durum' = 'zaten_var'));
select bekle('konsol (500) → yetersiz, 430 eksik',
  (select r->>'durum' = 'yetersiz' and (r->>'eksik')::int = 430 from (select public.hub_satin_al('konsol') r) x));
select bekle('yalnızca çarktan çıkan eşya satın alınamaz', (select public.hub_satin_al('ceket_yazveb')->>'durum' = 'satista_degil'));
select bekle('başlangıç eşyası satın alınamaz', (select public.hub_satin_al('masa_basit')->>'durum' = 'satista_degil'));
select bekle('olmayan eşya → satista_degil', (select public.hub_satin_al('uydurma')->>'durum' = 'satista_degil'));
select bekle('küçük bitki (60) → bakiye 10', (select (public.hub_satin_al('bitki_kucuk')->>'coin')::int = 10));
reset role;
select bekle('bakiye asla eksiye düşmedi ve defterle tutarlı',
  (select o.coin = (select sum(miktar) from hub.coin_islemleri c where c.kullanici = o.kullanici) and o.coin >= 0
   from hub.oyuncular o where o.kullanici = kim('uye')));

\echo ''
\echo '═══ H4. KARAKTER ═══'
set role authenticated;
select test_kullanici('uye');
select bekle('sahip olunan kıyafetle kayıt → tamam',
  (select public.hub_avatar_kaydet('{"ten":3,"sac":2,"sac_renk":1,"yuz":1,"giyili":{"ust":"tisort_mavi","alt":"pantolon_kot","ayakkabi":"spor_beyaz"}}')->>'durum' = 'tamam'));
select reddedilmeli_mesaj('sahip olunmayan kıyafet giyilemez',
  $$select public.hub_avatar_kaydet('{"ten":3,"sac":2,"sac_renk":1,"yuz":1,"giyili":{"ust":"sweat_yazveb","alt":"pantolon_kot","ayakkabi":"spor_beyaz"}}')$$, 'sende yok');
select reddedilmeli_mesaj('kıyafet yanlış yerde giyilemez',
  $$select public.hub_avatar_kaydet('{"ten":3,"sac":2,"sac_renk":1,"yuz":1,"giyili":{"ust":"tisort_mavi","alt":"tisort_beyaz","ayakkabi":"spor_beyaz"}}')$$, 'sende yok');
select reddedilmeli_mesaj('alt giyilmeden kayıt yok',
  $$select public.hub_avatar_kaydet('{"ten":3,"sac":2,"sac_renk":1,"yuz":1,"giyili":{"ust":"tisort_mavi","ayakkabi":"spor_beyaz"}}')$$, 'seçilmeli');
select reddedilmeli_mesaj('aralık dışı görünüş reddedilir',
  $$select public.hub_avatar_kaydet('{"ten":9,"sac":2,"sac_renk":1,"yuz":1,"giyili":{"ust":"tisort_mavi","alt":"pantolon_kot","ayakkabi":"spor_beyaz"}}')$$, 'görünüş');
select public.hub_avatar_kaydet('{"ten":1,"sac":0,"sac_renk":0,"yuz":0,"admin":true,"giyili":{"ust":"tisort_mavi","alt":"pantolon_kot","ayakkabi":"spor_beyaz"}}');
reset role;
select bekle('bilinmeyen alan saklanmaz (admin yok)',
  (select not (avatar ? 'admin') and avatar->>'ten' = '1' from hub.oyuncular where kullanici = kim('uye')));

\echo ''
\echo '═══ H5. ODA ═══'
set role authenticated;
select test_kullanici('uye');
select reddedilmeli_mesaj('sahip olunandan fazla eşya konamaz',
  $$select public.hub_oda_kaydet('[{"esya":"bitki_kucuk","x":0,"z":0},{"esya":"bitki_kucuk","x":1,"z":0}]')$$, 'yetmeyen');
select reddedilmeli_mesaj('olmayan eşya konamaz',
  $$select public.hub_oda_kaydet('[{"esya":"konsol","x":0,"z":0}]')$$, 'yetmeyen');
select reddedilmeli_mesaj('iki mobilya aynı hücreye konamaz',
  $$select public.hub_oda_kaydet('[{"esya":"masa_basit","x":2,"z":2},{"esya":"sandalye_basit","x":2,"z":2}]')$$, 'aynı yerde');
select reddedilmeli_mesaj('oda dışına konamaz',
  $$select public.hub_oda_kaydet('[{"esya":"masa_basit","x":6,"z":0}]')$$, 'dışında');
select reddedilmeli_mesaj('kıyafet odaya konamaz',
  $$select public.hub_oda_kaydet('[{"esya":"tisort_mavi","x":0,"z":0}]')$$, 'Bilinmeyen');
select reddedilmeli_mesaj('41 eşya reddedilir',
  format($$select public.hub_oda_kaydet(%L)$$, (select jsonb_agg(jsonb_build_object('esya','masa_basit','x',0,'z',0)) from generate_series(1,41))), '40');
select bekle('geçerli yerleşim → tamam',
  (select public.hub_oda_kaydet('[{"esya":"masa_basit","x":1,"z":0,"yon":0},{"esya":"sandalye_basit","x":1,"z":1,"yon":2},{"esya":"bitki_kucuk","x":5,"z":0}]')->>'durum' = 'tamam'));
select bekle('"odanı düzenle" görevi ilerledi',
  (select (g->>'ilerleme')::int = 1 from jsonb_array_elements(public.hub_profil()->'gorevler') g where g->>'kod' = 'oda_duzen'));
select bekle('oda görevi ödülü → +30', (select (public.hub_gorev_al('oda_duzen')->>'odul')::int = 30));
select bekle('aynı görev bugün ikinci kez → zaten_alindi', (select public.hub_gorev_al('oda_duzen')->>'durum' = 'zaten_alindi'));
reset role;

\echo ''
\echo '═══ H6. ZİYARET VE GÜNLÜK GÖREVLER ═══'
set role authenticated;
select test_kullanici('ayse'); select public.hub_profil();
select test_kullanici('can');  select public.hub_profil();
select test_kullanici('ali');  select public.hub_profil();
select bekle('ziyaret görevi ziyaretten önce → tamamlanmadi', (select public.hub_gorev_al('ziyaret_1')->>'durum' = 'tamamlanmadi'));
select bekle('uye''nin odası görünür: karakter + oda',
  (select r->>'durum' = 'tamam' and r->'oyuncu'->'avatar' ? 'giyili' and jsonb_array_length(r->'oyuncu'->'oda') = 3
   from (select public.hub_oda(kim('uye')) r) x));
select public.hub_oda(kim('uye'));   -- aynı gün ikinci ziyaret
select public.hub_oda(kim('ali'));   -- kendi odası
select public.hub_oda(kim('deniz')); -- HUB'a hiç girmemiş üye
reset role;
select bekle('aynı gün aynı oda bir kez; kendi odası ve kurulmamış oda sayılmaz',
  (select count(*) = 1 from hub.ziyaretler where ziyaretci = kim('ali')));
set role authenticated;
select test_kullanici('ali');
select bekle('1 ziyaret görevi → +20', (select (public.hub_gorev_al('ziyaret_1')->>'odul')::int = 20));
select bekle('3 ziyaret görevi henüz değil', (select public.hub_gorev_al('ziyaret_3')->>'durum' = 'tamamlanmadi'));
select public.hub_oda(kim('ayse')); select public.hub_oda(kim('can'));
select bekle('3 farklı oda → +75', (select (public.hub_gorev_al('ziyaret_3')->>'odul')::int = 75));
select bekle('bilinmeyen görev → gecersiz', (select public.hub_gorev_al('hile')->>'durum' = 'gecersiz'));
reset role;

\echo ''
\echo '═══ H7. HEDİYE ═══'
set role authenticated;
select test_kullanici('ali');
select bekle('emoji hediye → tamam', (select public.hub_hediye(kim('uye'), 'emoji', 'kahve', 'Kolay gelsin!')->>'durum' = 'tamam'));
select bekle('bilinmeyen emoji → gecersiz', (select public.hub_hediye(kim('uye'), 'emoji', '<script>')->>'durum' = 'gecersiz'));
select bekle('kendine hediye → gecersiz', (select public.hub_hediye(kim('ali'), 'emoji', 'kalp')->>'durum' = 'gecersiz'));
select bekle('HUB''a girmemiş üyeye → gecersiz', (select public.hub_hediye(kim('deniz'), 'emoji', 'kalp')->>'durum' = 'gecersiz'));
select bekle('görünmez karakterli mesaj → gecersiz',
  (select public.hub_hediye(kim('uye'), 'emoji', 'kalp', E'selam‮')->>'durum' = 'gecersiz'));
select bekle('sahip olunmayan eşya hediye edilemez', (select public.hub_hediye(kim('uye'), 'esya', 'konsol')->>'durum' = 'yok'));
select bekle('hediye görevi → +25', (select (public.hub_gorev_al('hediye_1')->>'odul')::int = 25));
select test_kullanici('uye');
select bekle('eşya hediyesi: odadaki son bitki verilir → tamam', (select public.hub_hediye(kim('ali'), 'esya', 'bitki_kucuk')->>'durum' = 'tamam'));
reset role;
select bekle('bitki uye''den düştü, ali''ye geçti', hub_adet('uye', 'bitki_kucuk') = 0 and hub_adet('ali', 'bitki_kucuk') = 1);
select bekle('verilen bitki uye''nin odasından da kalktı',
  (select not exists (select 1 from jsonb_array_elements(oda) a where a->>'esya' = 'bitki_kucuk')
          and jsonb_array_length(oda) = 2 from hub.oyuncular where kullanici = kim('uye')));
set role authenticated;
select test_kullanici('uye');
select bekle('gelen kutusunda ali''nin kahvesi ve mesajı',
  (select bool_or(h->>'icerik' = 'kahve' and h->>'mesaj' = 'Kolay gelsin!' and (h->>'yeni')::boolean)
   from jsonb_array_elements(public.hub_gelenler()->'hediyeler') h));
select bekle('açılınca görüldü sayılır', (select (public.hub_profil()->>'yeni_hediye')::int = 0));
select bekle('ziyaretçiler listesinde ali', (select bool_or(z->>'id' = kim('ali')::text) from jsonb_array_elements(public.hub_gelenler()->'ziyaretciler') z));
select test_kullanici('can');
do $$ declare i int; begin for i in 1..10 loop perform public.hub_hediye(kim('ayse'), 'emoji', 'yildiz'); end loop; end $$;
select bekle('günde 10 hediye sınırı → sinir', (select public.hub_hediye(kim('ayse'), 'emoji', 'yildiz')->>'durum' = 'sinir'));
reset role;

\echo ''
\echo '═══ H8. ETKİNLİK QR''SİNDEN COIN ═══'
set role authenticated;
select test_kullanici('uye');
create temporary table h_etk as select public.hub_profil()->'etkinlik_coin' as v;
grant select on h_etk to authenticated;
select bekle('okutulmuş etkinlikler Coin''e çevrilmeyi bekliyor', (select jsonb_array_length(v) > 0 from h_etk));
create temporary table h_al as select public.hub_etkinlik_coin_al() as v;
grant select on h_al to authenticated;
select bekle('kazanılan = bekleyenlerin toplamı',
  (select (a.v->>'kazanilan')::int = (select sum((e->>'coin')::int) from h_etk, jsonb_array_elements(h_etk.v) e) from h_al a));
select bekle('ikinci kez → yok (her okutma bir kez)', (select public.hub_etkinlik_coin_al()->>'durum' = 'yok'));
reset role;
select bekle('etkinlik Coin''i XP''ye dokunmadı (defter ayrı)',
  (select not exists (select 1 from odul.puan_islemleri where aciklama like 'Şans%' or tur not in ('gorev','seri_bonusu','yonetici'))));

\echo ''
\echo '═══ H9. ŞANS ÇARKI ═══'
set role authenticated;
select test_kullanici('ayse');
create temporary table h_cark as select public.hub_cark_cevir() as v;
grant select on h_cark to authenticated;
select bekle('ilk çevirme → tamam, geçerli dilim',
  (select v->>'durum' = 'tamam' and (v->>'dilim')::int between 1 and 7 and ((v->>'coin')::int > 0 or v->>'esya' is not null) from h_cark));
select bekle('aynı hafta ikinci kez → bekle', (select public.hub_cark_cevir()->>'durum' = 'bekle'));
reset role;

-- Dağılım: 2000 çevirme (her seferinde geçen haftaya çekilerek). Boş dilim yok,
-- her sonuç ya Coin ya da envantere giren eşya; defter tutarlı kalır.
create temporary table h_dagilim (dilim int, coin int, esya text);
grant insert, select on h_dagilim to authenticated;
do $$
declare i int; r jsonb;
begin
  for i in 1..2000 loop
    update hub.oyuncular set son_cark = now() - interval '8 days' where kullanici = kim('can');
    perform test_kullanici('can');   -- kimlik: auth.uid() = can
    r := public.hub_cark_cevir();
    insert into h_dagilim values ((r->>'dilim')::int, (r->>'coin')::int, r->>'esya');
  end loop;
end $$;
reset role;
select bekle('2000 çevirmenin hepsi sonuçlandı', (select count(*) = 2000 from h_dagilim));
select bekle('her sonuç Coin ya da eşya (boş dilim yok)', (select bool_and(coin > 0 or esya is not null) from h_dagilim));
select bekle('7 dilimin hepsi çıktı', (select count(distinct dilim) = 7 from h_dagilim));
select bekle('dilim ağırlıkları toplamı 100 (ekrandaki yüzdeler doğru)', (select sum(agirlik) = 100 from hub.cark_dilimleri()));
-- Her dilim yazılı olasılığına uyar: sapma 5 standart sapmayı geçmez (şans
-- eseri düşme olasılığı milyonda birler mertebesinde; iki ağırlığın yer
-- değiştirmesi gibi hatalar ise yakalanır: 100 ↔ 250 Coin farkı ~8σ).
select bekle('her dilim yazılan olasılığa uyuyor (±5σ)',
  (select bool_and(abs(coalesce(g.n, 0) - 2000 * c.agirlik / 100.0)
                   <= 5 * sqrt(2000 * (c.agirlik / 100.0) * (1 - c.agirlik / 100.0)))
     from hub.cark_dilimleri() c
     left join (select dilim, count(*) n from h_dagilim group by dilim) g on g.dilim = c.sira));
select bekle('çarktan çıkan eşyalar gerçekten envanterde',
  (select bool_and(hub_adet('can', esya) > 0) from h_dagilim where esya is not null));

\echo ''
\echo '═══ H9b. BAŞKASININ EŞYASI ═══'
set role authenticated;
select test_kullanici('ali');
select bekle('ali siyah bere alır', (select public.hub_satin_al('bere_siyah')->>'durum' = 'tamam'));
select test_kullanici('uye');
select reddedilmeli_mesaj('başkasının sahip olduğu kıyafet giyilemez',
  $$select public.hub_avatar_kaydet('{"ten":1,"sac":0,"sac_renk":0,"yuz":0,"giyili":{"ust":"tisort_mavi","alt":"pantolon_kot","ayakkabi":"spor_beyaz","sapka":"bere_siyah"}}')$$, 'sende yok');
select reddedilmeli_mesaj('başkasının odasındaki eşya yerleştirilemez',
  $$select public.hub_oda_kaydet('[{"esya":"bitki_kucuk","x":0,"z":0}]')$$, 'yetmeyen');
reset role;

\echo ''
\echo '═══ H10. DEFTER BÜTÜNLÜĞÜ ═══'
select bekle('her oyuncuda bakiye = defter toplamı ve ≥ 0',
  (select bool_and(o.coin = coalesce((select sum(miktar) from hub.coin_islemleri c where c.kullanici = o.kullanici), 0) and o.coin >= 0)
   from hub.oyuncular o));
set role authenticated;
select test_kullanici('ali');
select bekle('bina: kendi odan en başta, bölüm eşikleri var',
  (select (b->'odalar'->0->>'ben')::boolean and jsonb_array_length(b->'bolumler') = 3
   from (select public.hub_bina() b) x));
reset role;

\echo ''
\echo '═══ TÜM HUB TESTLERİ GEÇTİ ═══'
