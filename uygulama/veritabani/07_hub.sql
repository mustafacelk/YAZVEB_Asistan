-- ═══════════════════════════════════════════════════════════════════
-- YAZVEB HUB — topluluğun dijital kampüsü (karakter, oda, Coin, çark)
-- ═══════════════════════════════════════════════════════════════════
-- 05_oduller.sql'den SONRA çalıştırılır. Tekrar çalıştırmak zararsızdır.
--
-- MİMARİ KARARLAR
-- ───────────────
-- 1. Ödül sistemiyle aynı kalıp: tablolar API'ye kapalı "hub" şemasında,
--    istemci yalnızca public.hub_* fonksiyonlarını çağırır. Coin, fiyat,
--    envanter, çark sonucu İSTEMCİDEN KABUL EDİLMEZ.
--
-- 2. Coin, XP'den AYRI bir para birimidir. XP sıralamayı ve sponsor
--    kilitlerini belirler; Coin yalnızca karakter ve oda için harcanır.
--    Coin harcamak XP'yi düşürmez, çark XP vermez: oyun, topluluğun asıl
--    ödül defterini bozamaz.
--
-- 3. Çark kumar DEĞİLDİR: haftada bir, ücretsiz; Coin ya da parayla ek
--    çevirme yok; bütün dilimlerin olasılığı arayüzde yazılı.
--
-- 4. Etkinlik ekonomiyi besler: okutulan her etkinlik QR'si (odul şeması)
--    bir kez Coin'e çevrilebilir. 05'e dokunulmaz; bağlantı buradan kurulur.
--
-- 5. Gerçek zamanlı çok oyunculu değil: başkasının odası son kaydedilmiş
--    hâliyle görünür. Sunucu maliyeti ve karmaşıklık yok.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

create schema if not exists hub;
revoke all on schema hub from public, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- TABLOLAR
-- ═══════════════════════════════════════════════════════════════════

-- Katalog: eşyanın kimliği, fiyatı, yeri. 3B modeli istemcide, aynı kimlikle.
create table if not exists hub.esyalar (
  id         text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  ad         text not null check (char_length(ad) between 2 and 40),
  tur        text not null check (tur in ('kiyafet', 'oda')),
  -- kiyafet: ust, alt, ayakkabi, sapka, gozluk, canta · oda: mobilya, zemin, duvar
  slot       text not null check (slot in ('ust', 'alt', 'ayakkabi', 'sapka', 'gozluk', 'canta',
                                           'mobilya', 'zemin', 'duvar')),
  fiyat      integer not null check (fiyat between 0 and 100000),
  nadirlik   text not null default 'siradan' check (nadirlik in ('siradan', 'nadir', 'efsane')),
  -- false: mağazada yok (başlangıç eşyası ya da yalnızca çarktan çıkar)
  satista    boolean not null default true,
  baslangic  boolean not null default false,
  siralama   integer not null default 0,
  check ((tur = 'kiyafet') = (slot in ('ust', 'alt', 'ayakkabi', 'sapka', 'gozluk', 'canta')))
);

create table if not exists hub.oyuncular (
  kullanici     uuid primary key references public.profiller(id) on delete cascade,
  coin          integer not null default 0 check (coin >= 0),
  -- {"ten":0-5,"sac":0-4,"sac_renk":0-5,"yuz":0-3,"giyili":{"ust":"tisort_beyaz",...}}
  avatar        jsonb not null default '{}'::jsonb,
  -- [{"esya":"masa_basit","x":1,"z":2,"yon":0}, ...]
  oda           jsonb not null default '[]'::jsonb,
  oda_kaydedildi timestamptz,
  son_cark      timestamptz,
  olusturuldu   timestamptz not null default now(),
  guncellendi   timestamptz not null default now()
);

create table if not exists hub.envanter (
  kullanici  uuid not null references public.profiller(id) on delete cascade,
  esya_id    text not null references hub.esyalar(id) on delete cascade,
  adet       integer not null default 1 check (adet between 0 and 99),
  primary key (kullanici, esya_id)
);

-- Coin defteri: her değişiklik bir satır; bakiye oyuncular.coin'de önbellek.
create table if not exists hub.coin_islemleri (
  id         bigint generated always as identity primary key,
  kullanici  uuid not null references public.profiller(id) on delete cascade,
  miktar     integer not null check (miktar <> 0),
  tur        text not null check (tur in ('hosgeldin', 'gorev', 'etkinlik', 'cark', 'satin_alma', 'iade')),
  aciklama   text not null check (char_length(aciklama) between 1 and 120),
  zaman      timestamptz not null default now()
);
create index if not exists hub_coin_idx on hub.coin_islemleri (kullanici, zaman desc);

-- Günde, kişi başına, oda başına bir ziyaret sayılır.
create table if not exists hub.ziyaretler (
  ziyaretci  uuid not null references public.profiller(id) on delete cascade,
  sahip      uuid not null references public.profiller(id) on delete cascade,
  gun        date not null,
  zaman      timestamptz not null default now(),
  primary key (ziyaretci, sahip, gun),
  check (ziyaretci <> sahip)
);
create index if not exists hub_ziyaret_sahip_idx on hub.ziyaretler (sahip, zaman desc);

create table if not exists hub.hediyeler (
  id         bigint generated always as identity primary key,
  gonderen   uuid not null references public.profiller(id) on delete cascade,
  alici      uuid not null references public.profiller(id) on delete cascade,
  tur        text not null check (tur in ('emoji', 'esya')),
  icerik     text not null check (char_length(icerik) between 1 and 40),
  mesaj      text check (char_length(mesaj) <= 80),
  zaman      timestamptz not null default now(),
  goruldu    boolean not null default false,
  check (gonderen <> alici)
);
create index if not exists hub_hediye_alici_idx on hub.hediyeler (alici, zaman desc);
create index if not exists hub_hediye_gonderen_idx on hub.hediyeler (gonderen, zaman desc);

-- Alınmış günlük görev ödülleri: aynı görev aynı gün bir kez.
create table if not exists hub.gorev_odulleri (
  kullanici  uuid not null references public.profiller(id) on delete cascade,
  gorev      text not null,
  gun        date not null,
  primary key (kullanici, gorev, gun)
);

-- Coin'e çevrilmiş etkinlik okutmaları: her okutma bir kez.
create table if not exists hub.etkinlik_coinleri (
  kullanim_id  bigint primary key,
  kullanici    uuid not null references public.profiller(id) on delete cascade,
  zaman        timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['esyalar','oyuncular','envanter','coin_islemleri','ziyaretler','hediyeler',
                           'gorev_odulleri','etkinlik_coinleri'] loop
    execute format('alter table hub.%I enable row level security', t);
    execute format('revoke all on hub.%I from public, anon, authenticated', t);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- KATALOG (başlangıç verisi; tekrar çalıştırmada fiyat/ad güncellenir)
-- ═══════════════════════════════════════════════════════════════════
insert into hub.esyalar (id, ad, tur, slot, fiyat, nadirlik, satista, baslangic, siralama) values
  -- Kıyafet
  ('tisort_beyaz',    'Beyaz tişört',          'kiyafet', 'ust',      0,   'siradan', false, true,  10),
  ('tisort_mavi',     'Mavi tişört',           'kiyafet', 'ust',      80,  'siradan', true,  false, 11),
  ('sweat_gri',       'Gri sweatshirt',        'kiyafet', 'ust',      180, 'siradan', true,  false, 12),
  ('hoodie_gece',     'Gece mavisi hoodie',    'kiyafet', 'ust',      300, 'siradan', true,  false, 13),
  ('ceket_deri',      'Deri ceket',            'kiyafet', 'ust',      350, 'nadir',   true,  false, 14),
  ('sweat_yazveb',    'YAZVEB sweatshirt',     'kiyafet', 'ust',      450, 'nadir',   true,  false, 15),
  ('ceket_yazveb',    'YAZVEB kurucu ceketi',  'kiyafet', 'ust',      0,   'efsane',  false, false, 16),
  ('pantolon_kot',    'Kot pantolon',          'kiyafet', 'alt',      0,   'siradan', false, true,  20),
  ('pantolon_siyah',  'Siyah pantolon',        'kiyafet', 'alt',      120, 'siradan', true,  false, 21),
  ('sort_bej',        'Bej şort',              'kiyafet', 'alt',      90,  'siradan', true,  false, 22),
  ('spor_beyaz',      'Beyaz spor ayakkabı',   'kiyafet', 'ayakkabi', 0,   'siradan', false, true,  30),
  ('bot_kahve',       'Kahverengi bot',        'kiyafet', 'ayakkabi', 160, 'siradan', true,  false, 31),
  ('spor_neon',       'Neon spor ayakkabı',    'kiyafet', 'ayakkabi', 260, 'nadir',   true,  false, 32),
  ('bere_siyah',      'Siyah bere',            'kiyafet', 'sapka',    120, 'siradan', true,  false, 40),
  ('kep_yazveb',      'YAZVEB kep',            'kiyafet', 'sapka',    250, 'nadir',   true,  false, 41),
  ('gozluk_yuvarlak', 'Yuvarlak gözlük',       'kiyafet', 'gozluk',   100, 'siradan', true,  false, 50),
  ('gozluk_gunes',    'Güneş gözlüğü',         'kiyafet', 'gozluk',   180, 'siradan', true,  false, 51),
  ('gozluk_vr',       'VR başlığı',            'kiyafet', 'gozluk',   600, 'nadir',   true,  false, 52),
  ('canta_sirt',      'Sırt çantası',          'kiyafet', 'canta',    150, 'siradan', true,  false, 60),
  ('canta_laptop',    'Laptop çantası',        'kiyafet', 'canta',    220, 'siradan', true,  false, 61),
  -- Oda
  ('masa_basit',      'Çalışma masası',        'oda', 'mobilya', 0,   'siradan', false, true,  100),
  ('sandalye_basit',  'Sandalye',              'oda', 'mobilya', 0,   'siradan', false, true,  101),
  ('laptop',          'Laptop',                'oda', 'mobilya', 250, 'siradan', true,  false, 102),
  ('bilgisayar',      'Masaüstü bilgisayar',   'oda', 'mobilya', 400, 'siradan', true,  false, 103),
  ('lamba',           'Lambader',              'oda', 'mobilya', 90,  'siradan', true,  false, 104),
  ('bitki_kucuk',     'Küçük bitki',           'oda', 'mobilya', 60,  'siradan', true,  false, 105),
  ('bitki_buyuk',     'Büyük bitki',           'oda', 'mobilya', 140, 'siradan', true,  false, 106),
  ('puf',             'Puf',                   'oda', 'mobilya', 120, 'siradan', true,  false, 107),
  ('kitaplik',        'Kitaplık',              'oda', 'mobilya', 280, 'siradan', true,  false, 108),
  ('koltuk',          'Koltuk',                'oda', 'mobilya', 350, 'siradan', true,  false, 109),
  ('konsol',          'Oyun konsolu',          'oda', 'mobilya', 500, 'nadir',   true,  false, 110),
  ('robot_figur',     'Robot figürü',          'oda', 'mobilya', 450, 'nadir',   true,  false, 111),
  ('sunucu_kabini',   'GPU sunucu kabini',     'oda', 'mobilya', 650, 'nadir',   true,  false, 112),
  ('akvaryum',        'Akvaryum',              'oda', 'mobilya', 800, 'efsane',  true,  false, 113),
  ('kupa_yazveb',     'YAZVEB kupası',         'oda', 'mobilya', 0,   'efsane',  false, false, 114),
  ('hali_gri',        'Gri halı',              'oda', 'zemin',   100, 'siradan', true,  false, 120),
  ('hali_yazveb',     'YAZVEB halısı',         'oda', 'zemin',   300, 'nadir',   true,  false, 121),
  ('poster_yazveb',   'YAZVEB posteri',        'oda', 'duvar',   150, 'siradan', true,  false, 130),
  ('poster_ag',       'Sinir ağı posteri',     'oda', 'duvar',   150, 'siradan', true,  false, 131),
  ('saat',            'Duvar saati',           'oda', 'duvar',   110, 'siradan', true,  false, 132),
  ('tablo_turing',    'Turing portresi',       'oda', 'duvar',   400, 'nadir',   true,  false, 133)
on conflict (id) do update set
  ad = excluded.ad, tur = excluded.tur, slot = excluded.slot, fiyat = excluded.fiyat,
  nadirlik = excluded.nadirlik, satista = excluded.satista, baslangic = excluded.baslangic,
  siralama = excluded.siralama;


-- ═══════════════════════════════════════════════════════════════════
-- YARDIMCILAR (hub şeması — dışarıdan çağrılamaz)
-- ═══════════════════════════════════════════════════════════════════

/** Türkiye saatine göre bugün: günlük görevler gece yarısı sıfırlanır. */
create or replace function hub.bugun()
returns date language sql stable
as $$ select (now() at time zone 'Europe/Istanbul')::date $$;

/** Bu haftanın başı (pazartesi 00:00, İstanbul): çark haftada bir. */
create or replace function hub.hafta_basi()
returns timestamptz language sql stable
as $$ select date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul' $$;

create or replace function hub.rastgele()
returns double precision language sql volatile
set search_path = hub, extensions
as $$
  select (('x' || encode(extensions.gen_random_bytes(6), 'hex'))::bit(48)::bigint)::double precision / 281474976710656.0
$$;

/** Tek Coin yazma yolu: defter + bakiye aynı işlemde; bakiye eksiye düşemez. */
create or replace function hub.coin_ekle(p_kim uuid, p_miktar integer, p_tur text, p_aciklama text)
returns integer language plpgsql volatile
set search_path = hub
as $$
declare yeni integer;
begin
  update hub.oyuncular set coin = coin + p_miktar, guncellendi = now()
  where kullanici = p_kim returning coin into yeni;
  if yeni is null then raise exception 'Oyuncu yok.'; end if;
  if yeni < 0 then raise exception 'Yetersiz Coin.' using errcode = '22003'; end if;
  insert into hub.coin_islemleri (kullanici, miktar, tur, aciklama) values (p_kim, p_miktar, p_tur, left(p_aciklama, 120));
  return yeni;
end $$;

/** Eşyayı envantere ekler. Kıyafet tektir: zaten varsa false döner. */
create or replace function hub.envantere_ekle(p_kim uuid, p_esya text)
returns boolean language plpgsql volatile
set search_path = hub
as $$
declare e hub.esyalar;
begin
  select * into e from hub.esyalar where id = p_esya;
  if not found then raise exception 'Eşya yok.'; end if;
  if e.tur = 'kiyafet' and exists (select 1 from hub.envanter where kullanici = p_kim and esya_id = p_esya and adet > 0) then
    return false;
  end if;
  insert into hub.envanter (kullanici, esya_id, adet) values (p_kim, p_esya, 1)
  on conflict (kullanici, esya_id) do update set adet = least(99, hub.envanter.adet + 1);
  return true;
end $$;

/**
 * Oyuncuyu (yoksa) kurar: başlangıç eşyaları, masa + sandalyeli oda,
 * karşılama Coin'i. Coin XP değildir; sıralamayı ve kilitleri etkilemez.
 */
create or replace function hub.oyuncu_kur(p_kim uuid)
returns hub.oyuncular language plpgsql volatile
set search_path = hub, public
as $$
declare o hub.oyuncular;
begin
  select * into o from hub.oyuncular where kullanici = p_kim;
  if found then return o; end if;
  insert into hub.oyuncular (kullanici, coin, avatar, oda) values (
    p_kim, 0,
    jsonb_build_object('ten', 2, 'sac', 1, 'sac_renk', 0, 'yuz', 0,
      'giyili', jsonb_build_object('ust', 'tisort_beyaz', 'alt', 'pantolon_kot', 'ayakkabi', 'spor_beyaz')),
    '[{"esya":"masa_basit","x":1,"z":0,"yon":0},{"esya":"sandalye_basit","x":1,"z":1,"yon":2}]'::jsonb)
  on conflict (kullanici) do nothing;
  -- Aynı anda iki ilk giriş: satırı yalnızca biri ekler, karşılama da bir kez.
  if not found then
    select * into o from hub.oyuncular where kullanici = p_kim;
    return o;
  end if;
  insert into hub.envanter (kullanici, esya_id, adet)
  select p_kim, id, 1 from hub.esyalar where baslangic
  on conflict do nothing;
  perform hub.coin_ekle(p_kim, 150, 'hosgeldin', 'YAZVEB HUB''a hoş geldin');
  select * into o from hub.oyuncular where kullanici = p_kim;
  return o;
end $$;

/** Günlük görevler: koşul + ödül tek yerde. İstemci yalnızca durum okur. */
create or replace function hub.gorev_tanimlari()
returns table (kod text, baslik text, odul integer, hedef integer)
language sql immutable
as $$
  values
    ('ziyaret_1', '1 üyenin odasını ziyaret et', 20, 1),
    ('ziyaret_3', '3 farklı üyenin odasını ziyaret et', 75, 3),
    ('hediye_1',  'Bir üyeye hediye bırak', 25, 1),
    ('oda_duzen', 'Odanı düzenle', 30, 1)
$$;

create or replace function hub.gorev_ilerleme(p_kim uuid, p_kod text)
returns integer language sql stable
set search_path = hub
as $$
  select case p_kod
    when 'ziyaret_1' then (select count(*)::int from hub.ziyaretler where ziyaretci = p_kim and gun = hub.bugun())
    when 'ziyaret_3' then (select count(*)::int from hub.ziyaretler where ziyaretci = p_kim and gun = hub.bugun())
    when 'hediye_1'  then (select count(*)::int from hub.hediyeler
                            where gonderen = p_kim and (zaman at time zone 'Europe/Istanbul')::date = hub.bugun())
    when 'oda_duzen' then (select case when (oda_kaydedildi at time zone 'Europe/Istanbul')::date = hub.bugun() then 1 else 0 end
                            from hub.oyuncular where kullanici = p_kim)
    else 0 end
$$;

/** Etkinlik QR'sinden Coin: görev puanının 5 katı, en fazla 1000. */
create or replace function hub.etkinlik_coin(p_puan integer)
returns integer language sql immutable
as $$ select least(1000, greatest(10, p_puan * 5)) $$;

/** Çarkın dilimleri — arayüzde olasılıklarıyla birlikte gösterilir. */
create or replace function hub.cark_dilimleri()
returns table (sira integer, ad text, tur text, deger integer, agirlik integer)
language sql immutable
as $$
  values
    (1, '100 Coin',          'coin',   100, 30),
    (2, 'Sıradan eşya',      'esya',   0,   18),
    (3, '250 Coin',          'coin',   250, 22),
    (4, '50 Coin',           'coin',   50,  8),
    (5, 'Nadir eşya',        'nadir',  0,   10),
    (6, '500 Coin',          'coin',   500, 8),
    (7, 'Haftanın eşyası',   'hafta',  0,   4)
$$;

/** Haftanın eşyası: yalnızca çarktan çıkan efsane eşyalar arasında haftaya göre döner. */
create or replace function hub.haftanin_esyasi()
returns text language sql stable
set search_path = hub
as $$
  select id from (
    select id, row_number() over (order by id) - 1 as s, count(*) over () as n
    from hub.esyalar where nadirlik = 'efsane' and not satista
  ) x
  where s = (floor(extract(epoch from hub.hafta_basi()) / 604800)::bigint % n)
$$;

/** Oyuncunun odası, kaydedilmiş ve doğrulanmış biçimde. */
create or replace function hub.oyuncu_ozeti(p_kim uuid)
returns jsonb language sql stable
set search_path = hub, public
as $$
  select jsonb_build_object(
    'id', p.id, 'kullanici_adi', p.kullanici_adi, 'ad', coalesce(p.ad_soyad, p.kullanici_adi), 'rol', p.rol,
    'avatar', coalesce(o.avatar, '{}'::jsonb), 'oda', coalesce(o.oda, '[]'::jsonb),
    'kuruldu', o.kullanici is not null)
  from public.profiller p left join hub.oyuncular o on o.kullanici = p.id
  where p.id = p_kim
$$;


-- ═══════════════════════════════════════════════════════════════════
-- OYUNCU API
-- ═══════════════════════════════════════════════════════════════════

/** HUB'a giriş: bakiye, karakter, oda, envanter, görevler, çark, yeni hediyeler. */
create or replace function public.hub_profil()
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  o hub.oyuncular;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  o := hub.oyuncu_kur(kim);
  return jsonb_build_object(
    'coin', o.coin,
    'ben', hub.oyuncu_ozeti(kim),
    'envanter', (select coalesce(jsonb_object_agg(esya_id, adet), '{}'::jsonb)
                 from hub.envanter where kullanici = kim and adet > 0),
    'gorevler', (select jsonb_agg(jsonb_build_object(
                   'kod', g.kod, 'baslik', g.baslik, 'odul', g.odul, 'hedef', g.hedef,
                   'ilerleme', least(g.hedef, hub.gorev_ilerleme(kim, g.kod)),
                   'alindi', exists (select 1 from hub.gorev_odulleri r
                                     where r.kullanici = kim and r.gorev = g.kod and r.gun = hub.bugun())))
                 from hub.gorev_tanimlari() g),
    'etkinlik_coin', (select coalesce(jsonb_agg(jsonb_build_object('id', gk.id, 'baslik', gg.baslik,
                                        'coin', hub.etkinlik_coin(gk.puan)) order by gk.zaman desc), '[]'::jsonb)
                      from odul.gorev_kullanimlari gk join odul.gorevler gg on gg.id = gk.gorev_id
                      where gk.kullanici = kim
                        and not exists (select 1 from hub.etkinlik_coinleri c where c.kullanim_id = gk.id)),
    'cark', jsonb_build_object(
      'hazir', o.son_cark is null or o.son_cark < hub.hafta_basi(),
      'sonraki', hub.hafta_basi() + interval '7 days',
      'haftanin_esyasi', hub.haftanin_esyasi(),
      'dilimler', (select jsonb_agg(jsonb_build_object('sira', sira, 'ad', ad, 'tur', tur,
                     'olasilik', olasilik) order by sira)
                   from (select c.*, round(agirlik * 100.0 / sum(agirlik) over (), 1) as olasilik
                         from hub.cark_dilimleri() c) d)),
    'yeni_hediye', (select count(*) from hub.hediyeler where alici = kim and not goruldu),
    'bugun_ziyaret', (select count(*) from hub.ziyaretler where sahip = kim and gun = hub.bugun()));
end $$;

create or replace function public.hub_katalog()
returns jsonb language plpgsql stable security definer
set search_path = public, hub
as $$
begin
  if auth.uid() is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ad', ad, 'tur', tur, 'slot', slot,
            'fiyat', fiyat, 'nadirlik', nadirlik, 'satista', satista) order by siralama), '[]'::jsonb)
          from hub.esyalar);
end $$;

create or replace function public.hub_satin_al(p_esya text)
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  e hub.esyalar;
  o hub.oyuncular;
  yeni integer;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  perform hub.oyuncu_kur(kim);
  -- Oyuncu satırı kilitlenir: aynı anda iki satın alma bakiyeyi ikinci kez harcayamaz.
  select * into o from hub.oyuncular where kullanici = kim for update;
  select * into e from hub.esyalar where id = p_esya;
  if not found or not e.satista then return jsonb_build_object('durum', 'satista_degil'); end if;
  if e.tur = 'kiyafet' and exists (select 1 from hub.envanter where kullanici = kim and esya_id = e.id and adet > 0) then
    return jsonb_build_object('durum', 'zaten_var');
  end if;
  if o.coin < e.fiyat then return jsonb_build_object('durum', 'yetersiz', 'eksik', e.fiyat - o.coin); end if;
  yeni := hub.coin_ekle(kim, -e.fiyat, 'satin_alma', e.ad);
  perform hub.envantere_ekle(kim, e.id);
  return jsonb_build_object('durum', 'tamam', 'coin', yeni, 'esya', e.id);
end $$;

/**
 * Karakteri kaydet. Yalnızca SAHİP OLUNAN kıyafet, doğru slotta giyilebilir;
 * görünüş değerleri sabit aralıklarda. Bilinmeyen alan saklanmaz.
 */
create or replace function public.hub_avatar_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  giyili jsonb := '{}'::jsonb;
  s text;
  esya text;
  sayi integer;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  perform hub.oyuncu_kur(kim);
  if jsonb_typeof(p) <> 'object' then raise exception 'Geçersiz karakter.' using errcode = '22023'; end if;
  foreach s in array array['ten', 'sac', 'sac_renk', 'yuz'] loop
    sayi := (p->>s)::integer;
    if sayi is null or sayi < 0 or sayi > (case s when 'ten' then 5 when 'sac' then 4 when 'sac_renk' then 5 else 3 end) then
      raise exception 'Geçersiz görünüş: %', s using errcode = '22023';
    end if;
  end loop;
  if p ? 'giyili' then
    if jsonb_typeof(p->'giyili') <> 'object' then raise exception 'Geçersiz kıyafet.' using errcode = '22023'; end if;
    for s, esya in select key, value #>> '{}' from jsonb_each(p->'giyili') loop
      continue when esya is null;
      if not exists (select 1 from hub.esyalar e join hub.envanter v on v.esya_id = e.id
                     where e.id = esya and e.slot = s and e.tur = 'kiyafet'
                       and v.kullanici = kim and v.adet > 0) then
        raise exception 'Bu kıyafet sende yok ya da yanlış yerde: %', esya using errcode = '22023';
      end if;
      giyili := giyili || jsonb_build_object(s, esya);
    end loop;
  end if;
  -- Üst, alt ve ayakkabı boş kalmaz: çıplak karakter yok.
  if not (giyili ? 'ust' and giyili ? 'alt' and giyili ? 'ayakkabi') then
    raise exception 'Üst, alt ve ayakkabı seçilmeli.' using errcode = '22023';
  end if;
  update hub.oyuncular set avatar = jsonb_build_object(
      'ten', (p->>'ten')::int, 'sac', (p->>'sac')::int, 'sac_renk', (p->>'sac_renk')::int, 'yuz', (p->>'yuz')::int,
      'giyili', giyili), guncellendi = now()
  where kullanici = kim;
  return jsonb_build_object('durum', 'tamam');
end $$;

/**
 * Odayı kaydet. 6×6 ızgara. Her eşya envanterdeki adet kadar yerleşir;
 * mobilyalar ve halılar kendi aralarında üst üste binemez, duvar eşyaları
 * arka duvara (z = 0) dizilir.
 */
create or replace function public.hub_oda_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  k jsonb;
  temiz jsonb := '[]'::jsonb;
  e hub.esyalar;
  x integer; z integer; yon integer;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  perform hub.oyuncu_kur(kim);
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 40 then
    raise exception 'Oda en fazla 40 eşya alır.' using errcode = '22023';
  end if;
  for k in select * from jsonb_array_elements(p) loop
    select * into e from hub.esyalar where id = k->>'esya' and tur = 'oda';
    if not found then raise exception 'Bilinmeyen oda eşyası.' using errcode = '22023'; end if;
    x := (k->>'x')::int; z := (k->>'z')::int; yon := coalesce((k->>'yon')::int, 0);
    if x is null or z is null or x not between 0 and 5 or z not between 0 and 5 or yon not between 0 and 3 then
      raise exception 'Eşya odanın dışında.' using errcode = '22023';
    end if;
    if e.slot = 'duvar' and z <> 0 then raise exception 'Duvar eşyası arka duvara asılır.' using errcode = '22023'; end if;
    temiz := temiz || jsonb_build_array(jsonb_build_object('esya', e.id, 'x', x, 'z', z, 'yon', yon));
  end loop;

  -- Adet: envanterdekinden fazla yerleştirilemez.
  if exists (select 1 from (select a->>'esya' as esya, count(*) as n from jsonb_array_elements(temiz) a group by 1) s
             where s.n > coalesce((select adet from hub.envanter v where v.kullanici = kim and v.esya_id = s.esya), 0)) then
    raise exception 'Sende olmayan ya da yetmeyen eşya var.' using errcode = '22023';
  end if;
  -- Çakışma: aynı katmanda (mobilya / zemin / duvar) aynı hücreye iki eşya konmaz.
  if exists (select 1 from jsonb_array_elements(temiz) a join hub.esyalar es on es.id = a->>'esya'
             group by es.slot, a->>'x', a->>'z' having count(*) > 1) then
    raise exception 'İki eşya aynı yerde.' using errcode = '22023';
  end if;

  update hub.oyuncular set oda = temiz, oda_kaydedildi = now(), guncellendi = now() where kullanici = kim;
  return jsonb_build_object('durum', 'tamam', 'adet', jsonb_array_length(temiz));
end $$;

/**
 * Bina: odaların listesi. Kendi odan önce, sonra en son güncellenenler.
 * Topluluk büyüdükçe yeni bölümler açılır (lounge, oyun odası, kafe).
 */
create or replace function public.hub_bina(p_sayfa integer default 0)
returns jsonb language plpgsql stable security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  oyuncu_sayisi integer;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  select count(*) into oyuncu_sayisi from hub.oyuncular;
  return jsonb_build_object(
    'oyuncu', oyuncu_sayisi,
    'bolumler', jsonb_build_array(
      jsonb_build_object('ad', 'Lounge', 'esik', 50, 'acik', oyuncu_sayisi >= 50),
      jsonb_build_object('ad', 'Oyun odası', 'esik', 150, 'acik', oyuncu_sayisi >= 150),
      jsonb_build_object('ad', 'Çatı kafe', 'esik', 300, 'acik', oyuncu_sayisi >= 300)),
    'odalar', (select coalesce(jsonb_agg(x.v order by x.sira, x.g desc), '[]'::jsonb) from (
        select hub.oyuncu_ozeti(o.kullanici) || jsonb_build_object('ben', o.kullanici = kim) as v,
               case when o.kullanici = kim then 0 else 1 end as sira, o.guncellendi as g
        from hub.oyuncular o
        order by case when o.kullanici = kim then 0 else 1 end, o.guncellendi desc
        limit 27 offset greatest(0, coalesce(p_sayfa, 0)) * 27) x));
end $$;

/** Bir odayı ziyaret: son kaydedilmiş hâl; başkasının odasıysa ziyaret günde bir sayılır. */
create or replace function public.hub_oda(p_kullanici uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  ozet jsonb;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  ozet := hub.oyuncu_ozeti(p_kullanici);
  if ozet is null then return jsonb_build_object('durum', 'bulunamadi'); end if;
  if p_kullanici <> kim and (ozet->>'kuruldu')::boolean then
    perform hub.oyuncu_kur(kim);
    insert into hub.ziyaretler (ziyaretci, sahip, gun) values (kim, p_kullanici, hub.bugun())
    on conflict do nothing;
  end if;
  return jsonb_build_object(
    'durum', 'tamam',
    'oyuncu', ozet,
    'bugun_ziyaret', (select count(*) from hub.ziyaretler where sahip = p_kullanici and gun = hub.bugun()),
    'hediyeler', (select coalesce(jsonb_agg(jsonb_build_object('icerik', h.icerik, 'tur', h.tur,
                    'kimden', coalesce(pr.ad_soyad, pr.kullanici_adi), 'zaman', h.zaman) order by h.zaman desc), '[]'::jsonb)
                  from (select * from hub.hediyeler where alici = p_kullanici order by zaman desc limit 6) h
                  join public.profiller pr on pr.id = h.gonderen));
end $$;

/**
 * Hediye bırak. Emoji hediyeler ücretsiz; eşya hediyesi envanterden düşer.
 * Günde en fazla 10 hediye. Mesaj 80 karakter, görünmez karakter yok.
 */
create or replace function public.hub_hediye(p_alici uuid, p_tur text, p_icerik text, p_mesaj text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  mesaj text := nullif(trim(coalesce(p_mesaj, '')), '');
  e hub.esyalar;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  perform hub.oyuncu_kur(kim);
  if p_alici is null or p_alici = kim or not exists (select 1 from hub.oyuncular where kullanici = p_alici) then
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  if mesaj is not null and (char_length(mesaj) > 80 or public.gorunmez_karakter_var(mesaj)) then
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  if (select count(*) from hub.hediyeler where gonderen = kim and zaman > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('durum', 'sinir');
  end if;
  if p_tur = 'emoji' then
    if p_icerik not in ('kahve', 'kalp', 'alkis', 'yildiz', 'kulaklik', 'cicek', 'roket', 'kupa') then
      return jsonb_build_object('durum', 'gecersiz');
    end if;
  elsif p_tur = 'esya' then
    select * into e from hub.esyalar where id = p_icerik and tur = 'oda';
    if not found then return jsonb_build_object('durum', 'gecersiz'); end if;
    update hub.envanter set adet = adet - 1 where kullanici = kim and esya_id = e.id and adet > 0;
    if not found then return jsonb_build_object('durum', 'yok'); end if;
    -- Odada yerleşik olan son kopyayı verirse odadaki yerinden de kalkar.
    update hub.oyuncular set oda = (
      select coalesce(jsonb_agg(a), '[]'::jsonb) from (
        select a, row_number() over (partition by a->>'esya' order by ord) as n
        from jsonb_array_elements(oda) with ordinality t(a, ord)) x
      where a->>'esya' <> e.id or n <= coalesce((select adet from hub.envanter where kullanici = kim and esya_id = e.id), 0))
    where kullanici = kim;
    perform hub.envantere_ekle(p_alici, e.id);
  else
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  insert into hub.hediyeler (gonderen, alici, tur, icerik, mesaj) values (kim, p_alici, p_tur, p_icerik, mesaj);
  return jsonb_build_object('durum', 'tamam');
end $$;

/** Gelen kutusu: bana bırakılan hediyeler ve bugün odamı ziyaret edenler. Açınca görüldü sayılır. */
create or replace function public.hub_gelenler()
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare kim uuid := auth.uid(); sonuc jsonb;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'hediyeler', (select coalesce(jsonb_agg(jsonb_build_object('tur', h.tur, 'icerik', h.icerik, 'mesaj', h.mesaj,
                    'kimden', coalesce(p.ad_soyad, p.kullanici_adi), 'kimden_id', h.gonderen, 'zaman', h.zaman,
                    'yeni', not h.goruldu) order by h.zaman desc), '[]'::jsonb)
                  from (select * from hub.hediyeler where alici = kim order by zaman desc limit 30) h
                  join public.profiller p on p.id = h.gonderen),
    'ziyaretciler', (select coalesce(jsonb_agg(jsonb_build_object('kim', coalesce(p.ad_soyad, p.kullanici_adi),
                       'id', z.ziyaretci, 'zaman', z.zaman) order by z.zaman desc), '[]'::jsonb)
                     from hub.ziyaretler z join public.profiller p on p.id = z.ziyaretci
                     where z.sahip = kim and z.gun >= hub.bugun() - 6))
    into sonuc;
  update hub.hediyeler set goruldu = true where alici = kim and not goruldu;
  return sonuc;
end $$;

/** Günlük görev ödülünü al. Koşul sunucuda sayılır; aynı gün bir kez. */
create or replace function public.hub_gorev_al(p_kod text)
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  g record;
  yeni integer;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  perform hub.oyuncu_kur(kim);
  select * into g from hub.gorev_tanimlari() t where t.kod = p_kod;
  if not found then return jsonb_build_object('durum', 'gecersiz'); end if;
  if hub.gorev_ilerleme(kim, g.kod) < g.hedef then return jsonb_build_object('durum', 'tamamlanmadi'); end if;
  insert into hub.gorev_odulleri (kullanici, gorev, gun) values (kim, g.kod, hub.bugun()) on conflict do nothing;
  if not found then return jsonb_build_object('durum', 'zaten_alindi'); end if;
  yeni := hub.coin_ekle(kim, g.odul, 'gorev', g.baslik);
  return jsonb_build_object('durum', 'tamam', 'coin', yeni, 'odul', g.odul);
end $$;

/** Okutulmuş etkinlik QR'lerini Coin'e çevir (her okutma bir kez). */
create or replace function public.hub_etkinlik_coin_al()
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  toplam integer := 0;
  r record;
  yeni integer;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  perform hub.oyuncu_kur(kim);
  perform 1 from hub.oyuncular where kullanici = kim for update;
  for r in select gk.id, gk.puan, gg.baslik from odul.gorev_kullanimlari gk join odul.gorevler gg on gg.id = gk.gorev_id
           where gk.kullanici = kim and not exists (select 1 from hub.etkinlik_coinleri c where c.kullanim_id = gk.id) loop
    insert into hub.etkinlik_coinleri (kullanim_id, kullanici) values (r.id, kim) on conflict do nothing;
    if found then
      yeni := hub.coin_ekle(kim, hub.etkinlik_coin(r.puan), 'etkinlik', r.baslik);
      toplam := toplam + hub.etkinlik_coin(r.puan);
    end if;
  end loop;
  return jsonb_build_object('durum', case when toplam > 0 then 'tamam' else 'yok' end, 'coin',
                            (select coin from hub.oyuncular where kullanici = kim), 'kazanilan', toplam);
end $$;

/**
 * YAZVEB Şans Çarkı — haftada bir, ücretsiz. Sonuç sunucuda seçilir;
 * istemci yalnızca hangi dilime döneceğini öğrenir. Zaten sahip olunan
 * kıyafet çıkarsa değeri kadar Coin verilir (boş dilim yok).
 */
create or replace function public.hub_cark_cevir()
returns jsonb language plpgsql volatile security definer
set search_path = public, hub
as $$
declare
  kim uuid := auth.uid();
  o hub.oyuncular;
  d record;
  hedef double precision;
  esya text;
  kazandi boolean;
  kazanc integer := 0;
  yeni integer;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  perform hub.oyuncu_kur(kim);
  select * into o from hub.oyuncular where kullanici = kim for update;
  if o.son_cark is not null and o.son_cark >= hub.hafta_basi() then
    return jsonb_build_object('durum', 'bekle', 'sonraki', hub.hafta_basi() + interval '7 days');
  end if;

  hedef := hub.rastgele() * (select sum(agirlik) from hub.cark_dilimleri());
  select * into d from (
    select c.*, sum(agirlik) over (order by sira) as birikimli from hub.cark_dilimleri() c) x
  where x.birikimli > hedef order by x.sira limit 1;

  if d.tur = 'coin' then
    kazanc := d.deger;
  else
    select id into esya from hub.esyalar
    where case d.tur when 'esya' then nadirlik = 'siradan' and fiyat > 0
                     when 'nadir' then nadirlik = 'nadir'
                     else id = hub.haftanin_esyasi() end
    order by hub.rastgele() limit 1;
    kazandi := hub.envantere_ekle(kim, esya);
    if not kazandi then
      -- Zaten sahip olunan kıyafet: değerince Coin (haftanın eşyasında 600).
      kazanc := coalesce(nullif((select fiyat from hub.esyalar where id = esya), 0), 600);
      esya := null;
    end if;
  end if;

  update hub.oyuncular set son_cark = now() where kullanici = kim;
  if kazanc > 0 then yeni := hub.coin_ekle(kim, kazanc, 'cark', 'Şans çarkı: ' || d.ad); end if;
  return jsonb_build_object('durum', 'tamam', 'dilim', d.sira, 'ad', d.ad, 'coin', kazanc, 'esya', esya,
                            'bakiye', (select coin from hub.oyuncular where kullanici = kim),
                            'sonraki', hub.hafta_basi() + interval '7 days');
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- YETKİLER
-- ═══════════════════════════════════════════════════════════════════
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'hub\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.imza);
    execute format('grant execute on function %s to authenticated', f.imza);
  end loop;
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hub'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.imza);
  end loop;
end $$;
