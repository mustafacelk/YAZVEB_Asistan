-- ═══════════════════════════════════════════════════════════════════
-- YALNIZCA TEST İÇİN — Supabase'in sağladığı parçaların sade taklidi.
-- Üretimde ÇALIŞTIRILMAZ; Supabase'de bunlar zaten vardır.
-- ═══════════════════════════════════════════════════════════════════
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text unique,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Supabase'de pgcrypto "extensions" şemasında durur.
create schema if not exists extensions;

-- Supabase'de auth.uid() JWT'deki "sub" alanını okur. Testte aynı oturum
-- değişkenini elle ayarlayıp kullanıcı kılığına gireceğiz.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;

do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null;
end $$;

-- Supabase public şemasında yeni oluşturulan her fonksiyona ve tabloya
-- anon ve authenticated rollerine AÇIKÇA yetki verir. "revoke ... from
-- public" bu açık yetkiyi kaldırmaz. Taklit bunu yapmazsa testler canlıda
-- açık olan bir kapıyı kapalı sanır (öyle de oldu: olay_yaz).
alter default privileges in schema public grant execute on functions to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- Supabase'de bu izinler hazır gelir; taklitte elle veriyoruz.
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select on auth.users to authenticated;

-- Edge Function'ların kullandığı sunucu rolü (Supabase'de hazır gelir).
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;

-- ── Storage taklidi ────────────────────────────────────────────────
-- Supabase Storage dosyanın kaydını storage.objects'e İSTEĞİ YAPAN
-- KULLANICININ rolüyle yazar ve okur; satır kuralları (RLS) burada da
-- geçerlidir. Taklit yalnızca kuralların sınandığı iki tabloyu kurar.
create schema if not exists storage;
create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[]
);
create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets(id),
  name        text not null,
  owner       uuid default auth.uid(),
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant select on storage.buckets to anon, authenticated;
