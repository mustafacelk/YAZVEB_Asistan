-- ═══════════════════════════════════════════════════════════════════
-- YAZVEB Topluluk — veritabanı şeması
-- ═══════════════════════════════════════════════════════════════════
--
-- Supabase (PostgreSQL) üzerinde çalışır.
--
-- TEMEL GÜVENLİK KARARI
-- ─────────────────────
-- Yetki denetimi UYGULAMADA DEĞİL, VERİTABANINDA yapılır (Row Level Security).
-- Sebebi basit: mobil uygulama kullanıcının cihazında çalışır ve orada çalışan
-- hiçbir kontrole güvenilemez. Kurcalanmış bir istemci "ben başkanım" diyen
-- istekler gönderebilir; bu istekler yine de veritabanı tarafından reddedilir.
-- Uygulamadaki kontroller yalnızca ARAYÜZ içindir (düğmeyi gizlemek gibi).
--
-- ROL HİYERARŞİSİ
-- ───────────────
--   baskan    → her şeyde tam yetki. Rolleri o dağıtır.
--   yonetici  → etkinlik ekler ve siler; AMA başkanın dokunduğu etkinliğe
--               dokunamaz (baskan_kilidi).
--   uye       → okur, sohbete yazar, kendi mesajını siler.
-- ═══════════════════════════════════════════════════════════════════

-- ── Roller ─────────────────────────────────────────────────────────
do $$ begin
  create type rol_turu as enum ('uye', 'yonetici', 'baskan');
exception
  when duplicate_object then null;
end $$;


-- ── Profiller ──────────────────────────────────────────────────────
-- auth.users Supabase'in kendi tablosu; parolalar orada tutulur ve bize
-- hiç görünmez. Burada yalnızca görünen kimlik ve rol var.
create table if not exists public.profiller (
  id            uuid primary key references auth.users(id) on delete cascade,
  kullanici_adi text not null unique
                check (kullanici_adi ~ '^[a-z0-9_]{3,20}$'),
  ad_soyad      text check (char_length(ad_soyad) <= 60),
  rol           rol_turu not null default 'uye',
  olusturuldu   timestamptz not null default now()
);

comment on column public.profiller.rol is
  'Kullanıcı KENDİ rolünü değiştiremez; bkz. rol_degisimi_denetle tetikleyicisi.';


-- ── Sohbet ─────────────────────────────────────────────────────────
create table if not exists public.mesajlar (
  id          bigint generated always as identity primary key,
  yazar       uuid not null references public.profiller(id) on delete cascade,
  icerik      text not null check (char_length(icerik) between 1 and 2000),
  olusturuldu timestamptz not null default now()
);

-- Sohbet her zaman "son mesajlar" diye okunur; indeks o sorguya göre.
create index if not exists mesajlar_zaman_idx
  on public.mesajlar (olusturuldu desc);


-- ── Etkinlikler ────────────────────────────────────────────────────
create table if not exists public.etkinlikler (
  id            bigint generated always as identity primary key,
  baslik        text not null check (char_length(baslik) between 2 and 120),
  aciklama      text check (char_length(aciklama) <= 2000),
  yer           text check (char_length(yer) <= 120),
  baslangic     timestamptz not null,
  bitis         timestamptz,
  ekleyen       uuid not null references public.profiller(id),
  -- Başkanın oluşturduğu veya düzenlediği kayıt kilitlenir: yöneticiler
  -- bu kaydı değiştiremez, silemez. Tetikleyici tarafından yönetilir;
  -- istemci bu alana yazamaz (bkz. etkinlik_kilidi_ayarla).
  baskan_kilidi boolean not null default false,
  olusturuldu   timestamptz not null default now(),
  guncellendi   timestamptz not null default now()
);

create index if not exists etkinlikler_baslangic_idx
  on public.etkinlikler (baslangic desc);


-- ═══════════════════════════════════════════════════════════════════
-- YARDIMCI FONKSİYONLAR
-- ═══════════════════════════════════════════════════════════════════

-- İsteği yapan kullanıcının rolü. SECURITY DEFINER: politika içinden
-- profiller tablosunu okurken kendi politikasına takılmasın diye.
create or replace function public.benim_rolum()
returns rol_turu
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.profiller where id = auth.uid();
$$;

create or replace function public.baskan_mi()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.benim_rolum() = 'baskan', false);
$$;

create or replace function public.yetkili_mi()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.benim_rolum() in ('yonetici', 'baskan'), false);
$$;


-- ═══════════════════════════════════════════════════════════════════
-- TETİKLEYİCİLER
-- ═══════════════════════════════════════════════════════════════════

-- Yeni kayıt olan herkese otomatik profil. Kullanıcı adı kayıt sırasında
-- metadata ile gelir; gelmezse e-postanın baştaki kısmından türetilir.
create or replace function public.yeni_kullanici_profili()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ad text;
begin
  ad := lower(coalesce(
          new.raw_user_meta_data->>'kullanici_adi',
          split_part(new.email, '@', 1)));
  ad := regexp_replace(ad, '[^a-z0-9_]', '', 'g');
  if char_length(ad) < 3 then
    ad := 'uye' || substr(new.id::text, 1, 6);
  end if;
  -- Çakışma olursa sonuna kısa bir ek gelir; kayıt bu yüzden başarısız olmasın.
  if exists (select 1 from public.profiller where kullanici_adi = ad) then
    ad := ad || substr(new.id::text, 1, 4);
  end if;

  insert into public.profiller (id, kullanici_adi, ad_soyad)
  values (new.id, left(ad, 20), new.raw_user_meta_data->>'ad_soyad');
  return new;
end $$;

drop trigger if exists yeni_kullanici on auth.users;
create trigger yeni_kullanici
  after insert on auth.users
  for each row execute function public.yeni_kullanici_profili();


-- Rol yalnızca başkan tarafından değiştirilebilir; kimse kendi rolünü
-- yükseltemez. Politika tek başına yetmez: başkan kendi profilini güncellerken
-- politikadan geçer, o yüzden alan bazında denetim burada.
create or replace function public.rol_degisimi_denetle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() boşsa istek bir kullanıcıdan gelmiyordur: SQL editörü, servis
  -- anahtarı veya kurulum betiği. İLK BAŞKAN böyle atanır — aksi hâlde
  -- topluluğun hiç başkanı olamazdı, çünkü rol vermek için başkan gerekiyor.
  -- Web istemcisi bu duruma düşemez: profil güncelleme politikası zaten
  -- yalnızca "authenticated" rolüne açık.
  if auth.uid() is null then
    return new;
  end if;

  if new.rol is distinct from old.rol then
    if not public.baskan_mi() then
      raise exception 'Rol değiştirme yetkisi yalnızca başkanda.';
    end if;
    if old.id = auth.uid() then
      raise exception 'Başkan kendi rolünü değiştiremez.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists rol_denetimi on public.profiller;
create trigger rol_denetimi
  before update on public.profiller
  for each row execute function public.rol_degisimi_denetle();


-- Etkinlik kilidi tamamen sunucu tarafında belirlenir. İstemci ne gönderirse
-- göndersin dikkate alınmaz: başkan dokunduysa kilitli, dokunmadıysa değil.
create or replace function public.etkinlik_kilidi_ayarla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Sunucu tarafında (kurulum betiği) auth.uid() boştur; o zaman satırda
    -- verilen sahip korunur.
    new.ekleyen       := coalesce(auth.uid(), new.ekleyen);
    new.baskan_kilidi := public.baskan_mi();
  else
    new.guncellendi := now();
    new.ekleyen     := old.ekleyen;            -- sahip değiştirilemez
    -- Başkan düzenlerse kilitlenir. Yönetici düzenlerse kilit OLDUĞU GİBİ
    -- kalır; yönetici bir kilidi kaldırıp kaydı ele geçiremesin.
    new.baskan_kilidi := case when public.baskan_mi() then true
                              else old.baskan_kilidi end;
  end if;
  return new;
end $$;

drop trigger if exists etkinlik_kilidi on public.etkinlikler;
create trigger etkinlik_kilidi
  before insert or update on public.etkinlikler
  for each row execute function public.etkinlik_kilidi_ayarla();


-- Mesajın yazarı her zaman isteği yapan kullanıcıdır; başkasının adına
-- mesaj yazılamaz.
create or replace function public.mesaj_yazari_ayarla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.yazar := coalesce(auth.uid(), new.yazar);
  return new;
end $$;

drop trigger if exists mesaj_yazari on public.mesajlar;
create trigger mesaj_yazari
  before insert on public.mesajlar
  for each row execute function public.mesaj_yazari_ayarla();


-- ── Kullanıcı adıyla giriş ─────────────────────────────────────────
-- DİKKAT: Bu tek parametreli sürüm e-posta SIZDIRIR; 04_guvenlik.sql onu
-- silip parola doğrulamalı sürümle değiştirir. Kurulumda 04 her zaman çalıştırılır.
-- Supabase parola girişini e-posta üzerinden yapar. Kullanıcılar ise
-- kendi kullanıcı adlarını hatırlıyor. Bu fonksiyon aradaki çeviriyi yapar.
--
-- TAKAS: kullanıcı adı doğruysa o hesabın e-postası dönüyor. Kullanıcı adları
-- zaten sohbette herkese görünür ve e-posta tek başına hiçbir kapı açmaz —
-- giriş yine parolaya bağlı. Buna karşılık üyeler e-postalarını hatırlamak
-- zorunda kalmıyor. Kapalı bir topluluk uygulaması için makul bir denge.
create or replace function public.giris_epostasi(p_kullanici_adi text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.profiller p
  join auth.users u on u.id = p.id
  where p.kullanici_adi = lower(trim(p_kullanici_adi))
  limit 1;
$$;

revoke all on function public.giris_epostasi(text) from public;
grant execute on function public.giris_epostasi(text) to anon, authenticated;
