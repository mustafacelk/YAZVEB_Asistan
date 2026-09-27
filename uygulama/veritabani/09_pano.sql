-- ═══════════════════════════════════════════════════════════════════
-- PANO — öğrencilerin paylaştığı içerik: ilk modül NOTLAR
-- ═══════════════════════════════════════════════════════════════════
-- 08_kimlik.sql'den SONRA çalıştırılır. Tekrar çalıştırmak zararsızdır.
--
-- Ders notu, çıkmış soru çözümü, özet. İleride ev devri, 2. el ve duyuru
-- aynı motoru kullanacak: doğrulanmış yazar, künye, şikayet, moderasyon,
-- süre, kişi başı sınır.
--
-- KURALLAR (ürünün değişmez ilkeleri)
-- ─────────────────────────────────────
-- • Uygulamada para dönmez. Öğrenci içeriği parayla öne çıkarılamaz.
-- • Sponsorlu içerik yalnızca SPONSORLU etiketiyle, organik içeriğin
--   yanında durur; organik içeriği hiçbir zaman listeden itmez.
-- • Herkes notun VAR olduğunu görür; dosyayı açmak ve paylaşmak için
--   üniversite e-postasıyla doğrulama gerekir (kimlik.dogrulanmis).
--   Kural Storage'ın satır kurallarında: istemci atlayamaz.
--
-- PUAN (cazip, abartısız — ayarlar tablosundan değişir)
-- ─────────────────────────────────────────────────────
--   Not onaylandı (48 saat içinde geçerli şikayet yok)   +20 XP
--   Sınavdan önceki 14 gün / sınav haftası içinde        taban ×1,5 (+30)
--   Her "işime yaradı" (notu açmış, farklı doğrulanmış)  +3 XP
--   Bir notun tavanı 60 XP; haftalık not puanı tavanı 150 XP.
-- Puanın çoğu yüklemekten değil, başkasının işine yaramaktan gelir. Not
-- gizlenir ya da kaldırılırsa verilen puan geri alınır (xp_esitle).
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

create schema if not exists pano;
revoke all on schema pano from public, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- TABLOLAR
-- ═══════════════════════════════════════════════════════════════════

create table if not exists pano.ayarlar (
  id                boolean primary key default true check (id),
  taban_xp          integer not null default 20  check (taban_xp between 0 and 1000),
  oy_xp             integer not null default 3   check (oy_xp between 0 and 100),
  not_tavan         integer not null default 60  check (not_tavan between 0 and 5000),
  haftalik_tavan    integer not null default 150 check (haftalik_tavan between 0 and 10000),
  sinav_oncesi_gun  integer not null default 14  check (sinav_oncesi_gun between 0 and 60),
  sinav_carpani     numeric(3, 2) not null default 1.5 check (sinav_carpani between 1 and 3),
  onay_saat         integer not null default 48  check (onay_saat between 0 and 336),
  sikayet_esigi     integer not null default 3   check (sikayet_esigi between 1 and 50),
  gunluk_yukleme    integer not null default 5   check (gunluk_yukleme between 1 and 100),
  gunluk_acma       integer not null default 150 check (gunluk_acma between 1 and 10000),
  azami_bayt        integer not null default 15728640 check (azami_bayt between 100000 and 52428800)
);
insert into pano.ayarlar default values on conflict do nothing;

create table if not exists pano.notlar (
  id            uuid primary key default gen_random_uuid(),
  yazar         uuid not null references public.profiller(id) on delete cascade,
  -- Üniversite, yazarın DOĞRULANMIŞ e-posta alanından gelir; elle yazılmaz.
  kurum_alani   text not null,
  bolum         text not null check (char_length(bolum) between 2 and 80),
  sinif         text not null check (sinif in ('hazirlik', '1', '2', '3', '4', '5', '6', 'yuksek_lisans', 'doktora')),
  ders_kodu     text check (ders_kodu ~ '^[A-Z0-9][A-Z0-9 .-]{1,19}$'),
  ders_adi      text not null check (char_length(ders_adi) between 2 and 100),
  yil           smallint not null check (yil between 2000 and 2100),
  yariyil       text not null check (yariyil in ('guz', 'bahar', 'yaz')),
  tur           text not null check (tur in ('ders_notu', 'cikmis_cozum', 'ozet')),
  hoca          text check (char_length(hoca) between 2 and 80),
  baslik        text not null check (char_length(baslik) between 3 and 120),
  aciklama      text check (char_length(aciklama) <= 500),
  dosya_yolu    text not null unique,
  dosya_turu    text not null check (dosya_turu in ('pdf', 'jpg', 'png', 'webp')),
  boyut         integer check (boyut > 0),
  -- İstemcinin hesapladığı SHA-256. Aynı dosyanın ikinci kez paylaşılmasını
  -- engeller (dürüst kopyayı yakalar; kötü niyetli tek bayt değişikliğini
  -- şikayet yakalar).
  dosya_ozet    text not null check (dosya_ozet ~ '^[0-9a-f]{64}$'),
  durum         text not null default 'yukleniyor'
                check (durum in ('yukleniyor', 'yayinda', 'gizli', 'kaldirildi')),
  sinav_oncesi  boolean not null default false,
  yararli       integer not null default 0 check (yararli >= 0),
  acilma        integer not null default 0 check (acilma >= 0),
  olusturuldu   timestamptz not null default now(),
  yayinlandi    timestamptz,
  onaylandi     timestamptz
);
create index if not exists notlar_liste_idx on pano.notlar (durum, kurum_alani, yayinlandi desc);
create index if not exists notlar_yazar_idx on pano.notlar (yazar, olusturuldu desc);
create unique index if not exists notlar_kopya_idx on pano.notlar (dosya_ozet) where durum in ('yayinda', 'gizli');

-- Notun yazarına şimdiye kadar verilen puan (hedefle farkı xp_esitle kapatır).
create table if not exists pano.not_xp (
  not_id   uuid primary key references pano.notlar(id) on delete cascade,
  yazar    uuid not null,
  verilen  integer not null default 0 check (verilen >= 0)
);

create table if not exists pano.oylar (
  not_id     uuid not null references pano.notlar(id) on delete cascade,
  kullanici  uuid not null references public.profiller(id) on delete cascade,
  zaman      timestamptz not null default now(),
  primary key (not_id, kullanici)
);

-- Açılış: günde kişi başı bir sayılır. Oy vermek için notu açmış olmak şart.
create table if not exists pano.acilislar (
  not_id     uuid not null references pano.notlar(id) on delete cascade,
  kullanici  uuid not null references public.profiller(id) on delete cascade,
  gun        date not null default (now() at time zone 'Europe/Istanbul')::date,
  primary key (not_id, kullanici, gun)
);
create index if not exists acilislar_kullanici_idx on pano.acilislar (kullanici, gun);

-- Şikayet: not ya da sohbet mesajı. Kişi aynı içeriği bir kez şikayet eder.
create table if not exists pano.sikayetler (
  id            bigint generated always as identity primary key,
  tur           text not null check (tur in ('not', 'mesaj')),
  hedef         text not null check (char_length(hedef) between 1 and 40),
  sikayet_eden  uuid not null references public.profiller(id) on delete cascade,
  neden         text not null check (neden in ('telif', 'uygunsuz', 'spam', 'yanlis', 'diger')),
  aciklama      text check (char_length(aciklama) <= 300),
  zaman         timestamptz not null default now(),
  durum         text not null default 'acik' check (durum in ('acik', 'kabul', 'red')),
  unique (tur, hedef, sikayet_eden)
);
create index if not exists sikayetler_acik_idx on pano.sikayetler (durum, tur, hedef);
create index if not exists sikayetler_eden_idx on pano.sikayetler (sikayet_eden, zaman desc);

-- Üniversitenin akademik takviminden vize / final / bütünleme haftaları.
create table if not exists pano.sinav_donemleri (
  id           bigint generated always as identity primary key,
  kurum_alani  text not null check (kurum_alani ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  ad           text not null check (char_length(ad) between 2 and 40),
  baslangic    date not null,
  bitis        date not null,
  check (bitis >= baslangic and bitis - baslangic <= 60)
);
create index if not exists sinav_donemleri_idx on pano.sinav_donemleri (kurum_alani, bitis);

-- Sponsorlu içerik: kademeye göre öne çıkar, organik içeriği itmez.
-- Hedefleme kişisel veriyle değil bağlamla: üniversite ve sınav dönemi.
create table if not exists pano.sponsorlu (
  id           uuid primary key default gen_random_uuid(),
  sponsor_id   uuid references odul.sponsorlar(id) on delete set null,
  kademe       text not null check (kademe in ('altin', 'gumus', 'bronz')),
  baslik       text not null check (char_length(baslik) between 2 and 80),
  metin        text check (char_length(metin) <= 200),
  baglanti     text check (baglanti is null or baglanti ~ '^https://[A-Za-z0-9.-]+(/[^<>"'' ]*)?$'),
  baglam       text not null default 'her_zaman' check (baglam in ('her_zaman', 'sinav_donemi')),
  hedef_kurum  text check (hedef_kurum ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  baslangic    timestamptz not null default now(),
  bitis        timestamptz not null,
  aktif        boolean not null default true,
  olusturan    uuid references public.profiller(id) on delete set null,
  olusturuldu  timestamptz not null default now(),
  check (bitis > baslangic)
);

-- Sponsor metriği: gösterim ve tıklama, kişi başı günde bir.
create table if not exists pano.sponsorlu_olaylari (
  sponsorlu_id  uuid not null references pano.sponsorlu(id) on delete cascade,
  kullanici     uuid not null,
  gun           date not null default (now() at time zone 'Europe/Istanbul')::date,
  tur           text not null check (tur in ('gosterim', 'tiklama')),
  primary key (sponsorlu_id, kullanici, gun, tur)
);

do $$
declare t text;
begin
  foreach t in array array['ayarlar', 'notlar', 'not_xp', 'oylar', 'acilislar', 'sikayetler',
                           'sinav_donemleri', 'sponsorlu', 'sponsorlu_olaylari'] loop
    execute format('alter table pano.%I enable row level security', t);
    execute format('revoke all on pano.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Puan defterine yeni kaynak: not.
alter table odul.puan_islemleri drop constraint if exists puan_islemleri_tur_check;
alter table odul.puan_islemleri add constraint puan_islemleri_tur_check
  check (tur in ('gorev', 'seri_bonusu', 'yonetici', 'not'));

-- Sohbet mesajı şikayetle gizlenebilir; yazarı ve yetkililer yine görür.
alter table public.mesajlar add column if not exists gizlendi boolean not null default false;
drop policy if exists mesaj_oku on public.mesajlar;
create policy mesaj_oku on public.mesajlar
  for select to authenticated
  using (not gizlendi or yazar = auth.uid() or public.yetkili_mi());


-- ═══════════════════════════════════════════════════════════════════
-- DOSYA DEPOSU (Supabase Storage)
-- ═══════════════════════════════════════════════════════════════════
-- Kova özel (public değil). Yol: <yazar>/<not_id>.<uzantı>.
--   yükle : yalnızca kendi "yükleniyor" notunun yoluna, bir saat içinde
--   oku   : yayındaki not + doğrulanmış kullanıcı; ya da yazarı; ya da yetkili
--   sil   : yalnızca kendi klasörü ve yalnızca yayında/incelemede OLMAYAN
--           notun dosyası (önce not kaldırılır). Aksi hâlde yazar onaylanmış
--           notun dosyasını silip yerine başka bir dosya koyabilirdi.
-- Güncelleme politikası yok: yüklenen dosyanın üzerine yazılamaz.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notlar', 'notlar', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Politikalar kullanıcının yetkisiyle çalışır; kapalı "pano" şemasına
-- erişemez. Bu yüzden karar fonksiyonları public'te ve SECURITY DEFINER.
create or replace function public.pano_dosya_yuklenebilir(p_ad text)
returns boolean language sql stable security definer
set search_path = pano
as $$
  select exists (select 1 from pano.notlar n
                 where n.dosya_yolu = p_ad and n.yazar = auth.uid() and n.durum = 'yukleniyor'
                   and n.olusturuldu > now() - interval '1 hour')
$$;

create or replace function public.pano_dosya_okunabilir(p_ad text)
returns boolean language sql stable security definer
set search_path = pano
as $$
  select exists (select 1 from pano.notlar n
                 where n.dosya_yolu = p_ad and (
                   (n.yazar = auth.uid() and n.durum <> 'kaldirildi')
                   or (n.durum = 'yayinda' and kimlik.dogrulanmis(auth.uid()))
                   or (n.durum <> 'yukleniyor' and public.yetkili_mi())))
$$;

create or replace function public.pano_dosya_silinebilir(p_ad text)
returns boolean language sql stable security definer
set search_path = pano
as $$
  select split_part(p_ad, '/', 1) = auth.uid()::text
     and not exists (select 1 from pano.notlar n where n.dosya_yolu = p_ad and n.durum in ('yayinda', 'gizli'))
$$;

drop policy if exists notlar_yukle on storage.objects;
create policy notlar_yukle on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notlar' and public.pano_dosya_yuklenebilir(name));

drop policy if exists notlar_oku on storage.objects;
create policy notlar_oku on storage.objects
  for select to authenticated
  using (bucket_id = 'notlar' and public.pano_dosya_okunabilir(name));

drop policy if exists notlar_sil on storage.objects;
create policy notlar_sil on storage.objects
  for delete to authenticated
  using (bucket_id = 'notlar' and public.pano_dosya_silinebilir(name));


-- ═══════════════════════════════════════════════════════════════════
-- YARDIMCILAR
-- ═══════════════════════════════════════════════════════════════════

create or replace function pano.bugun()
returns date language sql stable
as $$ select (now() at time zone 'Europe/Istanbul')::date $$;

create or replace function pano.hafta_basi()
returns timestamptz language sql stable
as $$ select date_trunc('week', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul' $$;

/** Kurumun şu anki ya da yaklaşan sınav dönemi (öncesi N gün dahil). */
create or replace function pano.sinav_durumu(p_kurum text)
returns jsonb language sql stable
set search_path = pano
as $$
  select jsonb_build_object(
    'id', s.id, 'ad', s.ad, 'baslangic', s.baslangic, 'bitis', s.bitis,
    'asama', case when pano.bugun() >= s.baslangic then 'suruyor' else 'yaklasiyor' end,
    'gun', greatest(0, s.baslangic - pano.bugun()))
  from pano.sinav_donemleri s
  where p_kurum is not null and s.kurum_alani = p_kurum
    and pano.bugun() between s.baslangic - (select sinav_oncesi_gun from pano.ayarlar) and s.bitis
  order by s.baslangic
  limit 1
$$;

/** LIKE deseni için güvenli kaçış. */
create or replace function pano.desen(p text)
returns text language sql immutable
as $$ select '%' || replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_') || '%' $$;

/** Bir notun listede görünen hâli (kim'e göre: kendi mi, oy vermiş mi). */
create or replace function pano.not_json(n pano.notlar, p_kim uuid)
returns jsonb language sql stable
set search_path = pano
as $$
  select jsonb_build_object(
    'id', n.id, 'baslik', n.baslik, 'aciklama', n.aciklama,
    'ders_kodu', n.ders_kodu, 'ders_adi', n.ders_adi, 'bolum', n.bolum, 'sinif', n.sinif,
    'kurum_alani', n.kurum_alani, 'universite', kimlik.universite_adi(n.kurum_alani),
    'yil', n.yil, 'yariyil', n.yariyil, 'tur', n.tur, 'hoca', n.hoca,
    'dosya_turu', n.dosya_turu, 'boyut', n.boyut,
    'yararli', n.yararli, 'acilma', n.acilma, 'yayinlandi', n.yayinlandi,
    -- Sıralamadaki gibi: kullanıcı adı; gizli profil adsız görünür.
    'yazar', case when coalesce((select h.gizli from odul.hesaplar h where h.kullanici = n.yazar), false) then null
                  else (select p.kullanici_adi from public.profiller p where p.id = n.yazar) end,
    'benim', n.yazar = p_kim,
    'oyum', exists (select 1 from pano.oylar o where o.not_id = n.id and o.kullanici = p_kim),
    'actim', exists (select 1 from pano.acilislar a where a.not_id = n.id and a.kullanici = p_kim))
$$;

/**
 * Notun yazarına verilmesi gereken puanı hesaplar ve defteri ona eşitler.
 * Tek puan yolu budur: onay, oy, oy geri alma, gizleme, kaldırma hep buradan.
 * Kilit sırası: not_xp satırı → yazarın hesabı (puan_ekle).
 */
create or replace function pano.xp_esitle(p_not uuid)
returns integer language plpgsql volatile
set search_path = pano, odul
as $$
declare
  n pano.notlar;
  a pano.ayarlar;
  v_verilen integer;
  v_hedef integer;
  v_fark integer;
  v_hafta integer;
  v_mevcut integer;
begin
  select * into n from pano.notlar where id = p_not;
  if not found then return 0; end if;
  select * into a from pano.ayarlar;
  insert into pano.not_xp (not_id, yazar) values (n.id, n.yazar) on conflict do nothing;
  select verilen into v_verilen from pano.not_xp where not_id = n.id for update;
  perform odul.hesap_kilitle(n.yazar);

  v_hedef := case when n.durum = 'yayinda' and n.onaylandi is not null
                  then least(a.not_tavan,
                             round(a.taban_xp * case when n.sinav_oncesi then a.sinav_carpani else 1 end)::integer
                             + a.oy_xp * n.yararli)
                  else 0 end;
  v_fark := v_hedef - v_verilen;
  if v_fark > 0 then
    -- Haftalık tavan: eksik kalan kısım sonraki haftalarda (yeni bir oy ya da
    -- onayla) tamamlanır; puan kaybolmaz, yayılır.
    -- Net: bu hafta verilen eksi geri alınan. Oy geri alınıp yeniden
    -- verildiğinde ara adım tavandan yemez.
    select greatest(0, coalesce(sum(miktar), 0)) into v_hafta from odul.puan_islemleri
    where kullanici = n.yazar and tur = 'not' and zaman >= pano.hafta_basi();
    v_fark := least(v_fark, greatest(0, a.haftalik_tavan - v_hafta));
  elsif v_fark < 0 then
    select xp into v_mevcut from odul.hesaplar where kullanici = n.yazar;
    v_fark := greatest(v_fark, -coalesce(v_mevcut, 0));
  end if;
  if v_fark <> 0 then
    perform odul.puan_ekle(n.yazar, v_fark, 'not',
      case when v_fark > 0 then 'Not: ' else 'Not puanı geri alındı: ' end || left(n.baslik, 120), null, null);
    update pano.not_xp set verilen = verilen + v_fark where not_id = n.id;
  end if;
  return v_fark;
end $$;

/** Bekleme süresi dolan, açık şikayeti olmayan notları onaylar (puan verir). */
create or replace function pano.onaylari_isle()
returns integer language plpgsql volatile
set search_path = pano
as $$
declare r record; adet integer := 0; saat integer := (select onay_saat from pano.ayarlar);
begin
  for r in
    select n.id from pano.notlar n
    where n.durum = 'yayinda' and n.onaylandi is null and n.yayinlandi <= now() - make_interval(hours => saat)
      and not exists (select 1 from pano.sikayetler s where s.tur = 'not' and s.hedef = n.id::text and s.durum = 'acik')
    order by n.yayinlandi
    limit 200
    for update skip locked
  loop
    update pano.notlar set onaylandi = now() where id = r.id;
    perform pano.xp_esitle(r.id);
    adet := adet + 1;
  end loop;
  return adet;
end $$;

/** Oturumdaki kişinin kurumu (doğrulanmışsa). */
create or replace function pano.kurumum(p_kim uuid)
returns text language sql stable
as $$
  select kurum_alani from kimlik.ogrenciler
  where kullanici = p_kim and dogrulandi is not null and gecerli_bitis > now()
$$;

create or replace function pano.giris_olmali()
returns uuid language plpgsql stable
as $$
declare kim uuid := auth.uid();
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  return kim;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- NOTLAR — üye API'si
-- ═══════════════════════════════════════════════════════════════════

/**
 * Not listesi + bağlam (sınav dönemi, sponsorlu kartlar, bölüm seçenekleri).
 *   p: { kurum: 'benim' | 'tum' | '<alan>', bolum, sinif, tur, ara,
 *        sira: 'yeni' | 'faydali', sayfa }
 */
create or replace function public.pano_notlar(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  benim text := pano.kurumum(kim);
  v_kurum text;
  v_bolum text := nullif(btrim(coalesce(p->>'bolum', '')), '');
  v_sinif text := nullif(p->>'sinif', '');
  v_tur text := nullif(p->>'tur', '');
  v_ara text := nullif(btrim(coalesce(p->>'ara', '')), '');
  v_sira text := coalesce(nullif(p->>'sira', ''), 'yeni');
  v_sayfa integer := greatest(0, least(coalesce((p->>'sayfa')::integer, 0), 200));
  v_sinav jsonb;
  v_liste jsonb;
  v_adet integer;
  v_sponsorlu jsonb := '[]'::jsonb;
begin
  perform pano.onaylari_isle();
  v_kurum := case coalesce(nullif(p->>'kurum', ''), 'benim')
               when 'benim' then benim
               when 'tum' then null
               else p->>'kurum' end;
  if v_sira not in ('yeni', 'faydali') then raise exception 'Geçersiz sıralama.' using errcode = '22023'; end if;
  if v_ara is not null and char_length(v_ara) > 60 then v_ara := left(v_ara, 60); end if;
  v_sinav := pano.sinav_durumu(benim);

  with secilen as (
    select n.id, n.yararli, n.yayinlandi from pano.notlar n
    where n.durum = 'yayinda'
      and (v_kurum is null or n.kurum_alani = v_kurum)
      and (v_bolum is null or n.bolum ilike pano.desen(v_bolum))
      and (v_sinif is null or n.sinif = v_sinif)
      and (v_tur is null or n.tur = v_tur)
      and (v_ara is null or n.baslik ilike pano.desen(v_ara) or n.ders_adi ilike pano.desen(v_ara)
           or coalesce(n.ders_kodu, '') ilike pano.desen(v_ara) or coalesce(n.hoca, '') ilike pano.desen(v_ara))
    order by case when v_sira = 'faydali' then n.yararli end desc nulls last, n.yayinlandi desc, n.id
    limit 31 offset v_sayfa * 30
  )
  select coalesce(jsonb_agg(pano.not_json(n, kim) order by x.sira_no) filter (where x.sira_no <= 30), '[]'),
         count(*)
  into v_liste, v_adet
  from (select s.id, row_number() over (order by case when v_sira = 'faydali' then s.yararli end desc nulls last,
                                                  s.yayinlandi desc, s.id) as sira_no
        from secilen s) x
  join pano.notlar n on n.id = x.id;

  -- Sponsorlu kartlar yalnızca ilk sayfada; kademe sırası, aynı kademede
  -- günlük dönüşüm (hep aynı sponsor en üstte kalmasın).
  if v_sayfa = 0 then
    with uygun as (
      select sp.*, o.ad as sponsor_ad, o.logo as sponsor_logo
      from pano.sponsorlu sp left join odul.sponsorlar o on o.id = sp.sponsor_id and o.aktif
      where sp.aktif and now() between sp.baslangic and sp.bitis
        and (sp.hedef_kurum is null or sp.hedef_kurum = benim)
        and (sp.baglam = 'her_zaman' or (sp.baglam = 'sinav_donemi' and v_sinav is not null))
      order by case sp.kademe when 'altin' then 0 when 'gumus' then 1 else 2 end,
               md5(sp.id::text || pano.bugun()::text)
      limit 6
    ), kayit as (
      insert into pano.sponsorlu_olaylari (sponsorlu_id, kullanici, tur)
      select id, kim, 'gosterim' from uygun
      on conflict do nothing
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id, 'kademe', u.kademe, 'baslik', u.baslik, 'metin', u.metin, 'baglanti', u.baglanti,
             'sponsor_id', case when u.sponsor_ad is not null then u.sponsor_id end,
             'sponsor', u.sponsor_ad, 'logo', u.sponsor_logo, 'baglam', u.baglam)
           order by case u.kademe when 'altin' then 0 when 'gumus' then 1 else 2 end,
                    md5(u.id::text || pano.bugun()::text)), '[]')
    into v_sponsorlu from uygun u;
  end if;

  return jsonb_build_object(
    'ben', kimlik.ozet_json(kim),
    'kurum', v_kurum,
    'kurum_adi', case when v_kurum is not null then kimlik.universite_adi(v_kurum) end,
    'sinav', v_sinav,
    'liste', v_liste,
    'daha', v_adet > 30,
    'sponsorlu', v_sponsorlu,
    -- Filtre çipleri: bu kurumda en çok not olan bölümler.
    'bolumler', (select coalesce(jsonb_agg(b.bolum order by b.n desc, b.bolum), '[]') from (
                   select bolum, count(*) as n from pano.notlar
                   where durum = 'yayinda' and (v_kurum is null or kurum_alani = v_kurum)
                   group by bolum order by count(*) desc limit 12) b),
    'ayar', (select jsonb_build_object('taban_xp', taban_xp, 'oy_xp', oy_xp, 'not_tavan', not_tavan,
               'haftalik_tavan', haftalik_tavan, 'sinav_carpani', sinav_carpani, 'onay_saat', onay_saat,
               'sinav_oncesi_gun', sinav_oncesi_gun, 'azami_bayt', azami_bayt) from pano.ayarlar));
end $$;

/**
 * Ana ekran için hafif özet: sınav dönemi ve bölümündeki not sayısı.
 * Liste yüklemez; yalnızca "şimdi notlara bakmalı mıyım?" sorusu.
 */
create or replace function public.pano_ozet()
returns jsonb language plpgsql stable security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  o kimlik.ogrenciler;
  v_kurum text := pano.kurumum(kim);
begin
  select * into o from kimlik.ogrenciler where kullanici = kim;
  return jsonb_build_object(
    'dogrulandi', v_kurum is not null,
    'sinav', pano.sinav_durumu(v_kurum),
    'bolum', o.bolum,
    'bolum_notlari', case when v_kurum is not null and o.bolum is not null then
        (select count(*) from pano.notlar n where n.durum = 'yayinda' and n.kurum_alani = v_kurum
           and lower(n.bolum) = lower(o.bolum)) end,
    'bu_hafta', (select count(*) from pano.notlar n where n.durum = 'yayinda'
                   and (v_kurum is null or n.kurum_alani = v_kurum) and n.yayinlandi >= pano.hafta_basi()));
end $$;

/** Kendi notların ve puan durumları. */
create or replace function public.pano_notlarim()
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  a pano.ayarlar;
begin
  perform pano.onaylari_isle();
  select * into a from pano.ayarlar;
  return jsonb_build_object(
    'liste', (select coalesce(jsonb_agg(pano.not_json(n, kim) || jsonb_build_object(
                'durum', n.durum, 'onaylandi', n.onaylandi, 'sinav_oncesi', n.sinav_oncesi,
                'onay_zamani', case when n.durum = 'yayinda' and n.onaylandi is null
                                    then n.yayinlandi + make_interval(hours => a.onay_saat) end,
                'xp', coalesce((select verilen from pano.not_xp x where x.not_id = n.id), 0),
                'sikayet', exists (select 1 from pano.sikayetler s where s.tur = 'not' and s.hedef = n.id::text and s.durum = 'acik'))
              order by n.olusturuldu desc), '[]')
              from pano.notlar n where n.yazar = kim and n.durum in ('yayinda', 'gizli')),
    'hafta', jsonb_build_object(
      'kazanilan', (select greatest(0, coalesce(sum(miktar), 0)) from odul.puan_islemleri
                    where kullanici = kim and tur = 'not' and zaman >= pano.hafta_basi()),
      'tavan', a.haftalik_tavan),
    'toplam', (select coalesce(sum(verilen), 0) from pano.not_xp where yazar = kim));
end $$;

/**
 * Paylaşım 1/2: künyeyi kaydeder, dosyanın yükleneceği yolu verir.
 *   tamam | dogrulama_gerekli | sinir | kopya
 */
create or replace function public.pano_not_hazirla(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  o kimlik.ogrenciler;
  a pano.ayarlar;
  v_id uuid := gen_random_uuid();
  v_bolum text;
  v_sinif text;
  v_turu text := lower(coalesce(p->>'dosya_turu', ''));
  v_kod text := nullif(upper(regexp_replace(btrim(coalesce(p->>'ders_kodu', '')), '\s+', ' ', 'g')), '');
  v_metin text;
  v_yol text;
begin
  select * into o from kimlik.ogrenciler where kullanici = kim;
  if o.dogrulandi is null or o.gecerli_bitis <= now() then
    return jsonb_build_object('durum', 'dogrulama_gerekli');
  end if;
  select * into a from pano.ayarlar;

  v_bolum := nullif(regexp_replace(btrim(coalesce(p->>'bolum', o.bolum, '')), '\s+', ' ', 'g'), '');
  v_sinif := coalesce(nullif(p->>'sinif', ''), o.sinif);
  if v_bolum is null or v_sinif is null then
    raise exception 'Bölüm ve sınıf gerekli.' using errcode = '22023';
  end if;
  if v_turu = 'jpeg' then v_turu := 'jpg'; end if;
  if v_turu not in ('pdf', 'jpg', 'png', 'webp') then
    raise exception 'Yalnızca PDF, JPG, PNG ya da WEBP.' using errcode = '22023';
  end if;
  if coalesce((p->>'boyut')::bigint, 0) not between 1 and a.azami_bayt then
    raise exception 'Dosya en fazla % MB olabilir.', a.azami_bayt / 1048576 using errcode = '22023';
  end if;
  -- Serbest metin alanlarında görünmez karakter yok (sahte ad, gizli metin).
  foreach v_metin in array array[p->>'baslik', p->>'ders_adi', p->>'hoca', p->>'aciklama', v_bolum, v_kod] loop
    if v_metin is not null and public.gorunmez_karakter_var(v_metin) then
      raise exception 'Metinde desteklenmeyen karakter var.' using errcode = '22023';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('pano_yukle:' || kim::text));
  if (select count(*) from pano.notlar where yazar = kim and durum <> 'yukleniyor'
        and olusturuldu > now() - interval '24 hours') >= a.gunluk_yukleme then
    return jsonb_build_object('durum', 'sinir', 'gunluk', a.gunluk_yukleme);
  end if;
  if exists (select 1 from pano.notlar where dosya_ozet = lower(p->>'dosya_ozet') and durum in ('yayinda', 'gizli')) then
    return jsonb_build_object('durum', 'kopya');
  end if;
  -- Yarıda kalmış eski yüklemeler temizlenir.
  delete from pano.notlar where yazar = kim and durum = 'yukleniyor' and olusturuldu < now() - interval '1 hour';

  v_yol := kim::text || '/' || v_id::text || '.' || v_turu;
  begin
    insert into pano.notlar (id, yazar, kurum_alani, bolum, sinif, ders_kodu, ders_adi, yil, yariyil, tur,
                             hoca, baslik, aciklama, dosya_yolu, dosya_turu, dosya_ozet)
    values (v_id, kim, o.kurum_alani, v_bolum, v_sinif, v_kod,
            btrim(p->>'ders_adi'), (p->>'yil')::smallint, p->>'yariyil', p->>'tur',
            nullif(btrim(coalesce(p->>'hoca', '')), ''), btrim(p->>'baslik'),
            nullif(btrim(coalesce(p->>'aciklama', '')), ''), v_yol, v_turu, lower(p->>'dosya_ozet'));
  exception when check_violation or not_null_violation or invalid_text_representation
                 or numeric_value_out_of_range then
    raise exception 'Künyede eksik ya da hatalı alan var.' using errcode = '22023';
  end;
  return jsonb_build_object('durum', 'tamam', 'id', v_id, 'yol', v_yol);
end $$;

/**
 * Paylaşım 2/2: dosya depoya ulaştıysa notu yayına alır. Boyut ve tür
 * istemcinin söylediğinden değil, deponun kaydından okunur.
 *   tamam | yok | dosya_yok | dosya_gecersiz | kopya
 */
create or replace function public.pano_not_yayinla(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  n pano.notlar;
  nesne record;
  v_mime text;
  v_boyut bigint;
  v_beklenen text;
begin
  select * into n from pano.notlar where id = p_id and yazar = kim for update;
  if not found or n.durum <> 'yukleniyor' then return jsonb_build_object('durum', 'yok'); end if;
  select metadata into nesne from storage.objects where bucket_id = 'notlar' and name = n.dosya_yolu;
  if not found then return jsonb_build_object('durum', 'dosya_yok'); end if;
  v_mime := nesne.metadata->>'mimetype';
  v_boyut := coalesce((nesne.metadata->>'size')::bigint, 0);
  v_beklenen := case n.dosya_turu when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg'
                                  when 'png' then 'image/png' else 'image/webp' end;
  if v_mime is distinct from v_beklenen or v_boyut not between 1 and (select azami_bayt from pano.ayarlar) then
    return jsonb_build_object('durum', 'dosya_gecersiz');
  end if;
  begin
    update pano.notlar set durum = 'yayinda', boyut = v_boyut, yayinlandi = now(),
      sinav_oncesi = pano.sinav_durumu(n.kurum_alani) is not null
    where id = p_id;
  exception when unique_violation then
    return jsonb_build_object('durum', 'kopya');
  end;
  return jsonb_build_object('durum', 'tamam', 'sinav_oncesi', pano.sinav_durumu(n.kurum_alani) is not null);
end $$;

/**
 * Notu aç: doğrulama şart (e-postası olmayan notu görür ama açamaz).
 * Dosyanın kendisini Storage verir; o da aynı kuralı ayrıca uygular.
 *   tamam | dogrulama_gerekli | yok | sinir
 */
create or replace function public.pano_not_ac(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  n pano.notlar;
  eklendi integer;
begin
  select * into n from pano.notlar where id = p_id;
  if not found or not (n.durum = 'yayinda' or (n.yazar = kim and n.durum = 'gizli')) then
    return jsonb_build_object('durum', 'yok');
  end if;
  if n.yazar <> kim and not kimlik.dogrulanmis(kim) then
    return jsonb_build_object('durum', 'dogrulama_gerekli');
  end if;
  if n.yazar <> kim then
    if (select count(*) from pano.acilislar where kullanici = kim and gun = pano.bugun())
       >= (select gunluk_acma from pano.ayarlar) then
      return jsonb_build_object('durum', 'sinir');
    end if;
    insert into pano.acilislar (not_id, kullanici) values (n.id, kim) on conflict do nothing;
    get diagnostics eklendi = row_count;
    if eklendi > 0 then update pano.notlar set acilma = acilma + 1 where id = n.id; end if;
  end if;
  return jsonb_build_object('durum', 'tamam', 'yol', n.dosya_yolu, 'dosya_turu', n.dosya_turu,
                            'ad', n.baslik);
end $$;

/**
 * "İşime yaradı" (ya da geri al). Yalnızca notu açmış, doğrulanmış,
 * yazar olmayan kişi. Yazarın puanı xp_esitle ile güncellenir.
 *   tamam | dogrulama_gerekli | once_ac | kendi | yok
 */
create or replace function public.pano_not_oy(p_id uuid, p_yararli boolean)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  n pano.notlar;
begin
  select * into n from pano.notlar where id = p_id for update;
  if not found or n.durum <> 'yayinda' then return jsonb_build_object('durum', 'yok'); end if;
  if n.yazar = kim then return jsonb_build_object('durum', 'kendi'); end if;
  if not kimlik.dogrulanmis(kim) then return jsonb_build_object('durum', 'dogrulama_gerekli'); end if;
  if not exists (select 1 from pano.acilislar where not_id = n.id and kullanici = kim) then
    return jsonb_build_object('durum', 'once_ac');
  end if;
  if p_yararli then
    insert into pano.oylar (not_id, kullanici) values (n.id, kim) on conflict do nothing;
  else
    delete from pano.oylar where not_id = n.id and kullanici = kim;
  end if;
  update pano.notlar set yararli = (select count(*) from pano.oylar where not_id = n.id) where id = n.id;
  perform pano.xp_esitle(n.id);
  return jsonb_build_object('durum', 'tamam',
    'yararli', (select yararli from pano.notlar where id = n.id),
    'oyum', exists (select 1 from pano.oylar where not_id = n.id and kullanici = kim));
end $$;

/** Notu kaldır: yazarı ya da yetkili. Puan geri alınır; yazar dosyayı siler. */
create or replace function public.pano_not_sil(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  n pano.notlar;
begin
  select * into n from pano.notlar where id = p_id for update;
  if not found or n.durum = 'kaldirildi' then return jsonb_build_object('durum', 'yok'); end if;
  if n.yazar <> kim and not public.yetkili_mi() then
    raise exception 'Bu not senin değil.' using errcode = '42501';
  end if;
  update pano.notlar set durum = 'kaldirildi' where id = p_id;
  perform pano.xp_esitle(p_id);
  update pano.sikayetler set durum = 'kabul' where tur = 'not' and hedef = p_id::text and durum = 'acik';
  if n.yazar <> kim then
    perform odul.denetle('not_kaldir', p_id::text, jsonb_build_object('baslik', n.baslik, 'yazar', n.yazar));
  end if;
  return jsonb_build_object('durum', 'tamam', 'yol', case when n.yazar = kim then n.dosya_yolu end);
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- ŞİKAYET VE MODERASYON
-- ═══════════════════════════════════════════════════════════════════

/**
 * Şikayet et. Eşik (varsayılan 3 farklı kişi) aşılınca içerik incelemeye
 * kadar gizlenir. Not için doğrulanmış kişilerin şikayeti sayılır (sahte
 * hesaplarla not düşürülemesin); yetkilinin şikayeti tek başına gizler.
 *   tamam | zaten | kendi | yok | sinir
 */
create or replace function public.pano_sikayet(p_tur text, p_hedef text, p_neden text, p_aciklama text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  kim uuid := pano.giris_olmali();
  v_yazar uuid;
  v_esik integer := (select sikayet_esigi from pano.ayarlar);
  v_sayi integer;
  v_aciklama text := nullif(btrim(coalesce(p_aciklama, '')), '');
  v_gizlendi boolean := false;
begin
  if p_tur not in ('not', 'mesaj') or p_neden not in ('telif', 'uygunsuz', 'spam', 'yanlis', 'diger') then
    raise exception 'Geçersiz şikayet.' using errcode = '22023';
  end if;
  if v_aciklama is not null and (char_length(v_aciklama) > 300 or public.gorunmez_karakter_var(v_aciklama)) then
    raise exception 'Açıklama en fazla 300 karakter.' using errcode = '22023';
  end if;
  if p_tur = 'not' then
    if p_hedef !~ '^[0-9a-f-]{36}$' then return jsonb_build_object('durum', 'yok'); end if;
    select yazar into v_yazar from pano.notlar where id = p_hedef::uuid and durum in ('yayinda', 'gizli');
  else
    if p_hedef !~ '^[0-9]{1,18}$' then return jsonb_build_object('durum', 'yok'); end if;
    select yazar into v_yazar from public.mesajlar where id = p_hedef::bigint;
  end if;
  if v_yazar is null then return jsonb_build_object('durum', 'yok'); end if;
  if v_yazar = kim then return jsonb_build_object('durum', 'kendi'); end if;
  if (select count(*) from pano.sikayetler where sikayet_eden = kim and zaman > now() - interval '24 hours') >= 20 then
    return jsonb_build_object('durum', 'sinir');
  end if;

  insert into pano.sikayetler (tur, hedef, sikayet_eden, neden, aciklama)
  values (p_tur, p_hedef, kim, p_neden, v_aciklama)
  on conflict do nothing;
  if not found then return jsonb_build_object('durum', 'zaten'); end if;

  select count(*) into v_sayi from pano.sikayetler s
  where s.tur = p_tur and s.hedef = p_hedef and s.durum = 'acik'
    and (p_tur = 'mesaj' or kimlik.dogrulanmis(s.sikayet_eden)
         or exists (select 1 from public.profiller pr where pr.id = s.sikayet_eden and pr.rol in ('yonetici', 'baskan')));
  if v_sayi >= v_esik or public.yetkili_mi() then
    if p_tur = 'not' then
      update pano.notlar set durum = 'gizli' where id = p_hedef::uuid and durum = 'yayinda';
      v_gizlendi := found;
      if v_gizlendi then perform pano.xp_esitle(p_hedef::uuid); end if;
    else
      update public.mesajlar set gizlendi = true where id = p_hedef::bigint and not gizlendi;
      v_gizlendi := found;
    end if;
  end if;
  return jsonb_build_object('durum', 'tamam', 'gizlendi', v_gizlendi);
end $$;

/** Şikayet nedenlerinin sayımı: {"telif": 2, "spam": 1}. */
create or replace function pano.sikayet_nedenleri(p_tur text, p_hedef text)
returns jsonb language sql stable
set search_path = pano
as $$
  select coalesce(jsonb_object_agg(neden, n), '{}') from (
    select neden, count(*) as n from pano.sikayetler
    where tur = p_tur and hedef = p_hedef and durum = 'acik' group by neden) x
$$;

/** Yetkili: açık şikayetler, içerik başına toplanmış. */
create or replace function public.pano_moderasyon()
returns jsonb language plpgsql stable security definer
set search_path = public, pano
as $$
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(x.v order by x.son desc), '[]') from (
    select max(s.zaman) as son, jsonb_build_object(
      'tur', s.tur, 'hedef', s.hedef, 'sayi', count(*), 'son', max(s.zaman),
      'nedenler', pano.sikayet_nedenleri(s.tur, s.hedef),
      'aciklamalar', coalesce(jsonb_agg(s.aciklama order by s.zaman desc) filter (where s.aciklama is not null), '[]'),
      'icerik', case s.tur
        when 'not' then (select jsonb_build_object('baslik', n.baslik, 'ders', n.ders_adi, 'bolum', n.bolum,
                          'universite', kimlik.universite_adi(n.kurum_alani), 'durum', n.durum, 'dosya_turu', n.dosya_turu,
                          'yol', n.dosya_yolu, 'yazar', (select kullanici_adi from public.profiller where id = n.yazar))
                         from pano.notlar n where n.id::text = s.hedef)
        else (select jsonb_build_object('metin', m.icerik, 'gizli', m.gizlendi, 'zaman', m.olusturuldu,
                'yazar', (select kullanici_adi from public.profiller where id = m.yazar))
              from public.mesajlar m where m.id::text = s.hedef) end) as v
    from pano.sikayetler s
    where s.durum = 'acik'
    group by s.tur, s.hedef) x);
end $$;


/** Yetkili kararı: "tut" (şikayetler reddedilir, içerik geri döner) ya da "kaldir". */
create or replace function public.pano_moderasyon_karar(p_tur text, p_hedef text, p_karar text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  if p_tur not in ('not', 'mesaj') or p_karar not in ('tut', 'kaldir') then
    raise exception 'Geçersiz karar.' using errcode = '22023';
  end if;
  update pano.sikayetler set durum = case when p_karar = 'tut' then 'red' else 'kabul' end
  where tur = p_tur and hedef = p_hedef and durum = 'acik';

  if p_tur = 'not' then
    if p_hedef !~ '^[0-9a-f-]{36}$' then raise exception 'Geçersiz hedef.' using errcode = '22023'; end if;
    update pano.notlar set durum = case when p_karar = 'tut' then 'yayinda' else 'kaldirildi' end
    where id = p_hedef::uuid and durum in ('yayinda', 'gizli');
    perform pano.xp_esitle(p_hedef::uuid);
  else
    if p_hedef !~ '^[0-9]{1,18}$' then raise exception 'Geçersiz hedef.' using errcode = '22023'; end if;
    if p_karar = 'tut' then
      update public.mesajlar set gizlendi = false where id = p_hedef::bigint;
    else
      delete from public.mesajlar where id = p_hedef::bigint;
    end if;
  end if;
  perform odul.denetle('moderasyon_' || p_karar, p_tur || ':' || p_hedef, '{}'::jsonb);
  return jsonb_build_object('durum', 'tamam');
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- SPONSORLU TIKLAMA
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.pano_sponsorlu_tikla(p_id uuid)
returns void language plpgsql volatile security definer
set search_path = public, pano
as $$
declare kim uuid := pano.giris_olmali();
begin
  insert into pano.sponsorlu_olaylari (sponsorlu_id, kullanici, tur)
  select id, kim, 'tiklama' from pano.sponsorlu where id = p_id
  on conflict do nothing;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- YÖNETİM
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.pano_yonetim()
returns jsonb language plpgsql stable security definer
set search_path = public, pano
as $$
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ayarlar', (select to_jsonb(a) from pano.ayarlar a),
    'sinav_donemleri', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'kurum_alani', s.kurum_alani, 'universite', kimlik.universite_adi(s.kurum_alani),
        'ad', s.ad, 'baslangic', s.baslangic, 'bitis', s.bitis) order by s.baslangic), '[]')
      from pano.sinav_donemleri s where s.bitis >= pano.bugun() - 30),
    'sponsorlu', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', sp.id, 'sponsor_id', sp.sponsor_id, 'sponsor', o.ad, 'kademe', sp.kademe, 'baslik', sp.baslik,
        'metin', sp.metin, 'baglanti', sp.baglanti, 'baglam', sp.baglam, 'hedef_kurum', sp.hedef_kurum,
        'baslangic', sp.baslangic, 'bitis', sp.bitis, 'aktif', sp.aktif,
        'gosterim', (select count(*) from pano.sponsorlu_olaylari e where e.sponsorlu_id = sp.id and e.tur = 'gosterim'),
        'tiklama', (select count(*) from pano.sponsorlu_olaylari e where e.sponsorlu_id = sp.id and e.tur = 'tiklama'))
        order by sp.aktif desc, sp.bitis desc), '[]')
      from pano.sponsorlu sp left join odul.sponsorlar o on o.id = sp.sponsor_id),
    'sponsorlar', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ad', ad) order by ad), '[]')
                   from odul.sponsorlar where aktif),
    'alanlar', public.kimlik_yonetim_alanlar(),
    'istatistik', jsonb_build_object(
      'not', (select count(*) from pano.notlar where durum = 'yayinda'),
      'bu_hafta', (select count(*) from pano.notlar where durum = 'yayinda' and yayinlandi >= pano.hafta_basi()),
      'dogrulanmis', (select count(*) from kimlik.ogrenciler where gecerli_bitis > now()),
      'acilma_hafta', (select count(*) from pano.acilislar where gun >= (pano.hafta_basi() at time zone 'Europe/Istanbul')::date),
      'acik_sikayet', (select count(distinct (tur, hedef)) from pano.sikayetler where durum = 'acik')));
end $$;

create or replace function public.pano_sinav_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare v_id bigint := nullif(p->>'id', '')::bigint;
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  begin
    if v_id is null then
      insert into pano.sinav_donemleri (kurum_alani, ad, baslangic, bitis)
      values (lower(btrim(p->>'kurum_alani')), btrim(p->>'ad'), (p->>'baslangic')::date, (p->>'bitis')::date)
      returning id into v_id;
    else
      update pano.sinav_donemleri set kurum_alani = lower(btrim(p->>'kurum_alani')), ad = btrim(p->>'ad'),
        baslangic = (p->>'baslangic')::date, bitis = (p->>'bitis')::date
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Dönem bilgisi hatalı (bitiş başlangıçtan önce olamaz, en fazla 60 gün).' using errcode = '22023';
  end;
  perform odul.denetle('sinav_donemi', v_id::text, p);
  return jsonb_build_object('durum', 'tamam', 'id', v_id);
end $$;

create or replace function public.pano_sinav_sil(p_id bigint)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  delete from pano.sinav_donemleri where id = p_id;
  perform odul.denetle('sinav_donemi_sil', p_id::text, '{}'::jsonb);
  return jsonb_build_object('durum', 'tamam');
end $$;

create or replace function public.pano_sponsorlu_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_metin text;
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  foreach v_metin in array array[p->>'baslik', p->>'metin'] loop
    if v_metin is not null and public.gorunmez_karakter_var(v_metin) then
      raise exception 'Metinde desteklenmeyen karakter var.' using errcode = '22023';
    end if;
  end loop;
  begin
    if v_id is null then
      insert into pano.sponsorlu (sponsor_id, kademe, baslik, metin, baglanti, baglam, hedef_kurum,
                                  baslangic, bitis, aktif, olusturan)
      values (nullif(p->>'sponsor_id', '')::uuid, p->>'kademe', btrim(p->>'baslik'),
              nullif(btrim(coalesce(p->>'metin', '')), ''), nullif(btrim(coalesce(p->>'baglanti', '')), ''),
              coalesce(nullif(p->>'baglam', ''), 'her_zaman'), nullif(lower(btrim(coalesce(p->>'hedef_kurum', ''))), ''),
              coalesce((p->>'baslangic')::timestamptz, now()), (p->>'bitis')::timestamptz,
              coalesce((p->>'aktif')::boolean, true), auth.uid())
      returning id into v_id;
    else
      update pano.sponsorlu set sponsor_id = nullif(p->>'sponsor_id', '')::uuid, kademe = p->>'kademe',
        baslik = btrim(p->>'baslik'), metin = nullif(btrim(coalesce(p->>'metin', '')), ''),
        baglanti = nullif(btrim(coalesce(p->>'baglanti', '')), ''),
        baglam = coalesce(nullif(p->>'baglam', ''), 'her_zaman'),
        hedef_kurum = nullif(lower(btrim(coalesce(p->>'hedef_kurum', ''))), ''),
        baslangic = coalesce((p->>'baslangic')::timestamptz, baslangic), bitis = (p->>'bitis')::timestamptz,
        aktif = coalesce((p->>'aktif')::boolean, aktif)
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation or invalid_datetime_format
                 or invalid_text_representation or foreign_key_violation then
    raise exception 'Sponsorlu ilan bilgisi hatalı (kademe, başlık, https bağlantı, bitiş tarihi).' using errcode = '22023';
  end;
  perform odul.denetle('sponsorlu_kaydet', v_id::text, p);
  return jsonb_build_object('durum', 'tamam', 'id', v_id);
end $$;

create or replace function public.pano_sponsorlu_sil(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
begin
  if not public.yetkili_mi() then raise exception 'Bu işlem yetkililere açık.' using errcode = '42501'; end if;
  delete from pano.sponsorlu where id = p_id;
  perform odul.denetle('sponsorlu_sil', p_id::text, '{}'::jsonb);
  return jsonb_build_object('durum', 'tamam');
end $$;

/** Puan ayarları: yalnızca başkan (ekonomiyi o belirler). */
create or replace function public.pano_ayarlar_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, pano
as $$
begin
  if not public.baskan_mi() then raise exception 'Bu işlem yalnızca başkana açık.' using errcode = '42501'; end if;
  begin
    update pano.ayarlar set
      taban_xp = coalesce((p->>'taban_xp')::integer, taban_xp),
      oy_xp = coalesce((p->>'oy_xp')::integer, oy_xp),
      not_tavan = coalesce((p->>'not_tavan')::integer, not_tavan),
      haftalik_tavan = coalesce((p->>'haftalik_tavan')::integer, haftalik_tavan),
      sinav_oncesi_gun = coalesce((p->>'sinav_oncesi_gun')::integer, sinav_oncesi_gun),
      sinav_carpani = coalesce((p->>'sinav_carpani')::numeric, sinav_carpani),
      onay_saat = coalesce((p->>'onay_saat')::integer, onay_saat),
      sikayet_esigi = coalesce((p->>'sikayet_esigi')::integer, sikayet_esigi),
      gunluk_yukleme = coalesce((p->>'gunluk_yukleme')::integer, gunluk_yukleme);
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Ayar aralık dışında.' using errcode = '22023';
  end;
  perform odul.denetle('pano_ayarlar', null, p);
  return (select to_jsonb(a) from pano.ayarlar a);
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- YETKİLER
-- ═══════════════════════════════════════════════════════════════════
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'pano\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.imza);
    execute format('grant execute on function %s to authenticated', f.imza);
  end loop;
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pano'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.imza);
  end loop;
end $$;
