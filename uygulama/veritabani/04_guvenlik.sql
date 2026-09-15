-- ═══════════════════════════════════════════════════════════════════
-- YAZVEB Topluluk — güvenlik sertleştirmesi
-- ═══════════════════════════════════════════════════════════════════
-- 01_sema.sql ve 02_yetkiler.sql'den SONRA çalıştırılır. Tekrar
-- çalıştırmak zararsızdır (her şey "if not exists" / "or replace").
--
-- Bu dosya dört açığı kapatır:
--
--   1. KİMLİK SIZINTISI   giris_epostasi(kullanici_adi) anonim çağrılabiliyor
--                         ve o hesabın e-postasını veriyordu. Artık e-posta
--                         yalnızca parola da DOĞRUYSA döner.
--
--   2. MALİYET SALDIRISI  Asistan (ücretli model) ve seslendirme sınırsızdı.
--                         Kayıt açık olduğu için "yalnızca üyeler" koruması
--                         da gerçekte kimseyi durdurmuyordu. Artık her
--                         kullanıcı için dakikalık/günlük kota ve TÜM
--                         topluluk için günlük bir üst bütçe var.
--
--   3. SOHBET SELİ        Mesaj yazma hızı sınırsızdı ve istemci mesajın
--                         zamanını kendisi belirleyebiliyordu (geleceğe
--                         tarihli mesaj sohbetin dibine çivilenirdi).
--
--   4. KİMLİĞE BÜRÜNME    Görünen ada yön değiştiren / görünmez karakterler
--                         konabiliyordu.
--
-- Supabase'de pgcrypto "extensions" şemasındadır; aşağıdaki fonksiyonlar
-- search_path'e onu da ekler.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;


-- ═══════════════════════════════════════════════════════════════════
-- 1. KOTA AYARLARI — tek merkez
-- ═══════════════════════════════════════════════════════════════════
-- Sınırlar kodda değil burada durur: değiştirmek için yeniden dağıtım
-- gerekmez, SQL editöründe tek UPDATE yeter.
--
--   dakika   bir kullanıcının 60 saniyede yapabileceği istek
--   gun      bir kullanıcının 24 saatte yapabileceği istek
--   genel    TÜM kullanıcıların 24 saatte toplam yapabileceği istek.
--            Sahte hesaplarla kişi başı kotayı katlayan saldırıya karşı
--            son sigorta: fatura bu sayının üstüne asla çıkamaz.
create table if not exists public.kota_ayarlari (
  tur     text primary key,
  dakika  integer not null check (dakika > 0),
  gun     integer not null check (gun > 0),
  genel   integer not null check (genel > 0)
);

insert into public.kota_ayarlari (tur, dakika, gun, genel) values
  ('asistan', 12, 150, 3000),
  ('ses',     20, 250, 5000)
on conflict (tur) do nothing;

create table if not exists public.kota_kayitlari (
  tur        text not null,
  kullanici  uuid not null,
  zaman      timestamptz not null default now()
);
create index if not exists kota_kayitlari_kullanici_idx
  on public.kota_kayitlari (tur, kullanici, zaman desc);
create index if not exists kota_kayitlari_zaman_idx
  on public.kota_kayitlari (tur, zaman desc);


-- ═══════════════════════════════════════════════════════════════════
-- 2. GÜVENLİK OLAY GÜNLÜĞÜ
-- ═══════════════════════════════════════════════════════════════════
-- Kota aşımı, başarısız giriş denemesi, kilitlenme. Parola, jeton veya
-- ham IP ASLA yazılmaz; IP yalnızca tuzlanmamış kısa bir özet olarak
-- tutulur (aynı kaynaktan tekrarı görmeye yeter, kişiyi göstermez).
create table if not exists public.guvenlik_olaylari (
  id         bigint generated always as identity primary key,
  zaman      timestamptz not null default now(),
  tur        text not null,
  kullanici  uuid,
  ayrinti    jsonb not null default '{}'::jsonb
);
create index if not exists guvenlik_olaylari_zaman_idx
  on public.guvenlik_olaylari (zaman desc);

create table if not exists public.giris_denemeleri (
  anahtar  text not null,            -- 'ad:<kullanici_adi>' veya 'ip:<özet>'
  zaman    timestamptz not null default now()
);
create index if not exists giris_denemeleri_idx
  on public.giris_denemeleri (anahtar, zaman desc);

-- Bu tablolara istemciden HİÇBİR yol yok. RLS açık, politika yok → ret.
-- Tek istisna: başkan olay günlüğünü okuyabilir.
alter table public.kota_ayarlari     enable row level security;
alter table public.kota_kayitlari    enable row level security;
alter table public.guvenlik_olaylari enable row level security;
alter table public.giris_denemeleri  enable row level security;

revoke all on public.kota_ayarlari, public.kota_kayitlari,
              public.guvenlik_olaylari, public.giris_denemeleri
  from anon, authenticated;

grant select on public.guvenlik_olaylari to authenticated;
drop policy if exists olay_oku on public.guvenlik_olaylari;
create policy olay_oku on public.guvenlik_olaylari
  for select to authenticated
  using (public.baskan_mi());


-- İstekteki gerçek istemci adresinin kısa özeti. Supabase'in önündeki
-- Cloudflare "cf-connecting-ip" başlığını kendisi yazar; istemci taklit
-- edemez. Başlık yoksa (yerel test) sabit bir değer döner.
create or replace function public.istek_ip_ozeti()
returns text
language sql
stable
set search_path = public, extensions
as $$
  select left(encode(extensions.digest(coalesce(
    nullif(current_setting('request.headers', true), '')::json->>'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::json->>'x-real-ip',
    'yerel'), 'sha256'), 'hex'), 16);
$$;
revoke all on function public.istek_ip_ozeti() from public;


-- Aynı olayı dakikada bir kereden fazla yazmaz: saldırı sırasında
-- günlüğün kendisi bir sel hâline gelip diski doldurmasın.
create or replace function public.olay_yaz(p_tur text, p_kullanici uuid, p_ayrinti jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.guvenlik_olaylari
    where tur = p_tur
      and kullanici is not distinct from p_kullanici
      and ayrinti = p_ayrinti
      and zaman > now() - interval '1 minute'
  ) then
    return;
  end if;
  insert into public.guvenlik_olaylari (tur, kullanici, ayrinti)
  values (p_tur, p_kullanici, p_ayrinti);
end $$;
revoke all on function public.olay_yaz(text, uuid, jsonb) from public;


-- ═══════════════════════════════════════════════════════════════════
-- 3. KOTA HARCA — asistan ve seslendirme her istekte bunu çağırır
-- ═══════════════════════════════════════════════════════════════════
-- Dönüş: 'tamam' | 'sinir' | 'kimliksiz' | 'bilinmeyen'
--
-- Çağrı KULLANICININ jetonuyla yapılır. PostgREST jetonun imzasını kendisi
-- doğruladığı için auth.uid() taklit edilemez; aynı çağrı hem kimlik
-- doğrulaması hem kota kontrolüdür. Herkese açık "publishable" anahtarla
-- gelen istekte auth.uid() boştur → 'kimliksiz'.
--
-- Eşzamanlı iki istek aynı anda sayıp ikisi birden sınırı aşmasın diye
-- kullanıcı başına kısa bir kilit alınır.
create or replace function public.kota_harca(p_tur text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  kim    uuid := auth.uid();
  ayar   public.kota_ayarlari;
  sayi   integer;
begin
  if kim is null then
    return 'kimliksiz';
  end if;

  select * into ayar from public.kota_ayarlari where tur = p_tur;
  if not found then
    return 'bilinmeyen';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_tur || ':' || kim::text));

  select count(*) into sayi from public.kota_kayitlari
  where tur = p_tur and kullanici = kim and zaman > now() - interval '60 seconds';
  if sayi >= ayar.dakika then
    perform public.olay_yaz('kota_asimi', kim, jsonb_build_object('tur', p_tur, 'pencere', 'dakika'));
    return 'sinir';
  end if;

  select count(*) into sayi from public.kota_kayitlari
  where tur = p_tur and kullanici = kim and zaman > now() - interval '24 hours';
  if sayi >= ayar.gun then
    perform public.olay_yaz('kota_asimi', kim, jsonb_build_object('tur', p_tur, 'pencere', 'gun'));
    return 'sinir';
  end if;

  select count(*) into sayi from public.kota_kayitlari
  where tur = p_tur and zaman > now() - interval '24 hours';
  if sayi >= ayar.genel then
    perform public.olay_yaz('genel_butce_asimi', null, jsonb_build_object('tur', p_tur));
    return 'sinir';
  end if;

  insert into public.kota_kayitlari (tur, kullanici) values (p_tur, kim);

  -- Ara sıra eski kayıtları temizle; ayrı bir zamanlayıcı gerekmesin.
  if random() < 0.02 then
    delete from public.kota_kayitlari where zaman < now() - interval '48 hours';
    delete from public.giris_denemeleri where zaman < now() - interval '24 hours';
    delete from public.guvenlik_olaylari where zaman < now() - interval '30 days';
  end if;

  return 'tamam';
end $$;

revoke all on function public.kota_harca(text) from public;
grant execute on function public.kota_harca(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 4. KULLANICI ADIYLA GİRİŞ — e-posta sızdırmadan
-- ═══════════════════════════════════════════════════════════════════
-- Eski fonksiyon kullanıcı adı doğruysa e-postayı veriyordu: kullanıcı adı
-- tahmin eden herkes üyelerin e-posta adreslerini toplayabiliyordu, ayrıca
-- "bu kullanıcı adı yok" cevabı hangi adların var olduğunu ele veriyordu.
--
-- Yeni fonksiyon e-postayı YALNIZCA parola da doğruysa döndürür. Parolayı
-- bilen kişi zaten giriş yapabilir; ona e-postayı söylemek yeni bir kapı
-- açmaz. Asıl giriş yine Supabase Auth'ta, kullanıcının kendi IP'siyle
-- yapılır (onun deneme sınırları da aynen işler).
--
-- DOĞRULAMA: Supabase parolaları bcrypt ile saklar; pgcrypto'nun crypt()
-- fonksiyonu aynı özeti üretir.
--
-- ZAMANLAMA: Kullanıcı yoksa da aynı maliyette bir bcrypt yapılır. Aksi
-- hâlde "yok" cevabı "yanlış parola"dan ~100 ms hızlı döner ve kullanıcı
-- adının varlığı süreden okunur.
--
-- KABA KUVVET: kullanıcı adı başına 15 dakikada 8 başarısız deneme; kaynak
-- IP başına 5 dakikada 30 deneme. Sınırda bcrypt hiç çalıştırılmaz —
-- saldırgan veritabanının işlemcisini de yakamaz.
drop function if exists public.giris_epostasi(text);

create or replace function public.giris_epostasi(p_kullanici_adi text, p_parola text)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  ad       text := lower(trim(coalesce(p_kullanici_adi, '')));
  ip       text := public.istek_ip_ozeti();
  eposta   text;
  ozet     text;
  hatali   integer;
  denemeler integer;
  -- Var olmayan kullanıcı için sabit bir bcrypt özeti (maliyet 10, rastgele
  -- bir metnin özeti; hiçbir parola bununla eşleşmez).
  sahte constant text := '$2a$10$Vq3ZPpF5f1cY0T4Qv9nH6uQe7yH0f1cY0T4Qv9nH6uQe7yH0f1cYa';
begin
  if ad !~ '^[a-z0-9_]{3,20}$' or p_parola is null
     or char_length(p_parola) not between 1 and 128 then
    return null;
  end if;

  select count(*) into denemeler from public.giris_denemeleri
  where anahtar = 'ip:' || ip and zaman > now() - interval '5 minutes';
  select count(*) into hatali from public.giris_denemeleri
  where anahtar = 'ad:' || ad and zaman > now() - interval '15 minutes';

  if denemeler >= 30 or hatali >= 8 then
    perform public.olay_yaz('giris_kilidi', null,
      jsonb_build_object('ip', ip, 'neden', case when hatali >= 8 then 'kullanici' else 'ip' end));
    return null;
  end if;

  insert into public.giris_denemeleri (anahtar) values ('ip:' || ip);

  select u.email, u.encrypted_password into eposta, ozet
  from public.profiller p
  join auth.users u on u.id = p.id
  where p.kullanici_adi = ad
  limit 1;

  if ozet is not null and extensions.crypt(p_parola, ozet) = ozet then
    return eposta;
  end if;

  if ozet is null then
    perform extensions.crypt(p_parola, sahte);     -- zamanlamayı eşitle
  end if;

  insert into public.giris_denemeleri (anahtar) values ('ad:' || ad);
  perform public.olay_yaz('giris_basarisiz', null, jsonb_build_object('ip', ip));
  return null;
end $$;

revoke all on function public.giris_epostasi(text, text) from public;
grant execute on function public.giris_epostasi(text, text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 5. SOHBET: hız sınırı ve sunucu saati
-- ═══════════════════════════════════════════════════════════════════
create index if not exists mesajlar_yazar_zaman_idx
  on public.mesajlar (yazar, olusturuldu desc);

create or replace function public.mesaj_yazari_ayarla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  son10  integer;
  son60  integer;
begin
  new.yazar := coalesce(auth.uid(), new.yazar);
  -- Zamanı sunucu belirler. İstemci geleceğe tarihli bir mesajla sohbetin
  -- dibine çivilenemez, geçmişe tarihliyle eski mesajların arasına gizlenemez.
  new.olusturuldu := now();

  if auth.uid() is not null then
    select count(*) filter (where olusturuldu > now() - interval '10 seconds'),
           count(*)
      into son10, son60
    from public.mesajlar
    where yazar = new.yazar and olusturuldu > now() - interval '60 seconds';

    if son10 >= 5 or son60 >= 20 then
      perform public.olay_yaz('sohbet_seli', new.yazar, '{}'::jsonb);
      raise exception 'Çok hızlı mesaj gönderiyorsun. Biraz bekle.'
        using errcode = 'P0429';
    end if;
  end if;
  return new;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- 6. ETKİNLİK: zaman damgalarını sunucu belirler
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.etkinlik_kilidi_ayarla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ekleyen       := coalesce(auth.uid(), new.ekleyen);
    new.baskan_kilidi := public.baskan_mi();
    new.olusturuldu   := now();
    new.guncellendi   := now();
  else
    new.guncellendi   := now();
    new.olusturuldu   := old.olusturuldu;
    new.ekleyen       := old.ekleyen;
    new.baskan_kilidi := case when public.baskan_mi() then true
                              else old.baskan_kilidi end;
  end if;
  return new;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- 7. GÖRÜNEN AD: görünmez ve yön değiştiren karakter yok
-- ═══════════════════════════════════════════════════════════════════
-- U+202E gibi karakterler metnin ekranda başka türlü görünmesini sağlar;
-- sıfır genişlikli boşluklar iki adı gözle ayırt edilemez yapar. Başkanın
-- adını taklit etmenin en ucuz yolu bunlardı.
create or replace function public.gorunmez_karakter_var(metin text)
returns boolean
language sql
immutable
as $$
  select metin ~ '[\u0001-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]';
$$;

-- Mevcut kayıtlarda böyle bir karakter varsa temizlenir; yoksa kısıt
-- eklenemezdi.
update public.profiller
set ad_soyad = nullif(trim(regexp_replace(ad_soyad,
  '[\u0001-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]', '', 'g')), '')
where ad_soyad is not null and public.gorunmez_karakter_var(ad_soyad);

alter table public.profiller drop constraint if exists ad_soyad_temiz;
alter table public.profiller add constraint ad_soyad_temiz
  check (ad_soyad is null or not public.gorunmez_karakter_var(ad_soyad));

-- Kayıt sırasında metadata'dan gelen ad da aynı temizlikten geçer ve
-- 60 karakterle kırpılır; aksi hâlde kısıt kaydı tümden düşürürdü.
create or replace function public.yeni_kullanici_profili()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ad    text;
  gorunen text;
begin
  ad := lower(coalesce(
          new.raw_user_meta_data->>'kullanici_adi',
          split_part(new.email, '@', 1)));
  ad := regexp_replace(ad, '[^a-z0-9_]', '', 'g');
  if char_length(ad) < 3 then
    ad := 'uye' || substr(new.id::text, 1, 6);
  end if;
  ad := left(ad, 16);
  if exists (select 1 from public.profiller where kullanici_adi = ad) then
    ad := ad || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;

  gorunen := new.raw_user_meta_data->>'ad_soyad';
  if gorunen is not null then
    gorunen := nullif(left(trim(regexp_replace(gorunen,
      '[\u0001-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]', '', 'g')), 60), '');
  end if;

  insert into public.profiller (id, kullanici_adi, ad_soyad)
  values (new.id, ad, gorunen);
  return new;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- 8. Kurulum sayacı artık yalnızca giriş yapmış üyelere
-- ═══════════════════════════════════════════════════════════════════
-- Üye sayısı tek başına gizli değil ama anonim ziyaretçiye söylenmesinin
-- bir faydası da yok.
-- 03_kurulum.sql hiç çalıştırılmadıysa fonksiyon yoktur; betik düşmesin.
do $$ begin
  if to_regprocedure('public.kurulum_durumu()') is not null then
    revoke execute on function public.kurulum_durumu() from public, anon;
    grant execute on function public.kurulum_durumu() to authenticated;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- 9. Varsayılan ayrıcalıkları daralt
-- ═══════════════════════════════════════════════════════════════════
-- Supabase public şemasındaki yeni tablolara anon rolüne de tam yetki
-- verir; RLS olmasa her tablo dünyaya açık olurdu. Uygulamanın hiçbir
-- tablosu anonim erişim gerektirmiyor.
revoke all on public.profiller, public.mesajlar, public.etkinlikler from anon;

-- Yardımcı fonksiyonlar anonim çağrıya kapalı.
revoke execute on function public.benim_rolum() from public, anon;
revoke execute on function public.baskan_mi()   from public, anon;
revoke execute on function public.yetkili_mi()  from public, anon;
grant execute on function public.benim_rolum(), public.baskan_mi(), public.yetkili_mi()
  to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 10. Fonksiyon yetkileri — Supabase varsayılanlarını açıkça geri al
-- ═══════════════════════════════════════════════════════════════════
-- Supabase public şemasındaki her yeni fonksiyona anon ve authenticated
-- rollerine AÇIK çalıştırma yetkisi verir; yukarıdaki "revoke ... from
-- public" satırları bunu kaldırmaz. Canlı denetimde görüldü: anonim biri
-- olay_yaz'ı çağırıp güvenlik günlüğüne sınırsız satır yazabiliyordu.
--
-- İstisna: gorunmez_karakter_var bir CHECK kısıtında kullanılır ve kısıt
-- güncellemeyi yapan kullanıcının yetkisiyle çalışır. Giriş yapmış
-- kullanıcıdan alınırsa kimse profilini güncelleyemez; yalnızca anonimden
-- alınır (salt okunur, yan etkisiz bir fonksiyon).
revoke execute on function public.olay_yaz(text, uuid, jsonb) from anon, authenticated;
revoke execute on function public.istek_ip_ozeti()            from anon, authenticated;
revoke execute on function public.kota_harca(text)            from anon;
revoke execute on function public.gorunmez_karakter_var(text) from anon;

-- Tetikleyici fonksiyonları doğrudan çağrılamaz ama yetki listesinde de
-- durmasınlar (derinlemesine savunma).
revoke execute on function public.yeni_kullanici_profili() from public, anon, authenticated;
revoke execute on function public.rol_degisimi_denetle()   from public, anon, authenticated;
revoke execute on function public.etkinlik_kilidi_ayarla() from public, anon, authenticated;
revoke execute on function public.mesaj_yazari_ayarla()    from public, anon, authenticated;
