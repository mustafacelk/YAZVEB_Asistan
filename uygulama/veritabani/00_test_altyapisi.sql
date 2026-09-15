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
