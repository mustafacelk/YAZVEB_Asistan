-- ═══════════════════════════════════════════════════════════════════
-- EKİP — kadro, ortak pano ve gönüllü havuzu
-- ═══════════════════════════════════════════════════════════════════
-- 09_pano.sql'den SONRA çalıştırılır (sınav dönemlerini oradan okur).
-- Tekrar çalıştırmak zararsızdır.
--
-- "YAZVEB Yeni Yönetim Yapısı 2026–2027" belgesinin uygulamadaki karşılığı:
--
--   KADRO        24 kişilik görevli kadro: kim hangi rolde, hangi ekipte,
--                deneme sürecinde mi. 17 rol, 6 ekip (çekirdek + 5 çalışma
--                grubu) aşağıda sabit liste.
--   PANO         "İş panoya girince verilmiş sayılır." Her satır bir iş:
--                iş, sahibi (TEK kişi), ekip, teslim tarihi, durum, not.
--                Yalnızca kadro görür.
--   GÖNÜLLÜ      Ekip liderlerinin yazdığı 1–3 saatlik, tek seferlik açık
--   HAVUZU       işler. İsteyen her üye üstlenir; başvuru ve taahhüt yok.
--
-- YETKİ (belgedeki "kim neye karar verir" tablosu)
-- ───────────────────────────────────────────────
--   Başkan, Başkan Yardımcısı (Operasyon)   her şey: kadro, bütün ekiplerin işleri
--   Ekip lideri (Dış İlişkiler'de BY)        kendi ekibinin işleri ve açık işleri
--   Kadrodaki diğerleri                      panoyu görür; kendi işinin durumunu
--                                            değiştirir, teslimden önce erteler
--   Üye                                      açık işleri görür ve üstlenir
-- Uygulamadaki "yönetici" rolü (QR görevleri, sponsorlar) bu yetkiyi VERMEZ:
-- kadro ayrı bir yapıdır. Uygulamada başkan olan, kadroda da başkandır.
--
-- KURALLAR (belgeden, aynen)
-- ─────────────────────────
--   • Sınav haftasına yeni teslim konmaz; sınav haftasında havuza iş yazılmaz.
--   • Haber verip yeni tarih alan teslimi kaçırmış sayılmaz (ertele).
--     Haber vermeden kaçan teslim "kaçtı" olarak kayda geçer; üçüncüsünde
--     başkan ve ekip lideriyle görüşme (otomatik rol devri YOK).
--   • Gönüllüde kaçan teslim kaydı tutulmaz.
--   • Sponsor ya da konuşmacıyla temas açık iş olarak verilmez.
--   • Tamamlanan açık iş adıyla anılır (ve ölçülü XP kazandırır).
-- ═══════════════════════════════════════════════════════════════════

create schema if not exists ekip;
revoke all on schema ekip from public, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- TABLOLAR
-- ═══════════════════════════════════════════════════════════════════

create table if not exists ekip.ayarlar (
  id                  boolean primary key default true check (id),
  -- Sınav haftaları bu üniversitenin takviminden okunur (pano.sinav_donemleri).
  kurum_alani         text not null default 'selcuk.edu.tr' check (kurum_alani ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  xp_1saat            integer not null default 30  check (xp_1saat between 0 and 500),
  xp_2saat            integer not null default 55  check (xp_2saat between 0 and 500),
  xp_3saat            integer not null default 80  check (xp_3saat between 0 and 500),
  haftalik_tavan      integer not null default 150 check (haftalik_tavan between 0 and 2000),
  kacti_esigi         integer not null default 3   check (kacti_esigi between 1 and 10),
  aylik_acik_is       integer not null default 2   check (aylik_acik_is between 0 and 20),
  -- "Kaçtı" sayımı bu tarihten başlar (dönem başı).
  donem_baslangic     date not null default date '2026-09-01'
);
insert into ekip.ayarlar default values on conflict do nothing;

create table if not exists ekip.ekipler (
  kod   text primary key check (kod ~ '^[a-z_]{2,20}$'),
  ad    text not null,
  sira  smallint not null
);
insert into ekip.ekipler (kod, ad, sira) values
  ('cekirdek', 'Çekirdek ekip',          0),
  ('etkinlik', 'Etkinlik ve Operasyon',  1),
  ('tasarim',  'Tasarım',                2),
  ('icerik',   'İçerik ve Sosyal Medya', 3),
  ('egitim',   'Eğitim ve Proje',        4),
  ('dis',      'Dış İlişkiler',          5)
on conflict (kod) do update set ad = excluded.ad, sira = excluded.sira;

-- Görev Tanımları belgesindeki 17 rol. Kontenjan ve haftalık süre belgeden.
create table if not exists ekip.roller (
  kod        text primary key check (kod ~ '^[a-z_]{2,30}$'),
  ad         text not null,
  ekip       text not null references ekip.ekipler(kod),
  lider      boolean not null default false,
  cekirdek   boolean not null default false,
  kontenjan  smallint not null check (kontenjan between 1 and 10),
  saat       text not null,
  sira       smallint not null
);
insert into ekip.roller (kod, ad, ekip, lider, cekirdek, kontenjan, saat, sira) values
  ('baskan',             'Başkan',                                          'cekirdek', false, true,  1, '8–10', 1),
  ('by_operasyon',       'Başkan Yardımcısı (Operasyon ve Üye Süreçleri)',  'cekirdek', false, true,  1, '6–8',  2),
  ('by_dis',             'Başkan Yardımcısı (Dış İlişkiler)',               'dis',      true,  true,  1, '6–8',  3),
  ('lider_etkinlik',     'Etkinlik ve Operasyon Ekip Lideri',               'etkinlik', true,  true,  1, '4–6',  4),
  ('lider_tasarim',      'Tasarım Ekip Lideri',                             'tasarim',  true,  true,  1, '4–5',  5),
  ('lider_icerik',       'İçerik ve Sosyal Medya Ekip Lideri',              'icerik',   true,  true,  1, '4–5',  6),
  ('lider_egitim',       'Eğitim ve Proje Ekip Lideri',                     'egitim',   true,  true,  1, '4–6',  7),
  ('sponsorluk',         'Sponsorluk Sorumlusu',                            'dis',      false, false, 2, '3–4',  8),
  ('konusmaci',          'Konuşmacı ve Konuk Sorumlusu',                    'dis',      false, false, 1, '3–4',  9),
  ('etkinlik_sorumlusu', 'Etkinlik Sorumlusu',                              'etkinlik', false, false, 2, '2–3', 10),
  ('saha_lojistik',      'Saha ve Lojistik Sorumlusu',                      'etkinlik', false, false, 2, '2–3', 11),
  ('tasarimci',          'Tasarımcı',                                       'tasarim',  false, false, 3, '2–3', 12),
  ('icerik_sorumlusu',   'İçerik ve Sosyal Medya Sorumlusu',                'icerik',   false, false, 2, '2–3', 13),
  ('video_foto',         'Video ve Fotoğraf Sorumlusu',                     'icerik',   false, false, 1, '2–3', 14),
  ('arastirmaci',        'Araştırmacı',                                     'egitim',   false, false, 2, '3–4', 15),
  ('egitim_sorumlusu',   'Eğitim Sorumlusu',                                'egitim',   false, false, 1, '3–4', 16),
  ('proje_yarisma',      'Proje ve Yarışma Sorumlusu',                      'egitim',   false, false, 1, '3–4', 17)
on conflict (kod) do update set ad = excluded.ad, ekip = excluded.ekip, lider = excluded.lider,
  cekirdek = excluded.cekirdek, kontenjan = excluded.kontenjan, saat = excluded.saat, sira = excluded.sira;

-- Bir kişi kadroda tek rol taşır. Unvan deneme süresinden sonra kesinleşir.
create table if not exists ekip.kadro (
  kullanici  uuid primary key references public.profiller(id) on delete cascade,
  rol        text not null references ekip.roller(kod),
  durum      text not null default 'deneme' check (durum in ('deneme', 'kesin')),
  eklendi    timestamptz not null default now(),
  ekleyen    uuid references public.profiller(id) on delete set null
);

-- Ortak pano: her satır bir iş.
create table if not exists ekip.isler (
  id           bigint generated always as identity primary key,
  baslik       text not null check (char_length(baslik) between 3 and 140),
  ekip         text not null references ekip.ekipler(kod),
  sahibi       uuid not null references public.profiller(id) on delete cascade,
  teslim       date not null,
  durum        text not null default 'sirada'
               check (durum in ('sirada', 'yapiliyor', 'onayda', 'bitti', 'kacti')),
  notu         text check (char_length(notu) <= 500),
  -- Haber verilip yeni tarih alındı (kaçmış sayılmaz; yalnızca sayılır).
  ertelendi    smallint not null default 0 check (ertelendi between 0 and 100),
  -- "Kaçtı" kaydı. İş sonradan bitse de kayıt kalır; yalnızca yanlışlıkla
  -- işlendiyse düzeltme ile silinir.
  kacti_zaman  timestamptz,
  bitti_zaman  timestamptz,
  olusturan    uuid references public.profiller(id) on delete set null,
  olusturuldu  timestamptz not null default now(),
  guncellendi  timestamptz not null default now()
);
create index if not exists isler_sahibi_idx on ekip.isler (sahibi, durum);
create index if not exists isler_ekip_idx on ekip.isler (ekip, durum, teslim);

-- Gönüllü havuzu: tek seferlik açık işler.
create table if not exists ekip.acik_isler (
  id           bigint generated always as identity primary key,
  baslik       text not null check (char_length(baslik) between 3 and 120),
  aciklama     text check (char_length(aciklama) <= 600),
  ekip         text not null references ekip.ekipler(kod),
  sure_saat    smallint not null check (sure_saat between 1 and 3),
  tarih        date not null,
  saat         time,
  etkinlik_id  bigint references public.etkinlikler(id) on delete set null,
  -- Sahaya çıkan gönüllü sahadaki görevli sınırına (25) sayılır.
  saha         boolean not null default false,
  kontenjan    smallint not null default 1 check (kontenjan between 1 and 10),
  durum        text not null default 'acik' check (durum in ('acik', 'kapandi', 'iptal')),
  olusturan    uuid references public.profiller(id) on delete set null,
  olusturuldu  timestamptz not null default now()
);
create index if not exists acik_isler_liste_idx on ekip.acik_isler (durum, tarih);
create index if not exists acik_isler_etkinlik_idx on ekip.acik_isler (etkinlik_id);

create table if not exists ekip.ustlenmeler (
  is_id          bigint not null references ekip.acik_isler(id) on delete cascade,
  kullanici      uuid not null references public.profiller(id) on delete cascade,
  durum          text not null default 'ustlendi'
                 check (durum in ('ustlendi', 'teslim', 'onaylandi', 'birakti', 'olmadi')),
  ustlenildi     timestamptz not null default now(),
  teslim_edildi  timestamptz,
  karar_zaman    timestamptz,
  karar_veren    uuid references public.profiller(id) on delete set null,
  xp             integer not null default 0 check (xp >= 0),
  primary key (is_id, kullanici)
);
create index if not exists ustlenmeler_kullanici_idx on ekip.ustlenmeler (kullanici, durum);

do $$
declare t text;
begin
  foreach t in array array['ayarlar', 'ekipler', 'roller', 'kadro', 'isler', 'acik_isler', 'ustlenmeler'] loop
    execute format('alter table ekip.%I enable row level security', t);
    execute format('revoke all on ekip.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Puan defterine yeni kaynak: gönüllü iş.
alter table odul.puan_islemleri drop constraint if exists puan_islemleri_tur_check;
alter table odul.puan_islemleri add constraint puan_islemleri_tur_check
  check (tur in ('gorev', 'seri_bonusu', 'yonetici', 'not', 'gonullu'));


-- ═══════════════════════════════════════════════════════════════════
-- YARDIMCILAR
-- ═══════════════════════════════════════════════════════════════════

/** Tam yetki: uygulamada başkan, kadroda başkan ya da Operasyon başkan yardımcısı. */
create or replace function ekip.tam_yetkili(p_kim uuid)
returns boolean language sql stable
set search_path = ekip, public
as $$
  select exists (select 1 from public.profiller where id = p_kim and rol = 'baskan')
      or exists (select 1 from ekip.kadro where kullanici = p_kim and rol in ('baskan', 'by_operasyon'))
$$;

/** Bu ekibin işini yazabilir mi: tam yetkili ya da o ekibin lideri. */
create or replace function ekip.yonetir(p_kim uuid, p_ekip text)
returns boolean language sql stable
set search_path = ekip, public
as $$
  select ekip.tam_yetkili(p_kim)
      or exists (select 1 from ekip.kadro k join ekip.roller r on r.kod = k.rol
                 where k.kullanici = p_kim and r.lider and r.ekip = p_ekip)
$$;

/** Panoyu görebilir mi: kadroda ya da uygulamada başkan. */
create or replace function ekip.kadroda(p_kim uuid)
returns boolean language sql stable
set search_path = ekip, public
as $$
  select ekip.tam_yetkili(p_kim) or exists (select 1 from ekip.kadro where kullanici = p_kim)
$$;

/** Yönettiği ekipler (tam yetkilide hepsi). */
create or replace function ekip.yonettikleri(p_kim uuid)
returns text[] language sql stable
set search_path = ekip, public
as $$
  select case when ekip.tam_yetkili(p_kim) then (select array_agg(kod order by sira) from ekip.ekipler)
              else coalesce((select array_agg(r.ekip) from ekip.kadro k join ekip.roller r on r.kod = k.rol
                             where k.kullanici = p_kim and r.lider), '{}') end
$$;

/** Bu gün topluluğun üniversitesinde vize/final haftası mı? Öyleyse dönemin adı. */
create or replace function ekip.sinav_haftasi(p_gun date)
returns text language sql stable
set search_path = ekip, pano
as $$
  select s.ad from pano.sinav_donemleri s, ekip.ayarlar a
  where s.kurum_alani = a.kurum_alani and p_gun between s.baslangic and s.bitis
  order by s.baslangic limit 1
$$;

/**
 * Sponsor ya da konuşmacıyla temas: açık iş olarak verilmez (Dış İlişkiler'de
 * kalır). Yalnızca TEMAS fiilleri yakalanır: "konuşmacı afişindeki yazım
 * hatalarını kontrol et" gibi bir iş engellenmez.
 */
create or replace function ekip.dis_temas_mi(p text)
returns boolean language sql immutable
as $$
  select coalesce(lower(p) ~ '(sponsor|konuşmacı|konusmaci|konuk)'
              and lower(p) ~ '(temas|ulaş|ulas|iletişim|iletisim|e-?posta|mail|mesaj at|görüşme|gorusme|davet|teklif|telefon|aramak|arayıp|arayip|yazışma|yazisma)', false)
$$;

create or replace function ekip.kisi_json(p_id uuid)
returns jsonb language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', p.id, 'kullanici_adi', p.kullanici_adi,
                            'ad', coalesce(nullif(btrim(p.ad_soyad), ''), '@' || p.kullanici_adi))
  from public.profiller p where p.id = p_id
$$;

create or replace function ekip.xp_miktari(p_saat integer)
returns integer language sql stable
set search_path = ekip
as $$
  select case p_saat when 1 then xp_1saat when 2 then xp_2saat else xp_3saat end from ekip.ayarlar
$$;

/** Gönüllü işin puanı: süreye göre, haftalık tavanla (net). */
create or replace function ekip.gonullu_xp_ver(p_kim uuid, p_saat integer, p_baslik text)
returns integer language plpgsql volatile
set search_path = ekip, odul
as $$
declare v_miktar integer; v_hafta integer; v_tavan integer := (select haftalik_tavan from ekip.ayarlar);
begin
  perform odul.hesap_kilitle(p_kim);
  select greatest(0, coalesce(sum(miktar), 0)) into v_hafta from odul.puan_islemleri
  where kullanici = p_kim and tur = 'gonullu' and zaman >= pano.hafta_basi();
  v_miktar := least(ekip.xp_miktari(p_saat), greatest(0, v_tavan - v_hafta));
  if v_miktar > 0 then
    perform odul.puan_ekle(p_kim, v_miktar, 'gonullu', 'Gönüllü iş: ' || left(p_baslik, 120), null, auth.uid());
  end if;
  return v_miktar;
end $$;

/** Kişinin dönem içindeki "kaçtı" kaydı sayısı. */
create or replace function ekip.kacti_sayisi(p_kim uuid)
returns integer language sql stable
set search_path = ekip
as $$
  select count(*)::integer from ekip.isler
  where sahibi = p_kim and kacti_zaman is not null
    and kacti_zaman >= (select donem_baslangic from ekip.ayarlar)
$$;

create or replace function ekip.is_json(i ekip.isler)
returns jsonb language sql stable
set search_path = ekip
as $$
  select jsonb_build_object(
    'id', i.id, 'baslik', i.baslik, 'ekip', i.ekip, 'sahibi', ekip.kisi_json(i.sahibi),
    'teslim', i.teslim, 'durum', i.durum, 'notu', i.notu, 'ertelendi', i.ertelendi,
    'gecikti', i.durum in ('sirada', 'yapiliyor') and i.teslim < pano.bugun(),
    'kacti_kayit', i.kacti_zaman is not null, 'bitti_zaman', i.bitti_zaman,
    'olusturuldu', i.olusturuldu)
$$;

create or replace function ekip.acik_is_json(a ekip.acik_isler, p_kim uuid)
returns jsonb language sql stable
set search_path = ekip, public
as $$
  select jsonb_build_object(
    'id', a.id, 'baslik', a.baslik, 'aciklama', a.aciklama, 'ekip', a.ekip,
    'ekip_adi', (select ad from ekip.ekipler where kod = a.ekip),
    'sure_saat', a.sure_saat, 'xp', ekip.xp_miktari(a.sure_saat), 'tarih', a.tarih, 'saat', a.saat,
    'saha', a.saha, 'kontenjan', a.kontenjan, 'durum', a.durum,
    'dolu', (select count(*) from ekip.ustlenmeler u where u.is_id = a.id and u.durum in ('ustlendi', 'teslim', 'onaylandi')),
    'etkinlik', (select jsonb_build_object('id', e.id, 'baslik', e.baslik, 'baslangic', e.baslangic)
                 from public.etkinlikler e where e.id = a.etkinlik_id),
    'benim', (select u.durum from ekip.ustlenmeler u where u.is_id = a.id and u.kullanici = p_kim))
$$;

create or replace function ekip.giris_olmali()
returns uuid language plpgsql stable
as $$
declare kim uuid := auth.uid();
begin
  if kim is null then raise exception 'Giriş gerekli.' using errcode = '42501'; end if;
  return kim;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- HERKES: özet ve gönüllü havuzu
-- ═══════════════════════════════════════════════════════════════════

/**
 * Ana ekran ve Ben için: kadroda mı, üstlendiği açık işler, (kadrodaysa)
 * teslimi yaklaşan kendi pano işleri.
 */
create or replace function public.ekip_ozet()
returns jsonb language plpgsql stable security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); r ekip.roller;
begin
  select ro.* into r from ekip.kadro k join ekip.roller ro on ro.kod = k.rol where k.kullanici = kim;
  return jsonb_build_object(
    'kadroda', ekip.kadroda(kim),
    'tam_yetki', ekip.tam_yetkili(kim),
    'rol', case when r.kod is null then null else jsonb_build_object('kod', r.kod, 'ad', r.ad, 'ekip', r.ekip, 'lider', r.lider) end,
    'ustlenmeler', (select coalesce(jsonb_agg(jsonb_build_object(
        'is_id', a.id, 'baslik', a.baslik, 'tarih', a.tarih, 'saat', a.saat, 'sure_saat', a.sure_saat,
        'durum', u.durum, 'xp', ekip.xp_miktari(a.sure_saat)) order by a.tarih, a.saat nulls last), '[]')
      from ekip.ustlenmeler u join ekip.acik_isler a on a.id = u.is_id
      where u.kullanici = kim and u.durum in ('ustlendi', 'teslim') and a.durum <> 'iptal'
        and a.tarih >= pano.bugun() - 7),
    'isler', case when ekip.kadroda(kim) then (select coalesce(jsonb_agg(ekip.is_json(i) order by i.teslim), '[]')
      from ekip.isler i where i.sahibi = kim and i.durum in ('sirada', 'yapiliyor', 'onayda')) else '[]'::jsonb end);
end $$;

/** Gönüllü havuzu: açık işler ve benim üstlendiklerim. Herkese açık (girişli). */
create or replace function public.ekip_havuz(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer
set search_path = public, ekip
as $$
declare
  kim uuid := ekip.giris_olmali();
  v_etkinlik bigint := nullif(p->>'etkinlik', '')::bigint;
begin
  return jsonb_build_object(
    'sinav', ekip.sinav_haftasi(pano.bugun()),
    'isler', (select coalesce(jsonb_agg(ekip.acik_is_json(a, kim) order by a.tarih, a.saat nulls last, a.id), '[]')
      from ekip.acik_isler a
      where a.durum = 'acik' and a.tarih >= pano.bugun()
        and (v_etkinlik is null or a.etkinlik_id = v_etkinlik)),
    'benim', (select coalesce(jsonb_agg(jsonb_build_object(
        'is_id', a.id, 'baslik', a.baslik, 'ekip_adi', (select ad from ekip.ekipler where kod = a.ekip),
        'tarih', a.tarih, 'saat', a.saat, 'sure_saat', a.sure_saat, 'durum', u.durum, 'xp', u.xp,
        'is_durumu', a.durum) order by a.tarih desc), '[]')
      from ekip.ustlenmeler u join ekip.acik_isler a on a.id = u.is_id
      where u.kullanici = kim and u.durum <> 'birakti' and u.ustlenildi >= now() - interval '120 days'),
    'tamamlanan', (select count(*) from ekip.ustlenmeler u where u.kullanici = kim and u.durum = 'onaylandi'));
end $$;

/** Açık işi üstlen. Kontenjan dolduysa 'dolu'; eşzamanlı iki istek aynı son yeri alamaz. */
create or replace function public.ekip_ustlen(p_id bigint)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); a ekip.acik_isler; v_mevcut text; v_dolu integer;
begin
  select * into a from ekip.acik_isler where id = p_id for update;
  if not found or a.durum <> 'acik' then return jsonb_build_object('durum', 'kapali'); end if;
  if a.tarih < pano.bugun() then return jsonb_build_object('durum', 'gecti'); end if;
  select durum into v_mevcut from ekip.ustlenmeler where is_id = p_id and kullanici = kim;
  if v_mevcut in ('ustlendi', 'teslim', 'onaylandi') then return jsonb_build_object('durum', 'zaten'); end if;
  select count(*) into v_dolu from ekip.ustlenmeler where is_id = p_id and durum in ('ustlendi', 'teslim', 'onaylandi');
  if v_dolu >= a.kontenjan then return jsonb_build_object('durum', 'dolu'); end if;
  insert into ekip.ustlenmeler (is_id, kullanici) values (p_id, kim)
  on conflict (is_id, kullanici) do update set durum = 'ustlendi', ustlenildi = now(),
    teslim_edildi = null, karar_zaman = null, karar_veren = null, xp = 0;
  return jsonb_build_object('durum', 'tamam');
end $$;

/** Üstlendiğini bırak. Kayıt tutulmaz (belge: gönüllüde kaçan teslim sayılmaz). */
create or replace function public.ekip_birak(p_id bigint)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali();
begin
  update ekip.ustlenmeler set durum = 'birakti'
  where is_id = p_id and kullanici = kim and durum in ('ustlendi', 'teslim');
  return jsonb_build_object('durum', case when found then 'tamam' else 'yok' end);
end $$;

/** "Yaptım": lider onaylayınca XP gelir. */
create or replace function public.ekip_yaptim(p_id bigint)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali();
begin
  update ekip.ustlenmeler set durum = 'teslim', teslim_edildi = now()
  where is_id = p_id and kullanici = kim and durum = 'ustlendi';
  return jsonb_build_object('durum', case when found then 'tamam' else 'yok' end);
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- KADRO: pano
-- ═══════════════════════════════════════════════════════════════════

/** Ortak pano: işler, kadro, ekipler, roller ve yaklaşan sınav haftaları. */
create or replace function public.ekip_pano()
returns jsonb language plpgsql stable security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); r ekip.roller;
begin
  if not ekip.kadroda(kim) then raise exception 'Pano yalnızca görevli kadroya açık.' using errcode = '42501'; end if;
  select ro.* into r from ekip.kadro k join ekip.roller ro on ro.kod = k.rol where k.kullanici = kim;
  return jsonb_build_object(
    'bugun', pano.bugun(),
    'ben', jsonb_build_object('id', kim, 'tam_yetki', ekip.tam_yetkili(kim), 'yonettikleri', ekip.yonettikleri(kim),
      'rol', case when r.kod is null then null else jsonb_build_object('kod', r.kod, 'ad', r.ad, 'ekip', r.ekip, 'lider', r.lider) end),
    'ayarlar', (select jsonb_build_object('kacti_esigi', kacti_esigi, 'aylik_acik_is', aylik_acik_is,
                                          'donem_baslangic', donem_baslangic) from ekip.ayarlar),
    'sinav', (select coalesce(jsonb_agg(jsonb_build_object('ad', s.ad, 'baslangic', s.baslangic, 'bitis', s.bitis)
                                        order by s.baslangic), '[]')
              from pano.sinav_donemleri s, ekip.ayarlar a
              where s.kurum_alani = a.kurum_alani and s.bitis >= pano.bugun()),
    'ekipler', (select jsonb_agg(jsonb_build_object('kod', kod, 'ad', ad) order by sira) from ekip.ekipler),
    'roller', (select jsonb_agg(jsonb_build_object('kod', kod, 'ad', ad, 'ekip', ekip, 'lider', lider,
                                                   'cekirdek', cekirdek, 'kontenjan', kontenjan, 'saat', saat) order by sira)
               from ekip.roller),
    'kadro', (select coalesce(jsonb_agg(ekip.kisi_json(k.kullanici) || jsonb_build_object(
                  'rol', k.rol, 'durum', k.durum, 'eklendi', k.eklendi,
                  'kacti', ekip.kacti_sayisi(k.kullanici),
                  'acik', (select count(*) from ekip.isler i where i.sahibi = k.kullanici and i.durum in ('sirada', 'yapiliyor', 'onayda')),
                  'geciken', (select count(*) from ekip.isler i where i.sahibi = k.kullanici
                              and i.durum in ('sirada', 'yapiliyor') and i.teslim < pano.bugun()))
                order by ro.sira, k.eklendi), '[]')
              from ekip.kadro k join ekip.roller ro on ro.kod = k.rol),
    'isler', (select coalesce(jsonb_agg(ekip.is_json(i) order by i.teslim, i.id), '[]') from ekip.isler i
              where i.durum in ('sirada', 'yapiliyor', 'onayda')
                 or coalesce(i.bitti_zaman, i.kacti_zaman, i.guncellendi) >= now() - interval '21 days'));
end $$;

/**
 * İş ekle ya da düzenle. Yalnızca ekibin lideri ya da tam yetkili.
 * Sahibi kadroda olmalı; teslim geçmişte ya da sınav haftasında olamaz.
 */
create or replace function public.ekip_is_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare
  kim uuid := ekip.giris_olmali();
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_ekip text := p->>'ekip';
  v_sahibi uuid;
  v_teslim date;
  v_sinav text;
  eski ekip.isler;
begin
  begin
    v_sahibi := (p->>'sahibi')::uuid;
    v_teslim := (p->>'teslim')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Sahibi ya da teslim tarihi hatalı.' using errcode = '22023';
  end;
  if v_ekip is null or not exists (select 1 from ekip.ekipler where kod = v_ekip) then
    raise exception 'Ekip seçilmedi.' using errcode = '22023';
  end if;
  if v_id is not null then
    select * into eski from ekip.isler where id = v_id for update;
    if not found then raise exception 'İş bulunamadı.' using errcode = '22023'; end if;
    if not ekip.yonetir(kim, eski.ekip) then
      raise exception 'Bu işi yalnızca ekibin lideri ya da Operasyon düzenler.' using errcode = '42501';
    end if;
  end if;
  if not ekip.yonetir(kim, v_ekip) then
    raise exception 'Bu ekibe iş yalnızca ekibin lideri ya da Operasyon yazar.' using errcode = '42501';
  end if;
  if v_sahibi is null or not exists (select 1 from ekip.kadro where kullanici = v_sahibi) then
    raise exception 'İşin sahibi görevli kadroda olmalı (tek kişi).' using errcode = '22023';
  end if;
  if v_teslim is null then raise exception 'Teslim tarihi gerekli.' using errcode = '22023'; end if;
  if v_id is null or v_teslim <> eski.teslim then
    if v_teslim < pano.bugun() then raise exception 'Teslim tarihi geçmişte olamaz.' using errcode = '22023'; end if;
    v_sinav := ekip.sinav_haftasi(v_teslim);
    if v_sinav is not null then
      raise exception 'Sınav haftasına (%) teslim konmaz; öncesi ya da sonrası için bir tarih seç.', v_sinav using errcode = '22023';
    end if;
  end if;
  if public.gorunmez_karakter_var(coalesce(p->>'baslik', '') || coalesce(p->>'notu', '')) then
    raise exception 'Metinde desteklenmeyen karakter var.' using errcode = '22023';
  end if;
  begin
    if v_id is null then
      insert into ekip.isler (baslik, ekip, sahibi, teslim, notu, olusturan)
      values (btrim(p->>'baslik'), v_ekip, v_sahibi, v_teslim, nullif(btrim(coalesce(p->>'notu', '')), ''), kim)
      returning id into v_id;
    else
      update ekip.isler set baslik = btrim(p->>'baslik'), ekip = v_ekip, sahibi = v_sahibi, teslim = v_teslim,
        notu = nullif(btrim(coalesce(p->>'notu', '')), ''), guncellendi = now()
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation then
    raise exception 'İş bilgisi hatalı (başlık 3–140 karakter, not en fazla 500).' using errcode = '22023';
  end;
  perform odul.denetle('ekip_is_kaydet', v_id::text, p);
  return jsonb_build_object('durum', 'tamam', 'id', v_id);
end $$;

/**
 * Durum değiştir. Sahibi: sırada / yapılıyor / onayda. Lider ve tam yetkili:
 * hepsi, "bitti" ve "kaçtı" dahil. `p_duzeltme`: yanlışlıkla işlenen "kaçtı"
 * kaydını siler (yalnızca lider / tam yetkili).
 */
create or replace function public.ekip_is_durum(p_id bigint, p_durum text, p_duzeltme boolean default false)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); i ekip.isler; v_yonetir boolean; v_sayi integer; v_esik integer;
begin
  select * into i from ekip.isler where id = p_id for update;
  if not found then raise exception 'İş bulunamadı.' using errcode = '22023'; end if;
  if p_durum not in ('sirada', 'yapiliyor', 'onayda', 'bitti', 'kacti') then
    raise exception 'Geçersiz durum.' using errcode = '22023';
  end if;
  v_yonetir := ekip.yonetir(kim, i.ekip);
  if not v_yonetir then
    if i.sahibi <> kim then raise exception 'Bu iş senin değil.' using errcode = '42501'; end if;
    if p_durum in ('bitti', 'kacti') or i.durum in ('bitti', 'kacti') or p_duzeltme then
      raise exception '"Bitti" ve "kaçtı" kararını ekip lideri verir; işi "onayda"ya al.' using errcode = '42501';
    end if;
  end if;
  update ekip.isler set
    durum = p_durum,
    kacti_zaman = case when p_durum = 'kacti' then coalesce(kacti_zaman, now())
                       when p_duzeltme then null else kacti_zaman end,
    bitti_zaman = case when p_durum = 'bitti' then coalesce(bitti_zaman, now()) else null end,
    guncellendi = now()
  where id = p_id;
  if p_durum = 'kacti' or p_duzeltme then
    perform odul.denetle('ekip_is_durum', p_id::text, jsonb_build_object('durum', p_durum, 'duzeltme', p_duzeltme));
  end if;
  v_sayi := ekip.kacti_sayisi(i.sahibi);
  v_esik := (select kacti_esigi from ekip.ayarlar);
  return jsonb_build_object('durum', 'tamam', 'kacti', v_sayi, 'esik', v_esik, 'gorusme', v_sayi >= v_esik);
end $$;

/**
 * Önceden haber verip yeni tarih al: kaçmış sayılmaz. Sahibi teslim günü
 * geçmeden erteleyebilir; lider her zaman. Yeni tarih sınav haftasında olamaz.
 */
create or replace function public.ekip_is_ertele(p_id bigint, p_teslim date, p_not text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); i ekip.isler; v_yonetir boolean; v_sinav text;
begin
  select * into i from ekip.isler where id = p_id for update;
  if not found then raise exception 'İş bulunamadı.' using errcode = '22023'; end if;
  v_yonetir := ekip.yonetir(kim, i.ekip);
  if not v_yonetir and i.sahibi <> kim then raise exception 'Bu iş senin değil.' using errcode = '42501'; end if;
  if i.durum in ('bitti', 'kacti') then raise exception 'Biten ya da kaçan iş ertelenemez.' using errcode = '22023'; end if;
  if not v_yonetir and pano.bugun() > i.teslim then
    raise exception 'Teslim günü geçti; yeni tarih için ekip liderine yaz.' using errcode = '22023';
  end if;
  if p_teslim is null or p_teslim <= greatest(i.teslim, pano.bugun() - 1) then
    raise exception 'Yeni tarih bugünden ve eski teslimden sonra olmalı.' using errcode = '22023';
  end if;
  v_sinav := ekip.sinav_haftasi(p_teslim);
  if v_sinav is not null then
    raise exception 'Sınav haftasına (%) teslim konmaz.', v_sinav using errcode = '22023';
  end if;
  if p_not is not null and (char_length(p_not) > 300 or public.gorunmez_karakter_var(p_not)) then
    raise exception 'Not en fazla 300 karakter.' using errcode = '22023';
  end if;
  update ekip.isler set teslim = p_teslim, ertelendi = ertelendi + 1, guncellendi = now(),
    notu = case when nullif(btrim(coalesce(p_not, '')), '') is null then notu
                else left(concat_ws(' · ', notu, 'Ertelendi: ' || btrim(p_not)), 500) end
  where id = p_id;
  return jsonb_build_object('durum', 'tamam');
end $$;

create or replace function public.ekip_is_sil(p_id bigint)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); i ekip.isler;
begin
  select * into i from ekip.isler where id = p_id;
  if not found then return jsonb_build_object('durum', 'yok'); end if;
  if not ekip.yonetir(kim, i.ekip) then raise exception 'İşi yalnızca ekibin lideri ya da Operasyon siler.' using errcode = '42501'; end if;
  delete from ekip.isler where id = p_id;
  perform odul.denetle('ekip_is_sil', p_id::text, to_jsonb(i));
  return jsonb_build_object('durum', 'tamam');
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- KADRO YÖNETİMİ (başkan ve Operasyon)
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.ekip_kadro_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); v_kisi uuid; v_rol text := p->>'rol'; v_durum text := coalesce(p->>'durum', 'deneme');
begin
  if not ekip.tam_yetkili(kim) then raise exception 'Kadroyu başkan ve Operasyon başkan yardımcısı düzenler.' using errcode = '42501'; end if;
  begin v_kisi := (p->>'kullanici')::uuid;
  exception when invalid_text_representation then raise exception 'Kişi seçilmedi.' using errcode = '22023'; end;
  if v_kisi is null or not exists (select 1 from public.profiller where id = v_kisi) then
    raise exception 'Kişi bulunamadı.' using errcode = '22023';
  end if;
  if not exists (select 1 from ekip.roller where kod = v_rol) then raise exception 'Rol seçilmedi.' using errcode = '22023'; end if;
  if v_durum not in ('deneme', 'kesin') then raise exception 'Geçersiz durum.' using errcode = '22023'; end if;
  insert into ekip.kadro (kullanici, rol, durum, ekleyen) values (v_kisi, v_rol, v_durum, kim)
  on conflict (kullanici) do update set rol = excluded.rol, durum = excluded.durum;
  perform odul.denetle('ekip_kadro_kaydet', v_kisi::text, p);
  return jsonb_build_object('durum', 'tamam');
end $$;

/** Kadrodan çıkar. Açık işi varsa önce devredilmeli (işler sahipsiz kalmasın). */
create or replace function public.ekip_kadro_cikar(p_kullanici uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); v_acik integer; v_silinen integer;
begin
  if not ekip.tam_yetkili(kim) then raise exception 'Kadroyu başkan ve Operasyon başkan yardımcısı düzenler.' using errcode = '42501'; end if;
  select count(*) into v_acik from ekip.isler where sahibi = p_kullanici and durum in ('sirada', 'yapiliyor', 'onayda');
  if v_acik > 0 then
    raise exception 'Önce açık işlerini (%) başkasına devret.', v_acik using errcode = '22023';
  end if;
  delete from ekip.kadro where kullanici = p_kullanici;
  get diagnostics v_silinen = row_count;
  if v_silinen > 0 then perform odul.denetle('ekip_kadro_cikar', p_kullanici::text, '{}'::jsonb); end if;
  return jsonb_build_object('durum', case when v_silinen > 0 then 'tamam' else 'yok' end);
end $$;

/** Kadroya eklenebilecek kişiler: ada göre arama (en fazla 20), gönüllü geçmişiyle. */
create or replace function public.ekip_kisi_ara(p_ara text)
returns jsonb language plpgsql stable security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali();
begin
  if not ekip.tam_yetkili(kim) then raise exception 'Kadroyu başkan ve Operasyon başkan yardımcısı düzenler.' using errcode = '42501'; end if;
  if char_length(coalesce(p_ara, '')) > 60 then raise exception 'Arama çok uzun.' using errcode = '22023'; end if;
  return (select coalesce(jsonb_agg(x), '[]') from (
    select ekip.kisi_json(p.id) || jsonb_build_object(
      'kadroda', exists (select 1 from ekip.kadro k where k.kullanici = p.id),
      'gonullu', (select count(*) from ekip.ustlenmeler u where u.kullanici = p.id and u.durum = 'onaylandi')) as x
    from public.profiller p
    where coalesce(p_ara, '') = ''
       or p.kullanici_adi ilike pano.desen(p_ara) or p.ad_soyad ilike pano.desen(p_ara)
    order by (select count(*) from ekip.ustlenmeler u where u.kullanici = p.id and u.durum = 'onaylandi') desc,
             p.kullanici_adi
    limit 20) s);
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- GÖNÜLLÜ HAVUZU YÖNETİMİ (ekip liderleri)
-- ═══════════════════════════════════════════════════════════════════

/** Açık iş yaz ya da düzenle. Ekip lideri (kendi ekibi) ya da tam yetkili. */
create or replace function public.ekip_acik_is_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare
  kim uuid := ekip.giris_olmali();
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_ekip text := p->>'ekip';
  v_tarih date;
  v_saat time;
  v_etkinlik bigint;
  v_kontenjan integer;
  v_dolu integer;
  v_sinav text;
  eski ekip.acik_isler;
begin
  if v_ekip is null or not ekip.yonetir(kim, v_ekip) then
    raise exception 'Açık işi yalnızca ekibin lideri ya da Operasyon yazar.' using errcode = '42501';
  end if;
  if v_id is not null then
    select * into eski from ekip.acik_isler where id = v_id for update;
    if not found then raise exception 'Açık iş bulunamadı.' using errcode = '22023'; end if;
    if not ekip.yonetir(kim, eski.ekip) then
      raise exception 'Açık işi yalnızca ekibin lideri ya da Operasyon düzenler.' using errcode = '42501';
    end if;
  end if;
  begin
    v_tarih := (p->>'tarih')::date;
    v_saat := nullif(p->>'saat', '')::time;
    v_etkinlik := nullif(p->>'etkinlik_id', '')::bigint;
    v_kontenjan := coalesce(nullif(p->>'kontenjan', '')::integer, 1);
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Tarih, saat ya da kontenjan hatalı.' using errcode = '22023';
  end;
  if v_tarih is null or v_tarih < pano.bugun() then raise exception 'İşin tarihi bugün ya da sonrası olmalı.' using errcode = '22023'; end if;
  v_sinav := coalesce(ekip.sinav_haftasi(pano.bugun()), ekip.sinav_haftasi(v_tarih));
  if v_sinav is not null then
    raise exception 'Sınav haftasında (%) gönüllü havuzuna iş yazılmaz.', v_sinav using errcode = '22023';
  end if;
  if ekip.dis_temas_mi(coalesce(p->>'baslik', '') || ' ' || coalesce(p->>'aciklama', '')) then
    raise exception 'Sponsor ya da konuşmacıyla temas açık iş olarak verilmez; o iş Dış İlişkiler''de kalır.' using errcode = '22023';
  end if;
  if public.gorunmez_karakter_var(coalesce(p->>'baslik', '') || coalesce(p->>'aciklama', '')) then
    raise exception 'Metinde desteklenmeyen karakter var.' using errcode = '22023';
  end if;
  if v_etkinlik is not null and not exists (select 1 from public.etkinlikler where id = v_etkinlik) then
    raise exception 'Etkinlik bulunamadı.' using errcode = '22023';
  end if;
  if v_id is not null then
    select count(*) into v_dolu from ekip.ustlenmeler where is_id = v_id and durum in ('ustlendi', 'teslim', 'onaylandi');
    if v_kontenjan < v_dolu then
      raise exception 'Kontenjan üstlenen sayısının (%) altına inemez.', v_dolu using errcode = '22023';
    end if;
  end if;
  begin
    if v_id is null then
      insert into ekip.acik_isler (baslik, aciklama, ekip, sure_saat, tarih, saat, etkinlik_id, saha, kontenjan, olusturan)
      values (btrim(p->>'baslik'), nullif(btrim(coalesce(p->>'aciklama', '')), ''), v_ekip,
              (p->>'sure_saat')::smallint, v_tarih, v_saat, v_etkinlik, coalesce((p->>'saha')::boolean, false),
              v_kontenjan, kim)
      returning id into v_id;
    else
      update ekip.acik_isler set baslik = btrim(p->>'baslik'), aciklama = nullif(btrim(coalesce(p->>'aciklama', '')), ''),
        ekip = v_ekip, sure_saat = (p->>'sure_saat')::smallint, tarih = v_tarih, saat = v_saat,
        etkinlik_id = v_etkinlik, saha = coalesce((p->>'saha')::boolean, false), kontenjan = v_kontenjan
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Açık iş bilgisi hatalı (başlık 3–120, süre 1–3 saat, kontenjan 1–10).' using errcode = '22023';
  end;
  perform odul.denetle('ekip_acik_is_kaydet', v_id::text, p);
  return jsonb_build_object('durum', 'tamam', 'id', v_id);
end $$;

/** Kapat (doldu, gerek kalmadı) ya da iptal et. İptalde üstlenenler serbest kalır. */
create or replace function public.ekip_acik_is_kapat(p_id bigint, p_durum text)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); a ekip.acik_isler;
begin
  select * into a from ekip.acik_isler where id = p_id for update;
  if not found then return jsonb_build_object('durum', 'yok'); end if;
  if not ekip.yonetir(kim, a.ekip) then raise exception 'Açık işi yalnızca ekibin lideri ya da Operasyon kapatır.' using errcode = '42501'; end if;
  if p_durum not in ('acik', 'kapandi', 'iptal') then raise exception 'Geçersiz durum.' using errcode = '22023'; end if;
  update ekip.acik_isler set durum = p_durum where id = p_id;
  if p_durum = 'iptal' then
    update ekip.ustlenmeler set durum = 'birakti' where is_id = p_id and durum in ('ustlendi', 'teslim');
  end if;
  return jsonb_build_object('durum', 'tamam');
end $$;

/**
 * Üstlenen hakkında karar: 'onayla' (iş yapıldı → adıyla kayıt + XP) ya da
 * 'olmadi' (yapılmadı; kayıt tutulmaz, kimseye gösterilmez).
 */
create or replace function public.ekip_karar(p_id bigint, p_kullanici uuid, p_karar text)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali(); a ekip.acik_isler; u ekip.ustlenmeler; v_xp integer := 0;
begin
  select * into a from ekip.acik_isler where id = p_id;
  if not found then raise exception 'Açık iş bulunamadı.' using errcode = '22023'; end if;
  if not ekip.yonetir(kim, a.ekip) then raise exception 'Kararı ekibin lideri ya da Operasyon verir.' using errcode = '42501'; end if;
  if p_karar not in ('onayla', 'olmadi') then raise exception 'Geçersiz karar.' using errcode = '22023'; end if;
  select * into u from ekip.ustlenmeler where is_id = p_id and kullanici = p_kullanici for update;
  if not found or u.durum not in ('ustlendi', 'teslim') then return jsonb_build_object('durum', 'yok'); end if;
  if p_kullanici = kim and p_karar = 'onayla' and not ekip.tam_yetkili(kim) then
    raise exception 'Kendi gönüllü işini onaylayamazsın.' using errcode = '42501';
  end if;
  if p_karar = 'onayla' then
    v_xp := ekip.gonullu_xp_ver(p_kullanici, a.sure_saat, a.baslik);
    update ekip.ustlenmeler set durum = 'onaylandi', karar_zaman = now(), karar_veren = kim, xp = v_xp,
      teslim_edildi = coalesce(teslim_edildi, now())
    where is_id = p_id and kullanici = p_kullanici;
  else
    update ekip.ustlenmeler set durum = 'olmadi', karar_zaman = now(), karar_veren = kim
    where is_id = p_id and kullanici = p_kullanici;
  end if;
  return jsonb_build_object('durum', 'tamam', 'xp', v_xp);
end $$;

/**
 * Havuzun yönetim görünümü (kadro): açık ve yakın geçmişteki işler,
 * üstlenenler, bu ay ekip başına açılan iş sayısı (hedef: ayda 2) ve
 * koltuk için ilk aday gönüllüler (kadroda olmayan, en çok iş tamamlayan).
 */
create or replace function public.ekip_havuz_yonetim()
returns jsonb language plpgsql stable security definer
set search_path = public, ekip
as $$
declare kim uuid := ekip.giris_olmali();
begin
  if not ekip.kadroda(kim) then raise exception 'Bu görünüm görevli kadroya açık.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'sinav', ekip.sinav_haftasi(pano.bugun()),
    'yonettikleri', ekip.yonettikleri(kim),
    'isler', (select coalesce(jsonb_agg(ekip.acik_is_json(a, kim) || jsonb_build_object(
        'ustlenenler', (select coalesce(jsonb_agg(ekip.kisi_json(u.kullanici) || jsonb_build_object(
            'durum', u.durum, 'xp', u.xp, 'ustlenildi', u.ustlenildi) order by u.ustlenildi), '[]')
          from ekip.ustlenmeler u where u.is_id = a.id and u.durum <> 'birakti'),
        'etkinlik_id', a.etkinlik_id)
        order by (a.durum = 'acik') desc, a.tarih desc), '[]')
      from ekip.acik_isler a where a.tarih >= pano.bugun() - 30 or a.durum = 'acik'),
    'ay', (select jsonb_object_agg(e.kod, (select count(*) from ekip.acik_isler a
             where a.ekip = e.kod and a.olusturuldu >= date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'))
           from ekip.ekipler e),
    'hedef', (select aylik_acik_is from ekip.ayarlar),
    'adaylar', (select coalesce(jsonb_agg(x order by (x->>'tamamlanan')::int desc), '[]') from (
        select ekip.kisi_json(u.kullanici) || jsonb_build_object('tamamlanan', count(*), 'son', max(u.karar_zaman)) as x
        from ekip.ustlenmeler u
        where u.durum = 'onaylandi' and not exists (select 1 from ekip.kadro k where k.kullanici = u.kullanici)
        group by u.kullanici
        order by count(*) desc limit 30) s));
end $$;

/** Ayarlar: yalnızca başkan. */
create or replace function public.ekip_ayarlar_kaydet(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, ekip
as $$
begin
  if not public.baskan_mi() then raise exception 'Bu işlem yalnızca başkana açık.' using errcode = '42501'; end if;
  begin
    update ekip.ayarlar set
      kurum_alani = coalesce(nullif(lower(btrim(p->>'kurum_alani')), ''), kurum_alani),
      xp_1saat = coalesce((p->>'xp_1saat')::integer, xp_1saat),
      xp_2saat = coalesce((p->>'xp_2saat')::integer, xp_2saat),
      xp_3saat = coalesce((p->>'xp_3saat')::integer, xp_3saat),
      haftalik_tavan = coalesce((p->>'haftalik_tavan')::integer, haftalik_tavan),
      kacti_esigi = coalesce((p->>'kacti_esigi')::integer, kacti_esigi),
      aylik_acik_is = coalesce((p->>'aylik_acik_is')::integer, aylik_acik_is),
      donem_baslangic = coalesce((p->>'donem_baslangic')::date, donem_baslangic);
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
    raise exception 'Ayar aralık dışında.' using errcode = '22023';
  end;
  perform odul.denetle('ekip_ayarlar', null, p);
  return (select to_jsonb(a) from ekip.ayarlar a);
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- YETKİLER
-- ═══════════════════════════════════════════════════════════════════
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'ekip\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.imza);
    execute format('grant execute on function %s to authenticated', f.imza);
  end loop;
  for f in
    select p.oid::regprocedure as imza from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ekip'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.imza);
  end loop;
end $$;
