-- ═══════════════════════════════════════════════════════════════════
-- ÖĞRENCİ DOĞRULAMA — üniversite e-postasıyla, resmi prosedür olmadan
-- ═══════════════════════════════════════════════════════════════════
-- 05_oduller.sql'den SONRA çalıştırılır. Tekrar çalıştırmak zararsızdır.
--
-- NASIL
-- ─────
-- Öğrenci üniversite e-postasını yazar; "dogrula" Edge Function'ı bu
-- adrese 6 haneli bir kod gönderir; öğrenci kodu kendi resmi posta
-- kutusunda görüp uygulamaya yazar. Kodu bilmek = o posta kutusuna
-- erişebilmek = o üniversitenin bir üyesi olmak.
--
-- MİMARİ KARARLAR
-- ───────────────
-- 1. Kodu ÜRETEN fonksiyon (kimlik_kod_olustur) yalnızca sunucu rolüne
--    (service_role) açıktır. Üye onu çağırabilseydi kodu e-postasız
--    öğrenir, herhangi bir adresi "doğrulardı". Edge Function kullanıcıyı
--    jetonundan tanır, kodu buradan alır ve yalnızca e-postaya yazar.
--
-- 2. Veri en azda tutulur: e-posta adresinin kendisi HİÇ saklanmaz (öğrenci
--    numarası da). Yalnızca alan adı (ogr.selcuk.edu.tr) ve adresin gizli
--    anahtarlı özeti (HMAC). Özet geri çevrilemez; tek işi aynı adresin
--    ikinci bir hesabı doğrulamasını engellemek.
--
-- 3. Doğrulama süresiz değildir: her yıl 31 Ekim'de biter (en az üç ay
--    geçerli kalır). Selçuk'ta öğrenci e-postası mezuniyetten 60 gün sonra
--    silinir; mezun olan yenileyemez, okuyan bir kod daha girer.
--
-- 4. Kabul: ".edu.tr" ile biten her adres, ayrıca listeye elle eklenmiş
--    yurt dışı / .edu alanları. Öğrenci alt alan adı (ogr., ogrenci.,
--    std., stu., stud., student.) "öğrenci" rozeti; kurumun ana alanı
--    (personel ve bazı üniversitelerde öğrenciler de) "üniversite" rozeti.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

create schema if not exists kimlik;
revoke all on schema kimlik from public, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- TABLOLAR
-- ═══════════════════════════════════════════════════════════════════

create table if not exists kimlik.ayarlar (
  id                  boolean primary key default true check (id),
  -- E-posta özetinin ve kod özetinin anahtarı. Hiçbir fonksiyon dışarı vermez.
  sir                 bytea not null default extensions.gen_random_bytes(32),
  -- E-posta servisinin ücretsiz katmanı (ör. günde 300) aşılmasın.
  gunluk_genel_sinir  integer not null default 250 check (gunluk_genel_sinir between 1 and 100000),
  -- 30 dk: Selçuk'un sunucusu yeni göndereni önce geri çevirip ~10 dk sonra
  -- kabul ediyor (ilk denemede ölçüldü); 15 dk öğrenciye 3 dk bırakıyordu.
  kod_dakika          integer not null default 30 check (kod_dakika between 5 and 60)
);
insert into kimlik.ayarlar default values on conflict do nothing;
-- Eski varsayılanla kurulmuş olanlar yeni süreye geçer (elle değiştirilmişse dokunulmaz).
update kimlik.ayarlar set kod_dakika = 30 where kod_dakika = 15;

-- Kurum alanı → üniversite adı. Bilinmeyen .edu.tr alanı da kabul edilir;
-- adı yönetici sonradan yazar (o zamana kadar alan adı görünür).
create table if not exists kimlik.universiteler (
  kurum_alani  text primary key check (kurum_alani ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  ad           text not null check (char_length(ad) between 2 and 80),
  -- .edu.tr dışındaki alanlar (ör. sabanciuniv.edu) yalnızca burada
  -- açıkça izinliyse kabul edilir.
  izinli       boolean not null default true
);

insert into kimlik.universiteler (kurum_alani, ad) values
  ('selcuk.edu.tr', 'Selçuk Üniversitesi'),
  ('erbakan.edu.tr', 'Necmettin Erbakan Üniversitesi'),
  ('ktun.edu.tr', 'Konya Teknik Üniversitesi'),
  ('karatay.edu.tr', 'KTO Karatay Üniversitesi'),
  ('gidatarim.edu.tr', 'Konya Gıda ve Tarım Üniversitesi'),
  ('kmu.edu.tr', 'Karamanoğlu Mehmetbey Üniversitesi'),
  ('aksaray.edu.tr', 'Aksaray Üniversitesi'),
  ('metu.edu.tr', 'Orta Doğu Teknik Üniversitesi'),
  ('itu.edu.tr', 'İstanbul Teknik Üniversitesi'),
  ('bogazici.edu.tr', 'Boğaziçi Üniversitesi'),
  ('boun.edu.tr', 'Boğaziçi Üniversitesi'),
  ('bilkent.edu.tr', 'Bilkent Üniversitesi'),
  ('hacettepe.edu.tr', 'Hacettepe Üniversitesi'),
  ('ankara.edu.tr', 'Ankara Üniversitesi'),
  ('gazi.edu.tr', 'Gazi Üniversitesi'),
  ('yildiz.edu.tr', 'Yıldız Teknik Üniversitesi'),
  ('istanbul.edu.tr', 'İstanbul Üniversitesi'),
  ('iu.edu.tr', 'İstanbul Üniversitesi'),
  ('marmara.edu.tr', 'Marmara Üniversitesi'),
  ('ku.edu.tr', 'Koç Üniversitesi'),
  ('ozyegin.edu.tr', 'Özyeğin Üniversitesi'),
  ('ege.edu.tr', 'Ege Üniversitesi'),
  ('deu.edu.tr', 'Dokuz Eylül Üniversitesi'),
  ('anadolu.edu.tr', 'Anadolu Üniversitesi'),
  ('ogu.edu.tr', 'Eskişehir Osmangazi Üniversitesi'),
  ('atauni.edu.tr', 'Atatürk Üniversitesi'),
  ('erciyes.edu.tr', 'Erciyes Üniversitesi'),
  ('akdeniz.edu.tr', 'Akdeniz Üniversitesi'),
  ('uludag.edu.tr', 'Bursa Uludağ Üniversitesi'),
  ('ktu.edu.tr', 'Karadeniz Teknik Üniversitesi'),
  ('omu.edu.tr', 'Ondokuz Mayıs Üniversitesi'),
  ('cu.edu.tr', 'Çukurova Üniversitesi'),
  ('sdu.edu.tr', 'Süleyman Demirel Üniversitesi'),
  ('karabuk.edu.tr', 'Karabük Üniversitesi'),
  ('firat.edu.tr', 'Fırat Üniversitesi'),
  ('inonu.edu.tr', 'İnönü Üniversitesi'),
  ('pau.edu.tr', 'Pamukkale Üniversitesi'),
  ('sakarya.edu.tr', 'Sakarya Üniversitesi'),
  ('kocaeli.edu.tr', 'Kocaeli Üniversitesi'),
  ('trakya.edu.tr', 'Trakya Üniversitesi'),
  ('gantep.edu.tr', 'Gaziantep Üniversitesi'),
  ('dicle.edu.tr', 'Dicle Üniversitesi'),
  ('comu.edu.tr', 'Çanakkale Onsekiz Mart Üniversitesi'),
  ('mu.edu.tr', 'Muğla Sıtkı Koçman Üniversitesi'),
  ('cumhuriyet.edu.tr', 'Sivas Cumhuriyet Üniversitesi'),
  ('aku.edu.tr', 'Afyon Kocatepe Üniversitesi'),
  ('nevsehir.edu.tr', 'Nevşehir Hacı Bektaş Veli Üniversitesi'),
  ('sabanciuniv.edu', 'Sabancı Üniversitesi')
on conflict do nothing;

-- Üyenin öğrenci kimliği. Bölüm ve sınıf beyandır (resmî kaynağı yok);
-- üniversite ise doğrulanan e-postanın alanından gelir, elle yazılamaz.
create table if not exists kimlik.ogrenciler (
  kullanici      uuid primary key references public.profiller(id) on delete cascade,
  bolum          text check (char_length(bolum) between 2 and 80),
  sinif          text check (sinif in ('hazirlik', '1', '2', '3', '4', '5', '6', 'yuksek_lisans', 'doktora')),
  eposta_alani   text,
  kurum_alani    text,
  tur            text check (tur in ('ogrenci', 'kurum')),
  eposta_ozet    bytea unique,
  dogrulandi     timestamptz,
  gecerli_bitis  timestamptz,
  guncellendi    timestamptz not null default now(),
  check ((dogrulandi is null) = (eposta_ozet is null)
     and (dogrulandi is null) = (kurum_alani is null)
     and (dogrulandi is null) = (gecerli_bitis is null))
);
create index if not exists ogrenciler_kurum_idx on kimlik.ogrenciler (kurum_alani);

-- Bekleyen kod: kullanıcı başına tek. Kodun kendisi değil özeti.
create table if not exists kimlik.kodlar (
  kullanici     uuid primary key references public.profiller(id) on delete cascade,
  eposta_ozet   bytea not null,
  eposta_alani  text not null,
  kod_ozet      bytea not null,
  olusturuldu   timestamptz not null default now(),
  deneme        integer not null default 0
);

-- Gönderim kaydı: hız sınırları için (kullanıcı, adres, günlük toplam).
create table if not exists kimlik.gonderimler (
  kullanici    uuid not null,
  eposta_ozet  bytea not null,
  zaman        timestamptz not null default now()
);
create index if not exists gonderimler_kullanici_idx on kimlik.gonderimler (kullanici, zaman desc);
create index if not exists gonderimler_ozet_idx on kimlik.gonderimler (eposta_ozet, zaman desc);
create index if not exists gonderimler_zaman_idx on kimlik.gonderimler (zaman desc);

do $$
declare t text;
begin
  foreach t in array array['ayarlar', 'universiteler', 'ogrenciler', 'kodlar', 'gonderimler'] loop
    execute format('alter table kimlik.%I enable row level security', t);
    execute format('revoke all on kimlik.%I from public, anon, authenticated', t);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- YARDIMCILAR
-- ═══════════════════════════════════════════════════════════════════

/** Küçük harf, boşluksuz; biçim bozuksa null. */
create or replace function kimlik.eposta_normal(p text)
returns text language sql immutable
as $$
  select case
    when e ~ '^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' and char_length(e) <= 254 then e
  end
  from (select lower(btrim(coalesce(p, ''))) as e) s
$$;

/**
 * Alan adını çözer: ogr.selcuk.edu.tr → (selcuk.edu.tr, ogrenci).
 * Kabul edilmeyen alan (edu.tr değil ve listede izinli değil) → null.
 */
create or replace function kimlik.alan_coz(p_alan text)
returns table (kurum_alani text, tur text)
language sql stable
set search_path = kimlik
as $$
  with parca as (
    select p_alan as alan,
           split_part(p_alan, '.', 1) as ilk,
           substr(p_alan, strpos(p_alan, '.') + 1) as kalan
  ),
  cozum as (
    select case when ilk in ('ogr', 'ogrenci', 'std', 'stu', 'stud', 'student', 'students', 'st')
                     and kalan ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
                     and (kalan ~ '\.edu\.tr$' or exists (select 1 from kimlik.universiteler u where u.kurum_alani = kalan))
                then kalan else alan end as kurum,
           case when ilk in ('ogr', 'ogrenci', 'std', 'stu', 'stud', 'student', 'students', 'st')
                     and kalan ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
                     and (kalan ~ '\.edu\.tr$' or exists (select 1 from kimlik.universiteler u where u.kurum_alani = kalan))
                then 'ogrenci' else 'kurum' end as tur
    from parca
  )
  select c.kurum, c.tur from cozum c
  -- ".edu.tr" kökünün kendisi (ör. "edu.tr") bir kurum değildir.
  -- Öğrenci öneki tek başına kurum değildir: "ogr.edu.tr" bir üniversite değil.
  where split_part(c.kurum, '.', 1) not in ('ogr', 'ogrenci', 'std', 'stu', 'stud', 'student', 'students', 'st', 'www', 'mail')
    and ((c.kurum ~ '^[a-z0-9-]+\.edu\.tr$' or c.kurum ~ '^[a-z0-9-]+\.[a-z0-9-]+\.edu\.tr$')
         or exists (select 1 from kimlik.universiteler u where u.kurum_alani = c.kurum and u.izinli))
$$;

create or replace function kimlik.universite_adi(p_kurum text)
returns text language sql stable
set search_path = kimlik
as $$ select coalesce((select ad from kimlik.universiteler where kurum_alani = p_kurum), p_kurum) $$;

create or replace function kimlik.ozet(p_metin text)
returns bytea language sql stable
set search_path = kimlik, extensions
as $$ select extensions.hmac(convert_to(p_metin, 'UTF8'), (select sir from kimlik.ayarlar), 'sha256') $$;

/** Geçerlilik sonu: en az üç ay sonraki ilk 31 Ekim (İstanbul, gün sonu). */
create or replace function kimlik.bitis_hesapla(p_t timestamptz)
returns timestamptz language sql stable
as $$
  select case when make_timestamptz(y, 10, 31, 23, 59, 59, 'Europe/Istanbul') >= p_t + interval '3 months'
              then make_timestamptz(y, 10, 31, 23, 59, 59, 'Europe/Istanbul')
              else make_timestamptz(y + 1, 10, 31, 23, 59, 59, 'Europe/Istanbul') end
  from (select extract(year from p_t at time zone 'Europe/Istanbul')::int as y) s
$$;

/** Diğer modüllerin tek sorusu: bu kişi şu an doğrulanmış mı? */
create or replace function kimlik.dogrulanmis(p_kim uuid)
returns boolean language sql stable security definer
set search_path = kimlik
as $$
  select coalesce((select dogrulandi is not null and gecerli_bitis > now()
                   from kimlik.ogrenciler where kullanici = p_kim), false)
$$;

/** Üyenin kimlik özeti (kendi ekranı için). */
create or replace function kimlik.ozet_json(p_kim uuid)
returns jsonb language sql stable
set search_path = kimlik
as $$
  select jsonb_build_object(
    'dogrulandi', coalesce(o.dogrulandi is not null and o.gecerli_bitis > now(), false),
    'suresi_doldu', coalesce(o.dogrulandi is not null and o.gecerli_bitis <= now(), false),
    'tur', o.tur,
    'kurum_alani', o.kurum_alani,
    'eposta_alani', o.eposta_alani,
    'universite', case when o.kurum_alani is not null then kimlik.universite_adi(o.kurum_alani) end,
    'bolum', o.bolum,
    'sinif', o.sinif,
    'gecerli_bitis', o.gecerli_bitis)
  from (select 1) _ left join kimlik.ogrenciler o on o.kullanici = p_kim
$$;


-- ═══════════════════════════════════════════════════════════════════
-- API
-- ═══════════════════════════════════════════════════════════════════

/** Kendi durumun + bekleyen kod (varsa, hangi alana ve ne kadar süre). */
create or replace function public.kimlik_durum()
returns jsonb language plpgsql stable security definer
set search_path = public, kimlik
as $$
declare
  kim uuid := auth.uid();
  k kimlik.kodlar;
  dk integer := (select kod_dakika from kimlik.ayarlar);
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  select * into k from kimlik.kodlar where kullanici = kim;
  return kimlik.ozet_json(kim) || jsonb_build_object(
    'bekleyen', case when k.kullanici is not null and k.olusturuldu > now() - make_interval(mins => dk)
                     then jsonb_build_object('eposta_alani', k.eposta_alani,
                            'kalan_sn', greatest(0, extract(epoch from (k.olusturuldu + make_interval(mins => dk) - now()))::int))
                end);
end $$;

/** Bölüm ve sınıf: beyan. Doğrulamadan bağımsız kaydedilir. */
create or replace function public.kimlik_bilgi_kaydet(p_bolum text, p_sinif text)
returns jsonb language plpgsql volatile security definer
set search_path = public, kimlik
as $$
declare
  kim uuid := auth.uid();
  bolum text := nullif(regexp_replace(btrim(coalesce(p_bolum, '')), '\s+', ' ', 'g'), '');
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  if bolum is not null and (char_length(bolum) not between 2 and 80 or public.gorunmez_karakter_var(bolum)) then
    raise exception 'Bölüm adı 2-80 karakter olmalı.' using errcode = '22023';
  end if;
  if p_sinif is not null and p_sinif not in ('hazirlik', '1', '2', '3', '4', '5', '6', 'yuksek_lisans', 'doktora') then
    raise exception 'Geçersiz sınıf.' using errcode = '22023';
  end if;
  insert into kimlik.ogrenciler (kullanici, bolum, sinif) values (kim, bolum, p_sinif)
  on conflict (kullanici) do update set bolum = excluded.bolum, sinif = excluded.sinif, guncellendi = now();
  return kimlik.ozet_json(kim);
end $$;

/**
 * Kod üret — YALNIZCA sunucu rolü (Edge Function). Düz kodu döndürür;
 * Edge Function onu e-postaya yazar, istemciye asla göndermez.
 *   tamam | gecersiz | bekle | sinir | genel_sinir | kullanimda | zaten
 */
create or replace function public.kimlik_kod_olustur(p_kullanici uuid, p_eposta text)
returns jsonb language plpgsql volatile security definer
set search_path = public, kimlik, extensions
as $$
declare
  eposta text := kimlik.eposta_normal(p_eposta);
  alan text;
  coz record;
  oz bytea;
  kod text;
  dk integer := (select kod_dakika from kimlik.ayarlar);
  son timestamptz;
begin
  if p_kullanici is null or not exists (select 1 from public.profiller where id = p_kullanici) then
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  if eposta is null then return jsonb_build_object('durum', 'gecersiz'); end if;
  alan := split_part(eposta, '@', 2);
  select * into coz from kimlik.alan_coz(alan);
  if coz.kurum_alani is null then return jsonb_build_object('durum', 'gecersiz'); end if;

  perform pg_advisory_xact_lock(hashtext('kimlik:' || p_kullanici::text));
  oz := kimlik.ozet(eposta);

  -- Aynı adres zaten bu hesapta ve geçerli: tekrar kod göndermeye gerek yok.
  if exists (select 1 from kimlik.ogrenciler where kullanici = p_kullanici and eposta_ozet = oz and gecerli_bitis > now()) then
    return jsonb_build_object('durum', 'zaten');
  end if;
  -- Başka bir hesabın geçerli doğrulaması: bir adres, bir hesap.
  if exists (select 1 from kimlik.ogrenciler where eposta_ozet = oz and kullanici <> p_kullanici and gecerli_bitis > now()) then
    return jsonb_build_object('durum', 'kullanimda');
  end if;

  select max(zaman) into son from kimlik.gonderimler where kullanici = p_kullanici;
  if son > now() - interval '60 seconds' then
    return jsonb_build_object('durum', 'bekle', 'saniye', ceil(60 - extract(epoch from now() - son))::int);
  end if;
  if (select count(*) from kimlik.gonderimler where kullanici = p_kullanici and zaman > now() - interval '24 hours') >= 5
     or (select count(*) from kimlik.gonderimler where eposta_ozet = oz and zaman > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('durum', 'sinir');
  end if;
  if (select count(*) from kimlik.gonderimler where zaman > now() - interval '24 hours')
     >= (select gunluk_genel_sinir from kimlik.ayarlar) then
    return jsonb_build_object('durum', 'genel_sinir');
  end if;

  kod := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into kimlik.kodlar (kullanici, eposta_ozet, eposta_alani, kod_ozet)
  values (p_kullanici, oz, alan, kimlik.ozet(p_kullanici::text || ':' || kod))
  on conflict (kullanici) do update set eposta_ozet = excluded.eposta_ozet, eposta_alani = excluded.eposta_alani,
    kod_ozet = excluded.kod_ozet, olusturuldu = now(), deneme = 0;
  insert into kimlik.gonderimler (kullanici, eposta_ozet) values (p_kullanici, oz);
  delete from kimlik.gonderimler where zaman < now() - interval '7 days';

  return jsonb_build_object('durum', 'tamam', 'kod', kod, 'dakika', dk,
    'universite', kimlik.universite_adi(coz.kurum_alani), 'tur', coz.tur);
end $$;

/**
 * Kodu gir. 5 hatalı denemede kod yanar; süresi geçen kod "sure" der.
 *   tamam | yok | sure | hatali | deneme | kullanimda
 */
create or replace function public.kimlik_kod_onayla(p_kod text)
returns jsonb language plpgsql volatile security definer
set search_path = public, kimlik
as $$
declare
  kim uuid := auth.uid();
  k kimlik.kodlar;
  coz record;
  dk integer := (select kod_dakika from kimlik.ayarlar);
  kod text := regexp_replace(coalesce(p_kod, ''), '\s', '', 'g');
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  select * into k from kimlik.kodlar where kullanici = kim for update;
  if not found then return jsonb_build_object('durum', 'yok'); end if;
  if k.olusturuldu <= now() - make_interval(mins => dk) then
    delete from kimlik.kodlar where kullanici = kim;
    return jsonb_build_object('durum', 'sure');
  end if;
  if kod !~ '^[0-9]{6}$' or kimlik.ozet(kim::text || ':' || kod) <> k.kod_ozet then
    if k.deneme + 1 >= 5 then
      delete from kimlik.kodlar where kullanici = kim;
      return jsonb_build_object('durum', 'deneme');
    end if;
    update kimlik.kodlar set deneme = deneme + 1 where kullanici = kim;
    return jsonb_build_object('durum', 'hatali', 'kalan', 4 - k.deneme);
  end if;

  -- Kod gönderildikten sonra adres başka bir hesapta doğrulanmış olabilir.
  if exists (select 1 from kimlik.ogrenciler where eposta_ozet = k.eposta_ozet and kullanici <> kim and gecerli_bitis > now()) then
    delete from kimlik.kodlar where kullanici = kim;
    return jsonb_build_object('durum', 'kullanimda');
  end if;
  -- Süresi dolmuş eski bir doğrulama adresi tutuyorsa bırakır.
  update kimlik.ogrenciler set eposta_ozet = null, eposta_alani = null, kurum_alani = null, tur = null,
    dogrulandi = null, gecerli_bitis = null, guncellendi = now()
  where eposta_ozet = k.eposta_ozet and kullanici <> kim;

  select * into coz from kimlik.alan_coz(k.eposta_alani);
  begin
    insert into kimlik.ogrenciler (kullanici, eposta_alani, kurum_alani, tur, eposta_ozet, dogrulandi, gecerli_bitis)
    values (kim, k.eposta_alani, coz.kurum_alani, coz.tur, k.eposta_ozet, now(), kimlik.bitis_hesapla(now()))
    on conflict (kullanici) do update set eposta_alani = excluded.eposta_alani, kurum_alani = excluded.kurum_alani,
      tur = excluded.tur, eposta_ozet = excluded.eposta_ozet, dogrulandi = excluded.dogrulandi,
      gecerli_bitis = excluded.gecerli_bitis, guncellendi = now();
  exception when unique_violation then
    -- Aynı adresi iki hesap aynı anda onayladı: ilki kazanır.
    delete from kimlik.kodlar where kullanici = kim;
    return jsonb_build_object('durum', 'kullanimda');
  end;
  delete from kimlik.kodlar where kullanici = kim;
  return jsonb_build_object('durum', 'tamam') || kimlik.ozet_json(kim);
end $$;

/** Doğrulamayı kaldır (kişisel tercih): özet ve alan silinir, bölüm kalır. */
create or replace function public.kimlik_dogrulama_sil()
returns jsonb language plpgsql volatile security definer
set search_path = public, kimlik
as $$
declare kim uuid := auth.uid();
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  update kimlik.ogrenciler set eposta_ozet = null, eposta_alani = null, kurum_alani = null, tur = null,
    dogrulandi = null, gecerli_bitis = null, guncellendi = now()
  where kullanici = kim;
  delete from kimlik.kodlar where kullanici = kim;
  return kimlik.ozet_json(kim);
end $$;

/** Yönetim: doğrulanan alanlar ve adları (adsız alanlara ad verilir). */
create or replace function public.kimlik_yonetim_alanlar()
returns jsonb language plpgsql stable security definer
set search_path = public, kimlik
as $$
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'kurum_alani', x.kurum_alani, 'ad', u.ad, 'uye', x.n) order by x.n desc, x.kurum_alani), '[]')
          from (select kurum_alani, count(*) as n from kimlik.ogrenciler
                where kurum_alani is not null and gecerli_bitis > now() group by 1) x
          left join kimlik.universiteler u on u.kurum_alani = x.kurum_alani);
end $$;

create or replace function public.kimlik_universite_kaydet(p_kurum text, p_ad text)
returns jsonb language plpgsql volatile security definer
set search_path = public, kimlik
as $$
declare ad text := btrim(coalesce(p_ad, ''));
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  if p_kurum is null or p_kurum !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    raise exception 'Geçersiz alan adı.' using errcode = '22023';
  end if;
  if char_length(ad) not between 2 and 80 or public.gorunmez_karakter_var(ad) then
    raise exception 'Üniversite adı 2-80 karakter olmalı.' using errcode = '22023';
  end if;
  insert into kimlik.universiteler (kurum_alani, ad) values (p_kurum, ad)
  on conflict (kurum_alani) do update set ad = excluded.ad;
  perform odul.denetle('universite_adi', p_kurum, jsonb_build_object('ad', ad));
  return jsonb_build_object('durum', 'tamam');
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- YETKİLER
-- ═══════════════════════════════════════════════════════════════════
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as imza, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'kimlik\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.imza);
    if f.proname = 'kimlik_kod_olustur' then
      execute format('grant execute on function %s to service_role', f.imza);
    else
      execute format('grant execute on function %s to authenticated', f.imza);
    end if;
  end loop;
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'kimlik'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.imza);
  end loop;
end $$;
