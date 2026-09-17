-- ═══════════════════════════════════════════════════════════════════
-- YAZVEB COMMUNITY REWARDS — puan, seviye, sponsor kilidi, ödül
-- ═══════════════════════════════════════════════════════════════════
-- 04_guvenlik.sql'den SONRA çalıştırılır. Tekrar çalıştırmak zararsızdır.
--
-- MİMARİ KARARLAR
-- ───────────────
-- 1. Veriler API'ye AÇIK OLMAYAN "odul" şemasında durur. İstemci tablolara
--    hiç dokunamaz; yalnızca aşağıdaki public.odul_* fonksiyonlarını çağırır.
--    Böylece ödül havuzu (hangi sponsorun kasasında ne var) istemciye hiç
--    inmez — sürpriz, arayüzde saklanarak değil, veri hiç gönderilmeyerek
--    korunur.
--
-- 2. Puan, kilit, stok ve ödül kararları TAMAMEN burada verilir. İstemci
--    yalnızca "şu kodu okuttum" der; puan miktarı, ödül, stok, kilit
--    durumu hiçbir zaman istemciden kabul edilmez.
--
-- 3. Yarış durumu: aynı göreve / kampanyaya gelen eşzamanlı istekler ilgili
--    satırın "for update" kilidiyle sıraya girer. Son ödülü iki kişi aynı
--    anda isterse biri alır, diğeri "tükendi" görür; stok eksiye düşemez
--    (ayrıca CHECK kısıtı).
--
-- 4. Yetki: görev, sponsor ve kampanyayı yetkililer (başkan + yöneticiler)
--    yönetir; başkanın dokunduğu kayda yönetici dokunamaz (etkinliklerdeki
--    kural). Elle puan, seviyeler, ayarlar ve denetim kaydı yalnızca başkan.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

create schema if not exists odul;
revoke all on schema odul from public, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- TABLOLAR
-- ═══════════════════════════════════════════════════════════════════

create table if not exists odul.seviyeler (
  id        smallint generated always as identity primary key,
  ad        text not null check (char_length(ad) between 1 and 30),
  esik_xp   integer not null check (esik_xp between 0 and 10000000),
  ikon      text not null default 'yildiz' check (ikon ~ '^[a-z_]{1,20}$'),
  aciklama  text check (char_length(aciklama) <= 200),
  -- Ertelenebilir: seviyeler toplu kaydedilirken eşikler yer değiştirebilir
  -- (500↔1000); benzersizlik işlemin sonunda denetlenir.
  constraint seviyeler_esik_benzersiz unique (esik_xp) deferrable initially immediate
);

-- Tek satırlık ayar tablosu.
create table if not exists odul.ayarlar (
  id              boolean primary key default true check (id),
  seri_acik       boolean not null default true,
  -- {"3": 50, "5": 100} → üst üste 3. etkinlikte +50, 5.'de +100
  seri_bonuslari  jsonb not null default '{"3": 50, "5": 100}'::jsonb,
  liderlik_acik   boolean not null default true,
  -- Ödül ekranındaki dönen doğrulama kodunun anahtarı. Hiçbir fonksiyon
  -- bunu dışarı vermez; kullanıcı gelecekteki kodu önceden hesaplayamaz.
  sir             bytea not null default extensions.gen_random_bytes(32)
);

-- Kullanıcının puan hesabı. xp, puan_islemleri toplamının önbelleğidir ve
-- yalnızca odul.puan_ekle ile, aynı işlem içinde güncellenir.
create table if not exists odul.hesaplar (
  kullanici        uuid primary key references public.profiller(id) on delete cascade,
  xp               integer not null default 0 check (xp >= 0),
  etkinlik_sayisi  integer not null default 0 check (etkinlik_sayisi >= 0),
  seri             integer not null default 0 check (seri >= 0),
  son_etkinlik     bigint references public.etkinlikler(id) on delete set null,
  gizli            boolean not null default false,
  guncellendi      timestamptz not null default now()
);
create index if not exists hesaplar_xp_idx on odul.hesaplar (xp desc);

-- QR görevleri.
create table if not exists odul.gorevler (
  id               bigint generated always as identity primary key,
  etkinlik_id      bigint references public.etkinlikler(id) on delete set null,
  baslik           text not null check (char_length(baslik) between 2 and 120),
  aciklama         text check (char_length(aciklama) <= 500),
  tur              text not null default 'giris'
                   check (tur in ('giris', 'workshop', 'konferans', 'stand', 'diger')),
  -- QR içeriği: "YAZVEB:G:<token>". 192 bit rastgele; tahmin edilemez.
  token            text not null unique check (token ~ '^[A-Za-z0-9_-]{32}$'),
  kisa_kod         text not null unique check (kisa_kod ~ '^[A-Z0-9]{4,10}$'),
  puan             integer not null check (puan between 1 and 10000),
  baslangic        timestamptz not null,
  bitis            timestamptz not null,
  kisi_basi_limit  integer not null default 1 check (kisi_basi_limit between 1 and 100),
  toplam_limit     integer check (toplam_limit > 0),
  kullanim_sayisi  integer not null default 0 check (kullanim_sayisi >= 0),
  aktif            boolean not null default true,
  iptal_zamani     timestamptz,
  enlem            double precision check (enlem between -90 and 90),
  boylam           double precision check (boylam between -180 and 180),
  yaricap_m        integer check (yaricap_m between 20 and 5000),
  baskan_kilidi    boolean not null default false,
  olusturan        uuid references public.profiller(id) on delete set null,
  olusturuldu      timestamptz not null default now(),
  guncellendi      timestamptz not null default now(),
  check (bitis > baslangic),
  check ((enlem is null) = (boylam is null) and (enlem is null) = (yaricap_m is null)),
  check (toplam_limit is null or kullanim_sayisi <= toplam_limit)
);
create index if not exists gorevler_etkinlik_idx on odul.gorevler (etkinlik_id);

create table if not exists odul.gorev_kullanimlari (
  id         bigint generated always as identity primary key,
  gorev_id   bigint not null references odul.gorevler(id) on delete cascade,
  kullanici  uuid not null references public.profiller(id) on delete cascade,
  yontem     text not null check (yontem in ('qr', 'kod')),
  puan       integer not null,
  zaman      timestamptz not null default now()
);
create index if not exists gorev_kullanimlari_idx on odul.gorev_kullanimlari (gorev_id, kullanici);
create index if not exists gorev_kullanimlari_kullanici_idx on odul.gorev_kullanimlari (kullanici, zaman desc);

-- Puan defteri: her değişiklik bir satır. Silinmez, düzenlenmez.
create table if not exists odul.puan_islemleri (
  id                 bigint generated always as identity primary key,
  kullanici          uuid not null references public.profiller(id) on delete cascade,
  miktar             integer not null check (miktar <> 0),
  tur                text not null check (tur in ('gorev', 'seri_bonusu', 'yonetici')),
  aciklama           text not null check (char_length(aciklama) between 1 and 160),
  gorev_kullanim_id  bigint references odul.gorev_kullanimlari(id) on delete set null,
  yapan              uuid references public.profiller(id) on delete set null,
  zaman              timestamptz not null default now()
);
create index if not exists puan_islemleri_idx on odul.puan_islemleri (kullanici, zaman desc);

create table if not exists odul.sponsorlar (
  id                 uuid primary key default gen_random_uuid(),
  ad                 text not null check (char_length(ad) between 1 and 60),
  aciklama           text check (char_length(aciklama) <= 500),
  -- Logo veri adresi olarak saklanır: harici görsel adresi CSP'yi gevşetmeyi
  -- ve kullanıcıların IP'sini üçüncü bir sunucuya sızdırmayı gerektirirdi.
  -- Yalnızca raster biçimler (SVG betik taşıyabilir).
  logo               text check (logo is null or (
                       logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
                       and octet_length(logo) <= 90000)),
  website            text check (website is null or website ~ '^https://[A-Za-z0-9.-]+(/[^<>"'' ]*)?$'),
  adres              text check (char_length(adres) <= 200),
  gerekli_xp         integer not null default 0 check (gerekli_xp >= 0),
  gerekli_seviye_id  smallint references odul.seviyeler(id) on delete set null,
  gerekli_etkinlik   integer not null default 0 check (gerekli_etkinlik >= 0),
  -- İşletme çalışanının ödülü onaylarken girdiği PIN'in bcrypt özeti.
  pin_ozet           text,
  aktif              boolean not null default true,
  siralama           integer not null default 0,
  baskan_kilidi      boolean not null default false,
  olusturan          uuid references public.profiller(id) on delete set null,
  olusturuldu        timestamptz not null default now(),
  guncellendi        timestamptz not null default now()
);

create table if not exists odul.kampanyalar (
  id               uuid primary key default gen_random_uuid(),
  sponsor_id       uuid not null references odul.sponsorlar(id) on delete cascade,
  ad               text not null check (char_length(ad) between 2 and 80),
  token            text not null unique check (token ~ '^[A-Za-z0-9_-]{32}$'),
  kisa_kod         text not null unique check (kisa_kod ~ '^[A-Z0-9]{4,10}$'),
  baslangic        timestamptz not null,
  bitis            timestamptz not null,
  aktif            boolean not null default true,
  iptal_zamani     timestamptz,
  kisi_basi_limit  integer not null default 1 check (kisi_basi_limit between 1 and 100),
  -- true: kullanıcı ödülün ne olduğunu ancak kazandığında görür.
  surpriz          boolean not null default true,
  gecerlilik_gun   integer not null default 30 check (gecerlilik_gun between 1 and 365),
  baskan_kilidi    boolean not null default false,
  olusturan        uuid references public.profiller(id) on delete set null,
  olusturuldu      timestamptz not null default now(),
  guncellendi      timestamptz not null default now(),
  check (bitis > baslangic)
);
create index if not exists kampanyalar_sponsor_idx on odul.kampanyalar (sponsor_id, bitis desc);

-- Kampanyanın ödül kalemleri (envanter). toplam/kalan boşsa sınırsız.
create table if not exists odul.kampanya_odulleri (
  id           uuid primary key default gen_random_uuid(),
  kampanya_id  uuid not null references odul.kampanyalar(id) on delete cascade,
  baslik       text not null check (char_length(baslik) between 1 and 60),
  tur          text not null default 'urun' check (tur in ('urun', 'indirim', 'deneyim', 'diger')),
  ikon         text not null default 'hediye' check (ikon ~ '^[a-z_]{1,20}$'),
  aciklama     text check (char_length(aciklama) <= 200),
  toplam       integer check (toplam > 0),
  kalan        integer check (kalan >= 0),
  agirlik      integer not null default 1 check (agirlik between 1 and 1000),
  olusturuldu  timestamptz not null default now(),
  check ((toplam is null) = (kalan is null)),
  check (kalan is null or kalan <= toplam)
);
create index if not exists kampanya_odulleri_idx on odul.kampanya_odulleri (kampanya_id);

-- Kullanıcının kazandığı ödüller (cüzdan).
create table if not exists odul.kazanimlar (
  id             uuid primary key default gen_random_uuid(),
  kullanici      uuid not null references public.profiller(id) on delete cascade,
  kampanya_id    uuid not null references odul.kampanyalar(id) on delete cascade,
  odul_id        uuid references odul.kampanya_odulleri(id) on delete set null,
  -- Kazanıldığı andaki kopya: kampanya sonradan düzenlense de cüzdan değişmez.
  sponsor_ad     text not null,
  odul_baslik    text not null,
  odul_tur       text not null,
  odul_ikon      text not null,
  odul_aciklama  text,
  kod            text not null unique check (kod ~ '^[A-Z0-9]{4}-[A-Z0-9]{3}$'),
  zaman          timestamptz not null default now(),
  son_kullanma   timestamptz not null,
  kullanildi     timestamptz,
  iptal          timestamptz
);
create index if not exists kazanimlar_kullanici_idx on odul.kazanimlar (kullanici, zaman desc);
create index if not exists kazanimlar_kampanya_idx on odul.kazanimlar (kampanya_id, kullanici);

-- Başarısız kod/QR denemeleri ve PIN denemeleri (kaba kuvvet sınırı).
create table if not exists odul.denemeler (
  tur        text not null check (tur in ('kod', 'pin')),
  kullanici  uuid not null,
  hedef      uuid,
  zaman      timestamptz not null default now()
);
create index if not exists denemeler_idx on odul.denemeler (tur, kullanici, zaman desc);

-- Sponsor metrikleri (görüntüleme günde bir kez sayılır).
create table if not exists odul.sponsor_olaylari (
  sponsor_id  uuid not null references odul.sponsorlar(id) on delete cascade,
  kullanici   uuid not null,
  tur         text not null check (tur in ('goruntuleme', 'tarama')),
  zaman       timestamptz not null default now()
);
create index if not exists sponsor_olaylari_idx on odul.sponsor_olaylari (sponsor_id, tur, zaman desc);

-- Yönetim işlemleri denetim kaydı.
create table if not exists odul.denetim (
  id       bigint generated always as identity primary key,
  zaman    timestamptz not null default now(),
  yapan    uuid,
  islem    text not null,
  hedef    text,
  ayrinti  jsonb not null default '{}'::jsonb
);
create index if not exists denetim_zaman_idx on odul.denetim (zaman desc);

-- Derinlemesine savunma: şema zaten kapalı, yine de RLS açık ve politika yok.
do $$
declare t text;
begin
  foreach t in array array['seviyeler','ayarlar','hesaplar','gorevler','gorev_kullanimlari',
    'puan_islemleri','sponsorlar','kampanyalar','kampanya_odulleri','kazanimlar','denemeler',
    'sponsor_olaylari','denetim'] loop
    execute format('alter table odul.%I enable row level security', t);
    execute format('revoke all on odul.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Başlangıç verisi
insert into odul.ayarlar (id) values (true) on conflict do nothing;

insert into odul.seviyeler (ad, esik_xp, ikon, aciklama)
select * from (values
  ('STARTER',  0,    'baslangic', 'Macera burada başlıyor.'),
  ('EXPLORER', 250,  'pusula',    'Topluluğu keşfediyorsun.'),
  ('BUILDER',  500,  'yapi',      'Her etkinlikte bir tuğla daha.'),
  ('CREATOR',  1000, 'kalem',     'Artık sen de üretiyorsun.'),
  ('CORE',     2000, 'cekirdek',  'YAZVEB''in çekirdeğindesin.'),
  ('ELITE',    5000, 'tac',       'Topluluğun en aktif üyeleri arasında.')
) as v(ad, esik_xp, ikon, aciklama)
where not exists (select 1 from odul.seviyeler);

-- Tarama hız sınırı mevcut merkezi kota sistemine eklenir.
insert into public.kota_ayarlari (tur, dakika, gun, genel) values
  ('odul_tara', 20, 300, 100000)
on conflict (tur) do nothing;


-- ═══════════════════════════════════════════════════════════════════
-- YARDIMCILAR (odul şeması — dışarıdan çağrılamaz)
-- ═══════════════════════════════════════════════════════════════════

-- 32 harfli alfabe (0/O, 1/I karışmasın). 256 % 32 = 0 → sapmasız.
create or replace function odul.rastgele_kod(uzunluk integer)
returns text language plpgsql volatile
set search_path = odul, extensions
as $$
declare
  alfabe constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  b bytea := extensions.gen_random_bytes(uzunluk);
  s text := '';
  i integer;
begin
  for i in 0 .. uzunluk - 1 loop
    s := s || substr(alfabe, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return s;
end $$;

-- 192 bit, URL güvenli.
create or replace function odul.token()
returns text language sql volatile
set search_path = odul, extensions
as $$ select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_') $$;

-- [0, 1) arası kriptografik rastgele sayı.
create or replace function odul.rastgele_oran()
returns double precision language sql volatile
set search_path = odul, extensions
as $$
  select (('x' || encode(extensions.gen_random_bytes(6), 'hex'))::bit(48)::bigint)::double precision
         / 281474976710656.0
$$;

create or replace function odul.mesafe_m(e1 double precision, b1 double precision,
                                         e2 double precision, b2 double precision)
returns double precision language sql immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(e2 - e1) / 2), 2) +
    cos(radians(e1)) * cos(radians(e2)) * power(sin(radians(b2 - b1) / 2), 2)))
$$;

create or replace function odul.yetkili_olmali()
returns void language plpgsql stable
set search_path = public, odul
as $$
begin
  if auth.uid() is null or not public.yetkili_mi() then
    raise exception 'Bu işlem için yetkin yok.' using errcode = '42501';
  end if;
end $$;

create or replace function odul.baskan_olmali()
returns void language plpgsql stable
set search_path = public, odul
as $$
begin
  if auth.uid() is null or not public.baskan_mi() then
    raise exception 'Bu işlem yalnızca başkana açık.' using errcode = '42501';
  end if;
end $$;

create or replace function odul.denetle(p_islem text, p_hedef text, p_ayrinti jsonb)
returns void language sql volatile
set search_path = odul
as $$
  insert into odul.denetim (yapan, islem, hedef, ayrinti) values (auth.uid(), p_islem, p_hedef, coalesce(p_ayrinti, '{}'));
$$;

-- Hesap satırını (yoksa oluşturup) kilitli döndürür.
create or replace function odul.hesap_kilitle(p_kim uuid)
returns odul.hesaplar language plpgsql volatile
set search_path = odul
as $$
declare h odul.hesaplar;
begin
  insert into odul.hesaplar (kullanici) values (p_kim) on conflict do nothing;
  select * into h from odul.hesaplar where kullanici = p_kim for update;
  return h;
end $$;

-- Tek puan yazma yolu: defter + önbellek aynı işlemde.
create or replace function odul.puan_ekle(p_kim uuid, p_miktar integer, p_tur text,
                                          p_aciklama text, p_kullanim bigint, p_yapan uuid)
returns integer language plpgsql volatile
set search_path = odul
as $$
declare h odul.hesaplar;
begin
  h := odul.hesap_kilitle(p_kim);
  if h.xp + p_miktar < 0 then
    raise exception 'Puan sıfırın altına düşemez (mevcut: %).', h.xp using errcode = '22003';
  end if;
  insert into odul.puan_islemleri (kullanici, miktar, tur, aciklama, gorev_kullanim_id, yapan)
  values (p_kim, p_miktar, p_tur, left(p_aciklama, 160), p_kullanim, p_yapan);
  update odul.hesaplar set xp = xp + p_miktar, guncellendi = now()
  where kullanici = p_kim returning xp into h.xp;
  return h.xp;
end $$;

create or replace function odul.seviye_bilgisi(p_xp integer)
returns jsonb language sql stable
set search_path = odul
as $$
  with sirali as (
    select s.*, row_number() over (order by esik_xp) as sira,
           lead(ad) over (order by esik_xp) as sonraki_ad,
           lead(esik_xp) over (order by esik_xp) as sonraki_esik
    from odul.seviyeler s
  )
  select coalesce((
    select jsonb_build_object(
      'id', id, 'sira', sira, 'ad', ad, 'esik', esik_xp, 'ikon', ikon, 'aciklama', aciklama,
      'sonraki', case when sonraki_esik is null then null
                      else jsonb_build_object('ad', sonraki_ad, 'esik', sonraki_esik) end)
    from sirali where esik_xp <= p_xp order by esik_xp desc limit 1
  ), jsonb_build_object('sira', 1, 'ad', 'STARTER', 'esik', 0, 'ikon', 'baslangic', 'sonraki', null))
$$;

-- Sponsor kilidi bu kullanıcı için açık mı? Eksikleri de söyler.
create or replace function odul.kilit_durumu(p_s odul.sponsorlar, p_xp integer, p_etkinlik integer)
returns jsonb language sql stable
set search_path = odul
as $$
  select jsonb_build_object(
    'acik', p_xp >= greatest(p_s.gerekli_xp, coalesce(sv.esik_xp, 0))
            and p_etkinlik >= p_s.gerekli_etkinlik,
    'gerekli_xp', greatest(p_s.gerekli_xp, coalesce(sv.esik_xp, 0)),
    'gerekli_seviye', sv.ad,
    'gerekli_etkinlik', p_s.gerekli_etkinlik,
    'eksik_xp', greatest(0, greatest(p_s.gerekli_xp, coalesce(sv.esik_xp, 0)) - p_xp),
    'eksik_etkinlik', greatest(0, p_s.gerekli_etkinlik - p_etkinlik))
  from (select 1) _
  left join odul.seviyeler sv on sv.id = p_s.gerekli_seviye_id
$$;

-- Sponsorun kullanıcıya gösterilecek kampanya durumu.
create or replace function odul.kampanya_durumu(p_sponsor uuid, p_kim uuid)
returns jsonb language plpgsql stable
set search_path = odul
as $$
declare
  k odul.kampanyalar;
  kalan integer;
  toplam integer;
  sinirsiz boolean;
  alinan integer;
  durum text;
begin
  -- Şu an geçerli olan, en yakın bitenden başlayarak.
  select * into k from odul.kampanyalar
  where sponsor_id = p_sponsor and aktif and iptal_zamani is null
    and baslangic <= now() and bitis > now()
  order by bitis limit 1;

  if not found then
    select * into k from odul.kampanyalar
    where sponsor_id = p_sponsor and aktif and iptal_zamani is null and baslangic > now()
    order by baslangic limit 1;
    if found then
      return jsonb_build_object('durum', 'yakinda', 'id', k.id, 'ad', k.ad, 'baslangic', k.baslangic);
    end if;
    select * into k from odul.kampanyalar where sponsor_id = p_sponsor order by bitis desc limit 1;
    if found then
      return jsonb_build_object('durum', 'bitti', 'id', k.id, 'ad', k.ad, 'bitis', k.bitis);
    end if;
    return jsonb_build_object('durum', 'yok');
  end if;

  select bool_or(o.toplam is null), coalesce(sum(o.kalan), 0), coalesce(sum(o.toplam), 0)
    into sinirsiz, kalan, toplam
  from odul.kampanya_odulleri o where o.kampanya_id = k.id;

  select count(*) into alinan from odul.kazanimlar where kampanya_id = k.id and kullanici = p_kim;

  durum := case
    when coalesce(sinirsiz, false) then 'aktif'
    when kalan = 0 then 'tukendi'
    when kalan = 1 then 'son'
    when kalan <= 3 then 'az'
    else 'aktif' end;

  return jsonb_build_object(
    'durum', durum, 'id', k.id, 'ad', k.ad, 'bitis', k.bitis, 'surpriz', k.surpriz,
    'sinirsiz', coalesce(sinirsiz, false),
    'kalan', case when coalesce(sinirsiz, false) then null else kalan end,
    'toplam', case when coalesce(sinirsiz, false) then null else toplam end,
    'hak', greatest(0, k.kisi_basi_limit - alinan),
    'alinan', alinan,
    -- Olası ödüller sürpriz kampanyada da gösterilir. Sürpriz olan,
    -- HANGİSİNİN çıkacağıdır; ne kazanılabileceği değil. Kör kutu (ne
    -- çıkabileceği bilinmeyen çekiliş) kumar hissi verir ve güveni zedeler.
    -- Yalnızca başlık, ikon, tür ve kalan adet: kalem kimliği, ağırlık, kod yok.
    'oduller', (
      select coalesce(jsonb_agg(jsonb_build_object('baslik', o.baslik, 'ikon', o.ikon, 'tur', o.tur,
                                                   'kalan', o.kalan, 'toplam', o.toplam)
                                order by o.olusturuldu), '[]'::jsonb)
      from odul.kampanya_odulleri o where o.kampanya_id = k.id));
end $$;

create or replace function odul.sponsor_karti(p_s odul.sponsorlar, p_kim uuid, p_xp integer, p_etkinlik integer)
returns jsonb language sql stable
set search_path = odul
as $$
  select jsonb_build_object(
    'id', p_s.id, 'ad', p_s.ad, 'aciklama', p_s.aciklama, 'logo', p_s.logo,
    'website', p_s.website, 'adres', p_s.adres,
    'kilit', odul.kilit_durumu(p_s, p_xp, p_etkinlik),
    'kampanya', odul.kampanya_durumu(p_s.id, p_kim))
$$;

-- Başarısız deneme sınırı: son 10 dakikada 10 hatalı kod/QR.
create or replace function odul.deneme_siniri_asildi(p_kim uuid)
returns boolean language sql stable
set search_path = odul
as $$
  select count(*) >= 10 from odul.denemeler
  where tur = 'kod' and kullanici = p_kim and zaman > now() - interval '10 minutes'
$$;

create or replace function odul.hatali_deneme(p_kim uuid)
returns void language sql volatile
set search_path = odul
as $$
  insert into odul.denemeler (tur, kullanici) values ('kod', p_kim);
$$;


-- ═══════════════════════════════════════════════════════════════════
-- KULLANICI API
-- ═══════════════════════════════════════════════════════════════════

-- Profil: puan, seviye, sonraki hedef, son işlemler.
create or replace function public.odul_profil()
returns jsonb language plpgsql volatile security definer
set search_path = public, odul
as $$
declare
  kim uuid := auth.uid();
  h odul.hesaplar;
  ay odul.ayarlar;
  hedef jsonb;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  insert into odul.hesaplar (kullanici) values (kim) on conflict do nothing;
  select * into h from odul.hesaplar where kullanici = kim;
  select * into ay from odul.ayarlar;

  -- En yakın kilitli sponsor: "bir sonraki kilide X XP kaldı".
  select jsonb_build_object('sponsor', s.ad, 'id', s.id) || odul.kilit_durumu(s, h.xp, h.etkinlik_sayisi)
    into hedef
  from odul.sponsorlar s
  where s.aktif and not (odul.kilit_durumu(s, h.xp, h.etkinlik_sayisi)->>'acik')::boolean
  order by (odul.kilit_durumu(s, h.xp, h.etkinlik_sayisi)->>'eksik_xp')::integer,
           (odul.kilit_durumu(s, h.xp, h.etkinlik_sayisi)->>'eksik_etkinlik')::integer
  limit 1;

  return jsonb_build_object(
    'xp', h.xp,
    'etkinlik_sayisi', h.etkinlik_sayisi,
    'seri', h.seri,
    'gizli', h.gizli,
    'seviye', odul.seviye_bilgisi(h.xp),
    'seviyeler', (select coalesce(jsonb_agg(jsonb_build_object('ad', ad, 'esik', esik_xp, 'ikon', ikon)
                                            order by esik_xp), '[]') from odul.seviyeler),
    'sonraki_kilit', hedef,
    'acik_sponsor', (select count(*) from odul.sponsorlar s
                     where s.aktif and (odul.kilit_durumu(s, h.xp, h.etkinlik_sayisi)->>'acik')::boolean),
    'toplam_sponsor', (select count(*) from odul.sponsorlar where aktif),
    'aktif_odul', (select count(*) from odul.kazanimlar
                   where kullanici = kim and kullanildi is null and iptal is null and son_kullanma > now()),
    'islemler', (select coalesce(jsonb_agg(jsonb_build_object('miktar', miktar, 'tur', tur,
                                                              'aciklama', aciklama, 'zaman', zaman)
                                           order by zaman desc), '[]')
                 from (select * from odul.puan_islemleri where kullanici = kim
                       order by zaman desc limit 30) x),
    'ayarlar', jsonb_build_object('seri_acik', ay.seri_acik, 'seri_bonuslari', ay.seri_bonuslari,
                                  'liderlik_acik', ay.liderlik_acik),
    'yetkili', public.yetkili_mi(),
    'baskan', public.baskan_mi());
end $$;


-- QR görevi veya kısa kod ile puan kazan.
--   p_icerik  QR içeriği ("YAZVEB:G:<token>") ya da kısa kod ("YAZ25")
--   p_enlem/p_boylam  yalnızca konum şartlı görevlerde gerekir
create or replace function public.odul_gorev_tamamla(
  p_icerik text, p_enlem double precision default null, p_boylam double precision default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul
as $$
declare
  kim uuid := auth.uid();
  g odul.gorevler;
  h odul.hesaplar;
  ay odul.ayarlar;
  girdi text := trim(coalesce(p_icerik, ''));
  yontem text;
  alinan integer;
  kullanim_id bigint;
  xp_once integer;
  xp_sonra integer;
  bonus integer := 0;
  ilk_katilim boolean := false;
  onceki_etkinlik bigint;
  yeni_seri integer;
  hedef jsonb;
begin
  if kim is null then return jsonb_build_object('durum', 'kimliksiz'); end if;
  if char_length(girdi) = 0 or char_length(girdi) > 200 then
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  if odul.deneme_siniri_asildi(kim) then
    return jsonb_build_object('durum', 'sinir');
  end if;
  if public.kota_harca('odul_tara') <> 'tamam' then
    return jsonb_build_object('durum', 'sinir');
  end if;

  -- Satır kilidi: aynı göreve gelen eşzamanlı istekler sıraya girer.
  if upper(girdi) like 'YAZVEB:G:%' then
    yontem := 'qr';
    select * into g from odul.gorevler where token = substr(girdi, 10) for update;
  elsif upper(girdi) like 'YAZVEB:S:%' then
    -- Sponsor QR'si görev ekranında okutuldu: yol göster, deneme sayma.
    return jsonb_build_object('durum', 'sponsor_qr');
  else
    yontem := 'kod';
    select * into g from odul.gorevler
    where kisa_kod = upper(regexp_replace(girdi, '[^A-Za-z0-9]', '', 'g')) for update;
  end if;

  if not found or not g.aktif or g.iptal_zamani is not null then
    perform odul.hatali_deneme(kim);
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  if now() < g.baslangic then
    return jsonb_build_object('durum', 'baslamadi', 'baslangic', g.baslangic, 'baslik', g.baslik);
  end if;
  if now() >= g.bitis then
    return jsonb_build_object('durum', 'suresi_doldu', 'baslik', g.baslik);
  end if;

  if g.enlem is not null then
    if p_enlem is null or p_boylam is null then
      return jsonb_build_object('durum', 'konum_gerekli', 'baslik', g.baslik);
    end if;
    if odul.mesafe_m(g.enlem, g.boylam, p_enlem, p_boylam) > g.yaricap_m then
      return jsonb_build_object('durum', 'konum_uzak', 'baslik', g.baslik);
    end if;
  end if;

  select count(*) into alinan from odul.gorev_kullanimlari where gorev_id = g.id and kullanici = kim;
  if alinan >= g.kisi_basi_limit then
    return jsonb_build_object('durum', 'zaten_alindi', 'baslik', g.baslik);
  end if;
  if g.toplam_limit is not null and g.kullanim_sayisi >= g.toplam_limit then
    return jsonb_build_object('durum', 'tukendi', 'baslik', g.baslik);
  end if;

  h := odul.hesap_kilitle(kim);
  xp_once := h.xp;

  -- Bu etkinliğe ilk katılım mı? (Aynı etkinliğin ikinci görevi katılımı ikiye katlamaz.)
  if g.etkinlik_id is not null then
    ilk_katilim := not exists (
      select 1 from odul.gorev_kullanimlari gk
      join odul.gorevler gg on gg.id = gk.gorev_id
      where gk.kullanici = kim and gg.etkinlik_id = g.etkinlik_id);
  end if;

  insert into odul.gorev_kullanimlari (gorev_id, kullanici, yontem, puan)
  values (g.id, kim, yontem, g.puan) returning id into kullanim_id;
  update odul.gorevler set kullanim_sayisi = kullanim_sayisi + 1 where id = g.id;

  xp_sonra := odul.puan_ekle(kim, g.puan, 'gorev', g.baslik, kullanim_id, null);

  yeni_seri := h.seri;
  if ilk_katilim then
    -- Seri: puan görevi olan bir önceki etkinliğe de katıldıysa artar.
    select e.id into onceki_etkinlik
    from public.etkinlikler e
    where e.baslangic < (select baslangic from public.etkinlikler where id = g.etkinlik_id)
      and exists (select 1 from odul.gorevler x where x.etkinlik_id = e.id)
    order by e.baslangic desc limit 1;

    if onceki_etkinlik is not null and exists (
         select 1 from odul.gorev_kullanimlari gk join odul.gorevler gg on gg.id = gk.gorev_id
         where gk.kullanici = kim and gg.etkinlik_id = onceki_etkinlik) then
      yeni_seri := h.seri + 1;
    else
      yeni_seri := 1;
    end if;

    update odul.hesaplar
    set etkinlik_sayisi = etkinlik_sayisi + 1, seri = yeni_seri, son_etkinlik = g.etkinlik_id
    where kullanici = kim;

    select * into ay from odul.ayarlar;
    if ay.seri_acik and ay.seri_bonuslari ? yeni_seri::text then
      bonus := greatest(0, least(10000, (ay.seri_bonuslari->>yeni_seri::text)::integer));
      if bonus > 0 then
        xp_sonra := odul.puan_ekle(kim, bonus, 'seri_bonusu', 'Seri ×' || yeni_seri, kullanim_id, null);
      end if;
    end if;
  end if;

  select h2.etkinlik_sayisi into h.etkinlik_sayisi from odul.hesaplar h2 where kullanici = kim;
  select jsonb_build_object('sponsor', s.ad) || odul.kilit_durumu(s, xp_sonra, h.etkinlik_sayisi) into hedef
  from odul.sponsorlar s
  where s.aktif and not (odul.kilit_durumu(s, xp_sonra, h.etkinlik_sayisi)->>'acik')::boolean
  order by (odul.kilit_durumu(s, xp_sonra, h.etkinlik_sayisi)->>'eksik_xp')::integer
  limit 1;

  return jsonb_build_object(
    'durum', 'tamam',
    'baslik', g.baslik,
    'puan', g.puan,
    'bonus', bonus,
    'seri', yeni_seri,
    'xp', xp_sonra,
    'xp_once', xp_once,
    'seviye', odul.seviye_bilgisi(xp_sonra),
    'seviye_atladi', (odul.seviye_bilgisi(xp_sonra)->>'sira') <> (odul.seviye_bilgisi(xp_once)->>'sira'),
    'yeni_kilitler', (select coalesce(jsonb_agg(s.ad), '[]') from odul.sponsorlar s
                      where s.aktif
                        and (odul.kilit_durumu(s, xp_sonra, h.etkinlik_sayisi)->>'acik')::boolean
                        and not (odul.kilit_durumu(s, xp_once,
                                   h.etkinlik_sayisi - case when ilk_katilim then 1 else 0 end)->>'acik')::boolean),
    'sonraki_kilit', hedef);
end $$;


create or replace function public.odul_sponsorlar()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
declare
  kim uuid := auth.uid();
  h odul.hesaplar;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  select * into h from odul.hesaplar where kullanici = kim;
  return (select coalesce(jsonb_agg(odul.sponsor_karti(s, kim, coalesce(h.xp, 0), coalesce(h.etkinlik_sayisi, 0))
                                    order by s.siralama, s.ad), '[]')
          from odul.sponsorlar s where s.aktif);
end $$;


create or replace function public.odul_sponsor_detay(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul
as $$
declare
  kim uuid := auth.uid();
  s odul.sponsorlar;
  h odul.hesaplar;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  select * into s from odul.sponsorlar where id = p_id and aktif;
  if not found then return null; end if;
  select * into h from odul.hesaplar where kullanici = kim;
  -- Görüntüleme günde bir kez sayılır.
  if not exists (select 1 from odul.sponsor_olaylari
                 where sponsor_id = s.id and kullanici = kim and tur = 'goruntuleme'
                   and zaman > now() - interval '1 day') then
    insert into odul.sponsor_olaylari (sponsor_id, kullanici, tur) values (s.id, kim, 'goruntuleme');
  end if;
  return odul.sponsor_karti(s, kim, coalesce(h.xp, 0), coalesce(h.etkinlik_sayisi, 0));
end $$;


-- Sponsor QR'si (veya kampanya kısa kodu) ile sürpriz ödül.
create or replace function public.odul_sponsor_tara(p_sponsor uuid, p_icerik text)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul
as $$
declare
  kim uuid := auth.uid();
  girdi text := trim(coalesce(p_icerik, ''));
  k odul.kampanyalar;
  s odul.sponsorlar;
  h odul.hesaplar;
  o odul.kampanya_odulleri;
  alinan integer;
  toplam_agirlik double precision;
  hedef_agirlik double precision;
  yeni_kod text;
  yeni odul.kazanimlar;
  kalan_toplam integer;
begin
  if kim is null then return jsonb_build_object('durum', 'kimliksiz'); end if;
  if char_length(girdi) = 0 or char_length(girdi) > 200 then
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  if odul.deneme_siniri_asildi(kim) then return jsonb_build_object('durum', 'sinir'); end if;
  if public.kota_harca('odul_tara') <> 'tamam' then return jsonb_build_object('durum', 'sinir'); end if;

  if upper(girdi) like 'YAZVEB:G:%' then
    return jsonb_build_object('durum', 'gorev_qr');
  end if;

  -- Kampanya satırı kilitlenir: bu kampanyaya gelen bütün talepler sıraya
  -- girer, stok ve kişi başı hak yarışsız hesaplanır.
  if upper(girdi) like 'YAZVEB:S:%' then
    select * into k from odul.kampanyalar where token = substr(girdi, 10) for update;
  else
    select * into k from odul.kampanyalar
    where kisa_kod = upper(regexp_replace(girdi, '[^A-Za-z0-9]', '', 'g')) for update;
  end if;

  if not found then
    perform odul.hatali_deneme(kim);
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  if k.sponsor_id is distinct from p_sponsor then
    perform odul.hatali_deneme(kim);
    return jsonb_build_object('durum', 'yanlis_sponsor');
  end if;

  select * into s from odul.sponsorlar where id = k.sponsor_id;
  if not s.aktif or not k.aktif or k.iptal_zamani is not null then
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  if now() < k.baslangic then return jsonb_build_object('durum', 'baslamadi', 'baslangic', k.baslangic); end if;
  if now() >= k.bitis then return jsonb_build_object('durum', 'suresi_doldu'); end if;

  select * into h from odul.hesaplar where kullanici = kim;
  if not (odul.kilit_durumu(s, coalesce(h.xp, 0), coalesce(h.etkinlik_sayisi, 0))->>'acik')::boolean then
    return jsonb_build_object('durum', 'kilitli',
                              'kilit', odul.kilit_durumu(s, coalesce(h.xp, 0), coalesce(h.etkinlik_sayisi, 0)));
  end if;

  select count(*) into alinan from odul.kazanimlar where kampanya_id = k.id and kullanici = kim;
  if alinan >= k.kisi_basi_limit then
    return jsonb_build_object('durum', 'zaten_alindi');
  end if;

  -- Çekiliş: sınırlı kalemlerde ağırlık = kalan stok, sınırsızda admin ağırlığı.
  select coalesce(sum(case when kalan is null then agirlik else kalan end), 0) into toplam_agirlik
  from odul.kampanya_odulleri where kampanya_id = k.id and (kalan is null or kalan > 0);

  if toplam_agirlik = 0 then
    return jsonb_build_object('durum', 'tukendi');
  end if;

  hedef_agirlik := odul.rastgele_oran() * toplam_agirlik;
  select * into o from (
    select x.*, sum(case when x.kalan is null then x.agirlik else x.kalan end)
                  over (order by x.olusturuldu, x.id) as birikimli
    from odul.kampanya_odulleri x
    where x.kampanya_id = k.id and (x.kalan is null or x.kalan > 0)
  ) y
  where y.birikimli > hedef_agirlik
  order by y.birikimli limit 1;

  update odul.kampanya_odulleri set kalan = kalan - 1 where id = o.id and kalan is not null;

  loop
    yeni_kod := odul.rastgele_kod(4) || '-' || odul.rastgele_kod(3);
    exit when not exists (select 1 from odul.kazanimlar z where z.kod = yeni_kod);
  end loop;

  insert into odul.kazanimlar (kullanici, kampanya_id, odul_id, sponsor_ad, odul_baslik, odul_tur,
                               odul_ikon, odul_aciklama, kod, son_kullanma)
  values (kim, k.id, o.id, s.ad, o.baslik, o.tur, o.ikon, o.aciklama, yeni_kod,
          least(now() + make_interval(days => k.gecerlilik_gun), k.bitis + interval '7 days'))
  returning * into yeni;

  insert into odul.sponsor_olaylari (sponsor_id, kullanici, tur) values (s.id, kim, 'tarama');

  select coalesce(sum(kalan), 0) into kalan_toplam from odul.kampanya_odulleri
  where kampanya_id = k.id and kalan is not null;

  return jsonb_build_object(
    'durum', 'tamam',
    'kazanim', jsonb_build_object(
      'id', yeni.id, 'sponsor', yeni.sponsor_ad, 'baslik', yeni.odul_baslik, 'tur', yeni.odul_tur,
      'ikon', yeni.odul_ikon, 'aciklama', yeni.odul_aciklama, 'kod', yeni.kod,
      'zaman', yeni.zaman, 'son_kullanma', yeni.son_kullanma));
end $$;


create or replace function public.odul_cuzdan()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
declare kim uuid := auth.uid();
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  -- Kod burada GÖNDERİLMEZ; yalnızca "Ödülü göster" ekranında, sahibine.
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', z.id, 'sponsor', z.sponsor_ad, 'baslik', z.odul_baslik, 'tur', z.odul_tur,
            'ikon', z.odul_ikon, 'aciklama', z.odul_aciklama, 'zaman', z.zaman,
            'son_kullanma', z.son_kullanma, 'kullanildi', z.kullanildi,
            'durum', case when z.iptal is not null then 'iptal'
                          when z.kullanildi is not null then 'kullanildi'
                          when z.son_kullanma <= now() then 'suresi_doldu'
                          else 'aktif' end)
          order by z.zaman desc), '[]')
          from odul.kazanimlar z where z.kullanici = kim);
end $$;


-- "Ödülü göster" ekranı: kod + her 30 saniyede değişen doğrulama kodu +
-- sunucu saati. Ekran görüntüsündeki kod ve saat birkaç saniyede eskir.
create or replace function public.odul_goster(p_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, odul, extensions
as $$
declare
  kim uuid := auth.uid();
  z odul.kazanimlar;
  sir bytea;
  pencere bigint := floor(extract(epoch from now()) / 30);
  ozet text;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  -- Başkasının ödül kimliği tahmin edilse bile sahip değilse "bulunamadı".
  select * into z from odul.kazanimlar where id = p_id and kullanici = kim;
  if not found then return jsonb_build_object('durum', 'bulunamadi'); end if;
  select a.sir into sir from odul.ayarlar a;
  ozet := encode(extensions.hmac(convert_to(z.id::text || ':' || pencere::text, 'UTF8'), sir, 'sha256'), 'hex');
  return jsonb_build_object(
    'durum', case when z.iptal is not null then 'iptal'
                  when z.kullanildi is not null then 'kullanildi'
                  when z.son_kullanma <= now() then 'suresi_doldu'
                  else 'aktif' end,
    'id', z.id, 'kod', z.kod, 'sponsor', z.sponsor_ad, 'baslik', z.odul_baslik,
    'ikon', z.odul_ikon, 'tur', z.odul_tur, 'aciklama', z.odul_aciklama,
    'zaman', z.zaman, 'son_kullanma', z.son_kullanma, 'kullanildi', z.kullanildi,
    -- Öğrenci işletmenin kapısında "doğru yerde miyim?" diye sormasın.
    'adres', (select sp.adres from odul.kampanyalar kk join odul.sponsorlar sp on sp.id = kk.sponsor_id
              where kk.id = z.kampanya_id),
    'dogrulama', lpad(((('x' || substr(ozet, 1, 8))::bit(32)::bigint) % 10000)::text, 4, '0'),
    'pencere_bitis', to_timestamp((pencere + 1) * 30),
    'sunucu_zamani', now());
end $$;


-- Ödülü kullan: işletme çalışanı kendi PIN'ini kullanıcının ekranına girer.
-- Kullanıldı işareti sunucuda; ekran görüntüsüyle aynı ödül ikinci kez
-- kullanılamaz.
create or replace function public.odul_kullan(p_id uuid, p_pin text)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul, extensions
as $$
declare
  kim uuid := auth.uid();
  z odul.kazanimlar;
  pin_ozet text;
  hatali integer;
begin
  if kim is null then return jsonb_build_object('durum', 'kimliksiz'); end if;
  select * into z from odul.kazanimlar where id = p_id and kullanici = kim for update;
  if not found then return jsonb_build_object('durum', 'bulunamadi'); end if;
  if z.iptal is not null then return jsonb_build_object('durum', 'iptal'); end if;
  if z.kullanildi is not null then return jsonb_build_object('durum', 'zaten_kullanildi', 'zaman', z.kullanildi); end if;
  if z.son_kullanma <= now() then return jsonb_build_object('durum', 'suresi_doldu'); end if;

  select count(*) into hatali from odul.denemeler
  where tur = 'pin' and (hedef = z.id or kullanici = kim) and zaman > now() - interval '15 minutes';
  if hatali >= 5 then return jsonb_build_object('durum', 'sinir'); end if;

  select s.pin_ozet into pin_ozet from odul.kampanyalar k join odul.sponsorlar s on s.id = k.sponsor_id
  where k.id = z.kampanya_id;
  if pin_ozet is null then return jsonb_build_object('durum', 'pin_tanimsiz'); end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' or extensions.crypt(p_pin, pin_ozet) <> pin_ozet then
    insert into odul.denemeler (tur, kullanici, hedef) values ('pin', kim, z.id);
    return jsonb_build_object('durum', 'pin_hatali', 'kalan_deneme', greatest(0, 4 - hatali));
  end if;

  update odul.kazanimlar set kullanildi = now() where id = z.id returning * into z;
  return jsonb_build_object('durum', 'kullanildi', 'zaman', z.kullanildi);
end $$;


-- Sıralama. Varsayılan dönem HAFTA.
-- Tüm zamanlar tablosu yeni ya da seyrek gelen üyeyi kalıcı olarak alt
-- sıralara iter; sosyal karşılaştırma motivasyonu düşürür. Her pazartesi
-- (İstanbul saati) sıfırlanan tablo herkese yeniden şans verir.
--   'hafta'  bu haftaki defter toplamı
--   'tum'    hesaptaki toplam XP
drop function if exists public.odul_liderlik();
create or replace function public.odul_liderlik(p_donem text default 'hafta')
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
declare
  kim uuid := auth.uid();
  bas timestamptz := date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  sonuc jsonb;
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  if p_donem is null or p_donem not in ('hafta', 'tum') then
    raise exception 'Geçersiz dönem.' using errcode = '22023';
  end if;
  if not (select liderlik_acik from odul.ayarlar) then return jsonb_build_object('acik', false); end if;

  with puanlar as (
    select h.kullanici, h.gizli, h.seri, h.xp as toplam_xp,
           case when p_donem = 'tum' then h.xp
                else coalesce((select sum(pi.miktar) from odul.puan_islemleri pi
                               where pi.kullanici = h.kullanici and pi.zaman >= bas), 0)::integer
           end as puan
    from odul.hesaplar h
  ),
  sirali as (
    select p.*, pr.kullanici_adi, rank() over (order by p.puan desc) as sira
    from puanlar p join public.profiller pr on pr.id = p.kullanici
    -- Gerçek ad değil, kullanıcı adı. Gizli profiller listede hiç yer almaz.
    where not p.gizli and p.puan > 0
  )
  select jsonb_build_object(
    'acik', true,
    'donem', p_donem,
    'baslangic', case when p_donem = 'hafta' then bas end,
    'liste', (select coalesce(jsonb_agg(jsonb_build_object(
                'sira', t.sira, 'ad', t.kullanici_adi, 'xp', t.puan,
                'seviye', odul.seviye_bilgisi(t.toplam_xp)->>'ad',
                'seri', t.seri, 'ben', t.kullanici = kim) order by t.sira, t.kullanici_adi), '[]')
              from (select * from sirali order by sira, kullanici_adi limit 20) t),
    'ben', (select jsonb_build_object(
              'xp', coalesce(p.puan, 0), 'gizli', coalesce(p.gizli, false),
              'sira', case when coalesce(p.puan, 0) <= 0 then null
                           else (select count(*) + 1 from puanlar x where not x.gizli and x.puan > p.puan) end)
            from (select 1) _ left join puanlar p on p.kullanici = kim),
    -- Kimse tek başına değil: bu hafta toplulukça ne yapıldı. Toplam sayı,
    -- kimlik yok (gizli profiller de sayıya dahil, adları değil).
    'topluluk', case when p_donem = 'hafta' then jsonb_build_object(
                  'uye', (select count(*) from puanlar where puan > 0),
                  'xp', (select coalesce(sum(puan), 0) from puanlar where puan > 0)) end)
  into sonuc;
  return sonuc;
end $$;


-- Etkinlik takvimi için XP bağlamı: "Bu etkinliğe gelirsem ne olur?"
-- Görev kodu, kısa kod, konum, görev sayısı GÖNDERİLMEZ. Etkinlik başına
-- yalnızca şu an kazanılabilir toplam puan ve bu kullanıcının katılıp
-- katılmadığı.
create or replace function public.odul_etkinlik_ozeti()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
declare kim uuid := auth.uid();
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('etkinlik_id', x.etkinlik_id, 'puan', x.puan, 'katildi', x.katildi)), '[]')
    from (
      select g.etkinlik_id,
             coalesce(sum(g.puan) filter (where g.aktif and g.iptal_zamani is null and g.bitis > now()), 0) as puan,
             bool_or(exists (select 1 from odul.gorev_kullanimlari gk
                             where gk.gorev_id = g.id and gk.kullanici = kim)) as katildi
      from odul.gorevler g
      where g.etkinlik_id is not null
      group by g.etkinlik_id
    ) x);
end $$;


create or replace function public.odul_gizlilik(p_gizli boolean)
returns void language plpgsql volatile security definer
set search_path = public, odul
as $$
declare kim uuid := auth.uid();
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  insert into odul.hesaplar (kullanici, gizli) values (kim, coalesce(p_gizli, false))
  on conflict (kullanici) do update set gizli = excluded.gizli;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- YÖNETİM API
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.odul_yonetim_ozet()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
begin
  perform odul.yetkili_olmali();
  return jsonb_build_object(
    'toplam_kullanici', (select count(*) from public.profiller),
    'aktif_kullanici', (select count(distinct kullanici) from (
        select kullanici from odul.gorev_kullanimlari where zaman > now() - interval '30 days'
        union all select kullanici from odul.kazanimlar where zaman > now() - interval '30 days') x),
    'etkinlik_katilimi', (select count(*) from (
        select distinct gk.kullanici, g.etkinlik_id from odul.gorev_kullanimlari gk
        join odul.gorevler g on g.id = gk.gorev_id where g.etkinlik_id is not null) x),
    'tarama', (select count(*) from odul.gorev_kullanimlari),
    'tarama_qr', (select count(*) from odul.gorev_kullanimlari where yontem = 'qr'),
    'tarama_kod', (select count(*) from odul.gorev_kullanimlari where yontem = 'kod'),
    'dagitilan_puan', (select coalesce(sum(miktar), 0) from odul.puan_islemleri where miktar > 0),
    'en_cok_gorev', (select jsonb_build_object('baslik', g.baslik, 'sayi', g.kullanim_sayisi)
                     from odul.gorevler g order by g.kullanim_sayisi desc limit 1),
    'en_cok_acilan_sponsor', (select jsonb_build_object('ad', t.ad, 'sayi', t.sayi) from (
                                select s.ad, (select count(*) from public.profiller p
                                  left join odul.hesaplar h on h.kullanici = p.id
                                  where (odul.kilit_durumu(s, coalesce(h.xp, 0), coalesce(h.etkinlik_sayisi, 0))->>'acik')::boolean) as sayi
                                from odul.sponsorlar s where s.aktif) t
                              order by t.sayi desc limit 1),
    'en_cok_kullanilan_odul', (select jsonb_build_object('baslik', odul_baslik, 'sponsor', sponsor_ad, 'sayi', count(*))
                               from odul.kazanimlar where kullanildi is not null
                               group by odul_baslik, sponsor_ad order by count(*) desc limit 1),
    'stok_kalan', (select coalesce(sum(o.kalan), 0) from odul.kampanya_odulleri o
                   join odul.kampanyalar k on k.id = o.kampanya_id
                   where k.aktif and k.iptal_zamani is null and k.bitis > now()),
    'tukenen_kalem', (select count(*) from odul.kampanya_odulleri where kalan = 0),
    'sponsorlar', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', s.id, 'ad', s.ad,
                     'goruntuleme', (select count(*) from odul.sponsor_olaylari e where e.sponsor_id = s.id and e.tur = 'goruntuleme'),
                     'tarama', (select count(*) from odul.sponsor_olaylari e where e.sponsor_id = s.id and e.tur = 'tarama'),
                     'kazanim', (select count(*) from odul.kazanimlar z join odul.kampanyalar k on k.id = z.kampanya_id where k.sponsor_id = s.id),
                     'kullanim', (select count(*) from odul.kazanimlar z join odul.kampanyalar k on k.id = z.kampanya_id where k.sponsor_id = s.id and z.kullanildi is not null))
                   order by s.siralama, s.ad), '[]') from odul.sponsorlar s));
end $$;


create or replace function public.odul_yonetim_gorevler()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
begin
  perform odul.yetkili_olmali();
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', g.id, 'etkinlik_id', g.etkinlik_id, 'etkinlik', e.baslik, 'baslik', g.baslik,
            'aciklama', g.aciklama, 'tur', g.tur, 'token', g.token, 'kisa_kod', g.kisa_kod,
            'puan', g.puan, 'baslangic', g.baslangic, 'bitis', g.bitis,
            'kisi_basi_limit', g.kisi_basi_limit, 'toplam_limit', g.toplam_limit,
            'kullanim_sayisi', g.kullanim_sayisi, 'aktif', g.aktif, 'iptal', g.iptal_zamani,
            'enlem', g.enlem, 'boylam', g.boylam, 'yaricap_m', g.yaricap_m,
            'baskan_kilidi', g.baskan_kilidi,
            'duzenlenebilir', public.baskan_mi() or not g.baskan_kilidi)
          order by g.baslangic desc), '[]')
          from odul.gorevler g left join public.etkinlikler e on e.id = g.etkinlik_id);
end $$;


-- Görev oluştur / düzenle. Token ve (verilmezse) kısa kod sunucuda üretilir.
create or replace function public.odul_gorev_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul
as $$
declare
  g odul.gorevler;
  kod text := nullif(upper(regexp_replace(coalesce(p->>'kisa_kod', ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  perform odul.yetkili_olmali();
  if kod is null then
    loop
      kod := odul.rastgele_kod(5);
      exit when not exists (select 1 from odul.gorevler where kisa_kod = kod)
            and not exists (select 1 from odul.kampanyalar where kisa_kod = kod);
    end loop;
  elsif exists (select 1 from odul.kampanyalar where kisa_kod = kod)
     or exists (select 1 from odul.gorevler where kisa_kod = kod and id is distinct from (p->>'id')::bigint) then
    raise exception 'Bu kısa kod zaten kullanılıyor.' using errcode = '23505';
  end if;

  if p ? 'id' and p->>'id' is not null then
    select * into g from odul.gorevler where id = (p->>'id')::bigint for update;
    if not found then raise exception 'Görev bulunamadı.'; end if;
    if g.baskan_kilidi and not public.baskan_mi() then
      raise exception 'Başkanın düzenlediği görevi değiştiremezsin.' using errcode = '42501';
    end if;
    update odul.gorevler set
      etkinlik_id = (p->>'etkinlik_id')::bigint,
      baslik = p->>'baslik', aciklama = nullif(p->>'aciklama', ''),
      tur = coalesce(p->>'tur', 'giris'), kisa_kod = kod,
      puan = (p->>'puan')::integer,
      baslangic = (p->>'baslangic')::timestamptz, bitis = (p->>'bitis')::timestamptz,
      kisi_basi_limit = coalesce((p->>'kisi_basi_limit')::integer, 1),
      toplam_limit = (p->>'toplam_limit')::integer,
      aktif = coalesce((p->>'aktif')::boolean, true),
      enlem = (p->>'enlem')::double precision, boylam = (p->>'boylam')::double precision,
      yaricap_m = (p->>'yaricap_m')::integer,
      baskan_kilidi = g.baskan_kilidi or public.baskan_mi(),
      guncellendi = now()
    where id = g.id returning * into g;
    perform odul.denetle('gorev_duzenle', 'gorev:' || g.id, p - 'token');
  else
    insert into odul.gorevler (etkinlik_id, baslik, aciklama, tur, token, kisa_kod, puan, baslangic, bitis,
                               kisi_basi_limit, toplam_limit, aktif, enlem, boylam, yaricap_m,
                               baskan_kilidi, olusturan)
    values ((p->>'etkinlik_id')::bigint, p->>'baslik', nullif(p->>'aciklama', ''),
            coalesce(p->>'tur', 'giris'), odul.token(), kod, (p->>'puan')::integer,
            (p->>'baslangic')::timestamptz, (p->>'bitis')::timestamptz,
            coalesce((p->>'kisi_basi_limit')::integer, 1), (p->>'toplam_limit')::integer,
            coalesce((p->>'aktif')::boolean, true),
            (p->>'enlem')::double precision, (p->>'boylam')::double precision, (p->>'yaricap_m')::integer,
            public.baskan_mi(), auth.uid())
    returning * into g;
    perform odul.denetle('gorev_olustur', 'gorev:' || g.id, p);
  end if;
  return jsonb_build_object('id', g.id, 'token', g.token, 'kisa_kod', g.kisa_kod);
end $$;


-- Görevi iptal et (QR geçersizleşir) ya da QR'yi yenile (eski baskılar geçersiz).
create or replace function public.odul_gorev_iptal(p_id bigint, p_yenile boolean default false)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul
as $$
declare g odul.gorevler;
begin
  perform odul.yetkili_olmali();
  select * into g from odul.gorevler where id = p_id for update;
  if not found then raise exception 'Görev bulunamadı.'; end if;
  if g.baskan_kilidi and not public.baskan_mi() then
    raise exception 'Başkanın düzenlediği görevi değiştiremezsin.' using errcode = '42501';
  end if;
  if p_yenile then
    update odul.gorevler set token = odul.token(), iptal_zamani = null, guncellendi = now()
    where id = p_id returning * into g;
    perform odul.denetle('gorev_qr_yenile', 'gorev:' || p_id, '{}');
  else
    update odul.gorevler set iptal_zamani = now(), aktif = false, guncellendi = now()
    where id = p_id returning * into g;
    perform odul.denetle('gorev_iptal', 'gorev:' || p_id, '{}');
  end if;
  return jsonb_build_object('id', g.id, 'token', g.token, 'kisa_kod', g.kisa_kod);
end $$;


create or replace function public.odul_yonetim_sponsorlar()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
begin
  perform odul.yetkili_olmali();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'ad', s.ad, 'aciklama', s.aciklama, 'logo', s.logo, 'website', s.website,
      'adres', s.adres, 'gerekli_xp', s.gerekli_xp, 'gerekli_seviye_id', s.gerekli_seviye_id,
      'gerekli_etkinlik', s.gerekli_etkinlik, 'aktif', s.aktif, 'siralama', s.siralama,
      'pin_tanimli', s.pin_ozet is not null, 'baskan_kilidi', s.baskan_kilidi,
      'duzenlenebilir', public.baskan_mi() or not s.baskan_kilidi,
      'kampanyalar', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.id, 'ad', k.ad, 'token', k.token, 'kisa_kod', k.kisa_kod,
          'baslangic', k.baslangic, 'bitis', k.bitis, 'aktif', k.aktif, 'iptal', k.iptal_zamani,
          'kisi_basi_limit', k.kisi_basi_limit, 'surpriz', k.surpriz, 'gecerlilik_gun', k.gecerlilik_gun,
          'baskan_kilidi', k.baskan_kilidi, 'duzenlenebilir', public.baskan_mi() or not k.baskan_kilidi,
          'kazanim', (select count(*) from odul.kazanimlar z where z.kampanya_id = k.id),
          'kullanim', (select count(*) from odul.kazanimlar z where z.kampanya_id = k.id and z.kullanildi is not null),
          'oduller', (select coalesce(jsonb_agg(jsonb_build_object(
              'id', o.id, 'baslik', o.baslik, 'tur', o.tur, 'ikon', o.ikon, 'aciklama', o.aciklama,
              'toplam', o.toplam, 'kalan', o.kalan, 'agirlik', o.agirlik) order by o.olusturuldu), '[]')
            from odul.kampanya_odulleri o where o.kampanya_id = k.id))
        order by k.bitis desc), '[]') from odul.kampanyalar k where k.sponsor_id = s.id))
    order by s.siralama, s.ad), '[]') from odul.sponsorlar s);
end $$;


create or replace function public.odul_sponsor_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul, extensions
as $$
declare
  s odul.sponsorlar;
  pin text := nullif(p->>'pin', '');
begin
  perform odul.yetkili_olmali();
  if pin is not null and pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN 4-8 haneli rakam olmalı.' using errcode = '22023';
  end if;

  if p ? 'id' and p->>'id' is not null then
    select * into s from odul.sponsorlar where id = (p->>'id')::uuid for update;
    if not found then raise exception 'Sponsor bulunamadı.'; end if;
    if s.baskan_kilidi and not public.baskan_mi() then
      raise exception 'Başkanın düzenlediği sponsoru değiştiremezsin.' using errcode = '42501';
    end if;
    update odul.sponsorlar set
      ad = p->>'ad', aciklama = nullif(p->>'aciklama', ''),
      logo = case when p ? 'logo' then nullif(p->>'logo', '') else logo end,
      website = nullif(p->>'website', ''), adres = nullif(p->>'adres', ''),
      gerekli_xp = coalesce((p->>'gerekli_xp')::integer, 0),
      gerekli_seviye_id = (p->>'gerekli_seviye_id')::smallint,
      gerekli_etkinlik = coalesce((p->>'gerekli_etkinlik')::integer, 0),
      aktif = coalesce((p->>'aktif')::boolean, true),
      siralama = coalesce((p->>'siralama')::integer, 0),
      pin_ozet = case when pin is not null then extensions.crypt(pin, extensions.gen_salt('bf', 10)) else pin_ozet end,
      baskan_kilidi = s.baskan_kilidi or public.baskan_mi(),
      guncellendi = now()
    where id = s.id returning * into s;
    perform odul.denetle('sponsor_duzenle', 'sponsor:' || s.id, (p - 'pin' - 'logo') || jsonb_build_object('pin_degisti', pin is not null));
  else
    insert into odul.sponsorlar (ad, aciklama, logo, website, adres, gerekli_xp, gerekli_seviye_id,
                                 gerekli_etkinlik, aktif, siralama, pin_ozet, baskan_kilidi, olusturan)
    values (p->>'ad', nullif(p->>'aciklama', ''), nullif(p->>'logo', ''), nullif(p->>'website', ''),
            nullif(p->>'adres', ''), coalesce((p->>'gerekli_xp')::integer, 0),
            (p->>'gerekli_seviye_id')::smallint, coalesce((p->>'gerekli_etkinlik')::integer, 0),
            coalesce((p->>'aktif')::boolean, true), coalesce((p->>'siralama')::integer, 0),
            case when pin is not null then extensions.crypt(pin, extensions.gen_salt('bf', 10)) end,
            public.baskan_mi(), auth.uid())
    returning * into s;
    perform odul.denetle('sponsor_olustur', 'sponsor:' || s.id, (p - 'pin' - 'logo') || jsonb_build_object('pin_tanimli', pin is not null));
  end if;
  return jsonb_build_object('id', s.id);
end $$;


-- Kampanya + ödül kalemleri.
--   p.oduller: [{ id?, baslik, tur, ikon, aciklama, sinirsiz, adet (yeni kalem),
--                 stok_ekle (mevcut kalem), agirlik, sil }]
create or replace function public.odul_kampanya_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul
as $$
declare
  k odul.kampanyalar;
  s odul.sponsorlar;
  kalem jsonb;
  o odul.kampanya_odulleri;
  kod text := nullif(upper(regexp_replace(coalesce(p->>'kisa_kod', ''), '[^A-Za-z0-9]', '', 'g')), '');
  adet integer;
  ekle integer;
begin
  perform odul.yetkili_olmali();
  select * into s from odul.sponsorlar where id = (p->>'sponsor_id')::uuid;
  if not found then raise exception 'Sponsor bulunamadı.'; end if;

  if kod is null and not (p ? 'id' and p->>'id' is not null) then
    loop
      kod := odul.rastgele_kod(6);
      exit when not exists (select 1 from odul.kampanyalar where kisa_kod = kod)
            and not exists (select 1 from odul.gorevler where kisa_kod = kod);
    end loop;
  elsif kod is not null and (exists (select 1 from odul.gorevler where kisa_kod = kod)
     or exists (select 1 from odul.kampanyalar where kisa_kod = kod and id is distinct from (p->>'id')::uuid)) then
    raise exception 'Bu kısa kod zaten kullanılıyor.' using errcode = '23505';
  end if;

  if p ? 'id' and p->>'id' is not null then
    select * into k from odul.kampanyalar where id = (p->>'id')::uuid for update;
    if not found then raise exception 'Kampanya bulunamadı.'; end if;
    if k.baskan_kilidi and not public.baskan_mi() then
      raise exception 'Başkanın düzenlediği kampanyayı değiştiremezsin.' using errcode = '42501';
    end if;
    update odul.kampanyalar set
      ad = p->>'ad', kisa_kod = coalesce(kod, kisa_kod),
      baslangic = (p->>'baslangic')::timestamptz, bitis = (p->>'bitis')::timestamptz,
      aktif = coalesce((p->>'aktif')::boolean, true),
      iptal_zamani = case when coalesce((p->>'aktif')::boolean, true) then null else iptal_zamani end,
      kisi_basi_limit = coalesce((p->>'kisi_basi_limit')::integer, 1),
      surpriz = coalesce((p->>'surpriz')::boolean, true),
      gecerlilik_gun = coalesce((p->>'gecerlilik_gun')::integer, 30),
      token = case when coalesce((p->>'token_yenile')::boolean, false) then odul.token() else token end,
      baskan_kilidi = k.baskan_kilidi or public.baskan_mi(),
      guncellendi = now()
    where id = k.id returning * into k;
  else
    insert into odul.kampanyalar (sponsor_id, ad, token, kisa_kod, baslangic, bitis, aktif,
                                  kisi_basi_limit, surpriz, gecerlilik_gun, baskan_kilidi, olusturan)
    values (s.id, p->>'ad', odul.token(), kod, (p->>'baslangic')::timestamptz, (p->>'bitis')::timestamptz,
            coalesce((p->>'aktif')::boolean, true), coalesce((p->>'kisi_basi_limit')::integer, 1),
            coalesce((p->>'surpriz')::boolean, true), coalesce((p->>'gecerlilik_gun')::integer, 30),
            public.baskan_mi(), auth.uid())
    returning * into k;
  end if;

  for kalem in select * from jsonb_array_elements(coalesce(p->'oduller', '[]'::jsonb)) loop
    if kalem ? 'id' and kalem->>'id' is not null then
      select * into o from odul.kampanya_odulleri where id = (kalem->>'id')::uuid and kampanya_id = k.id for update;
      if not found then raise exception 'Ödül kalemi bulunamadı.'; end if;
      if coalesce((kalem->>'sil')::boolean, false) then
        -- Kazanılmış kalem silinmez (cüzdanlar kopya taşır ama analitik bozulmasın): stok sıfırlanır.
        if exists (select 1 from odul.kazanimlar where odul_id = o.id) then
          update odul.kampanya_odulleri
          set toplam = coalesce(toplam, greatest(1, (select count(*) from odul.kazanimlar where odul_id = o.id)::integer)),
              kalan = 0
          where id = o.id;
        else
          delete from odul.kampanya_odulleri where id = o.id;
        end if;
        continue;
      end if;
      ekle := coalesce((kalem->>'stok_ekle')::integer, 0);
      if ekle < 0 or ekle > 100000 then raise exception 'Stok eklemesi 0-100000 arası olmalı.'; end if;
      update odul.kampanya_odulleri set
        baslik = kalem->>'baslik', tur = coalesce(kalem->>'tur', 'urun'),
        ikon = coalesce(kalem->>'ikon', 'hediye'), aciklama = nullif(kalem->>'aciklama', ''),
        agirlik = coalesce((kalem->>'agirlik')::integer, 1),
        toplam = case when coalesce((kalem->>'sinirsiz')::boolean, false) then null
                      when toplam is null then greatest(ekle, 1) else toplam + ekle end,
        kalan  = case when coalesce((kalem->>'sinirsiz')::boolean, false) then null
                      when kalan is null then greatest(ekle, 1) else kalan + ekle end
      where id = o.id;
    else
      adet := (kalem->>'adet')::integer;
      if not coalesce((kalem->>'sinirsiz')::boolean, false) and (adet is null or adet < 1 or adet > 100000) then
        raise exception 'Ödül adedi 1-100000 arası olmalı ya da sınırsız seçilmeli.';
      end if;
      insert into odul.kampanya_odulleri (kampanya_id, baslik, tur, ikon, aciklama, toplam, kalan, agirlik)
      values (k.id, kalem->>'baslik', coalesce(kalem->>'tur', 'urun'), coalesce(kalem->>'ikon', 'hediye'),
              nullif(kalem->>'aciklama', ''),
              case when coalesce((kalem->>'sinirsiz')::boolean, false) then null else adet end,
              case when coalesce((kalem->>'sinirsiz')::boolean, false) then null else adet end,
              coalesce((kalem->>'agirlik')::integer, 1));
    end if;
  end loop;

  perform odul.denetle(case when p ? 'id' and p->>'id' is not null then 'kampanya_duzenle' else 'kampanya_olustur' end,
                       'kampanya:' || k.id, p);
  return jsonb_build_object('id', k.id, 'token', k.token, 'kisa_kod', k.kisa_kod);
end $$;


create or replace function public.odul_kampanya_iptal(p_id uuid)
returns void language plpgsql volatile security definer
set search_path = public, odul
as $$
declare k odul.kampanyalar;
begin
  perform odul.yetkili_olmali();
  select * into k from odul.kampanyalar where id = p_id for update;
  if not found then raise exception 'Kampanya bulunamadı.'; end if;
  if k.baskan_kilidi and not public.baskan_mi() then
    raise exception 'Başkanın düzenlediği kampanyayı değiştiremezsin.' using errcode = '42501';
  end if;
  update odul.kampanyalar set iptal_zamani = now(), aktif = false, guncellendi = now() where id = p_id;
  perform odul.denetle('kampanya_iptal', 'kampanya:' || p_id, '{}');
end $$;


create or replace function public.odul_yonetim_kullanicilar(p_ara text default null)
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
begin
  perform odul.yetkili_olmali();
  return (select coalesce(jsonb_agg(x order by (x->>'xp')::integer desc), '[]') from (
    select jsonb_build_object('id', p.id, 'kullanici_adi', p.kullanici_adi, 'ad_soyad', p.ad_soyad,
                              'rol', p.rol, 'xp', coalesce(h.xp, 0), 'etkinlik', coalesce(h.etkinlik_sayisi, 0),
                              'seri', coalesce(h.seri, 0), 'seviye', odul.seviye_bilgisi(coalesce(h.xp, 0))->>'ad',
                              'odul', (select count(*) from odul.kazanimlar z where z.kullanici = p.id)) as x
    from public.profiller p left join odul.hesaplar h on h.kullanici = p.id
    where p_ara is null or p.kullanici_adi ilike '%' || p_ara || '%' or p.ad_soyad ilike '%' || p_ara || '%'
    limit 200) t);
end $$;


create or replace function public.odul_puan_ayarla(p_kullanici uuid, p_miktar integer, p_aciklama text)
returns jsonb language plpgsql volatile security definer
set search_path = public, odul
as $$
declare yeni integer;
begin
  perform odul.baskan_olmali();
  if p_miktar is null or p_miktar = 0 or abs(p_miktar) > 100000 then
    raise exception 'Miktar 0 olamaz, en fazla ±100000.' using errcode = '22023';
  end if;
  if coalesce(trim(p_aciklama), '') = '' then
    raise exception 'Açıklama zorunlu (denetim kaydı için).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiller where id = p_kullanici) then
    raise exception 'Kullanıcı bulunamadı.';
  end if;
  yeni := odul.puan_ekle(p_kullanici, p_miktar, 'yonetici', trim(p_aciklama), null, auth.uid());
  perform odul.denetle('puan_ayarla', 'kullanici:' || p_kullanici,
                       jsonb_build_object('miktar', p_miktar, 'aciklama', p_aciklama, 'yeni_xp', yeni));
  return jsonb_build_object('xp', yeni);
end $$;


create or replace function public.odul_seviyeler_kaydet(p jsonb)
returns void language plpgsql volatile security definer
set search_path = public, odul
as $$
declare kalem jsonb;
begin
  perform odul.baskan_olmali();
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 or jsonb_array_length(p) > 30 then
    raise exception 'En az 1, en fazla 30 seviye.' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(p) e where (e->>'esik')::integer = 0) then
    raise exception '0 XP eşikli bir başlangıç seviyesi olmalı.' using errcode = '22023';
  end if;
  -- Silinecekler: listede olmayan kimlikler.
  delete from odul.seviyeler where id not in (
    select (e->>'id')::smallint from jsonb_array_elements(p) e where e->>'id' is not null);
  if exists (select 1 from jsonb_array_elements(p) e
             where (e->>'esik')::integer not between 0 and 10000000) then
    raise exception 'Seviye eşiği 0 ile 10.000.000 arasında olmalı.' using errcode = '22023';
  end if;
  set constraints odul.seviyeler_esik_benzersiz deferred;
  for kalem in select * from jsonb_array_elements(p) loop
    if kalem->>'id' is not null and exists (select 1 from odul.seviyeler where id = (kalem->>'id')::smallint) then
      update odul.seviyeler set ad = kalem->>'ad', esik_xp = (kalem->>'esik')::integer,
             ikon = coalesce(kalem->>'ikon', 'yildiz'), aciklama = nullif(kalem->>'aciklama', '')
      where id = (kalem->>'id')::smallint;
    else
      insert into odul.seviyeler (ad, esik_xp, ikon, aciklama)
      values (kalem->>'ad', (kalem->>'esik')::integer, coalesce(kalem->>'ikon', 'yildiz'), nullif(kalem->>'aciklama', ''));
    end if;
  end loop;
  perform odul.denetle('seviyeler_kaydet', 'seviyeler', p);
end $$;


create or replace function public.odul_ayarlar_kaydet(p jsonb)
returns void language plpgsql volatile security definer
set search_path = public, odul
as $$
declare anahtar text;
begin
  perform odul.baskan_olmali();
  if p ? 'seri_bonuslari' then
    if jsonb_typeof(p->'seri_bonuslari') <> 'object' then
      raise exception 'Seri bonusları nesne olmalı: {"3": 50}.' using errcode = '22023';
    end if;
    for anahtar in select jsonb_object_keys(p->'seri_bonuslari') loop
      if anahtar !~ '^[0-9]{1,3}$' or (p->'seri_bonuslari'->>anahtar) !~ '^[0-9]{1,5}$' then
        raise exception 'Seri bonusu geçersiz: %', anahtar using errcode = '22023';
      end if;
    end loop;
  end if;
  update odul.ayarlar set
    seri_acik = coalesce((p->>'seri_acik')::boolean, seri_acik),
    seri_bonuslari = coalesce(p->'seri_bonuslari', seri_bonuslari),
    liderlik_acik = coalesce((p->>'liderlik_acik')::boolean, liderlik_acik);
  perform odul.denetle('ayarlar_kaydet', 'ayarlar', p);
end $$;


create or replace function public.odul_yonetim_seviyeler()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
begin
  perform odul.yetkili_olmali();
  return jsonb_build_object(
    'seviyeler', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ad', ad, 'esik', esik_xp,
                    'ikon', ikon, 'aciklama', aciklama) order by esik_xp), '[]') from odul.seviyeler),
    'ayarlar', (select jsonb_build_object('seri_acik', seri_acik, 'seri_bonuslari', seri_bonuslari,
                    'liderlik_acik', liderlik_acik) from odul.ayarlar));
end $$;


create or replace function public.odul_yonetim_kazanimlar()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
begin
  perform odul.yetkili_olmali();
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', z.id, 'kullanici', p.kullanici_adi, 'sponsor', z.sponsor_ad, 'baslik', z.odul_baslik,
            'kod', z.kod, 'zaman', z.zaman, 'son_kullanma', z.son_kullanma, 'kullanildi', z.kullanildi,
            'durum', case when z.iptal is not null then 'iptal' when z.kullanildi is not null then 'kullanildi'
                          when z.son_kullanma <= now() then 'suresi_doldu' else 'aktif' end)
          order by z.zaman desc), '[]')
          from (select * from odul.kazanimlar order by zaman desc limit 200) z
          join public.profiller p on p.id = z.kullanici);
end $$;


create or replace function public.odul_yonetim_denetim()
returns jsonb language plpgsql stable security definer
set search_path = public, odul
as $$
begin
  perform odul.baskan_olmali();
  return (select coalesce(jsonb_agg(jsonb_build_object('zaman', d.zaman, 'yapan', p.kullanici_adi,
            'islem', d.islem, 'hedef', d.hedef, 'ayrinti', d.ayrinti) order by d.zaman desc), '[]')
          from (select * from odul.denetim order by zaman desc limit 200) d
          left join public.profiller p on p.id = d.yapan);
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- YETKİLER
-- ═══════════════════════════════════════════════════════════════════
-- Supabase public şemasındaki her yeni fonksiyona anon ve authenticated
-- rollerine AÇIK yetki verir (04_guvenlik.sql'deki dersin tekrarı).
-- Bütün odul_* fonksiyonları: anonimden alınır, girişliye verilir; kim ne
-- yapabilir kararı fonksiyonların içinde.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'odul\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.imza);
    execute format('grant execute on function %s to authenticated', f.imza);
  end loop;
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'odul'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.imza);
  end loop;
end $$;
