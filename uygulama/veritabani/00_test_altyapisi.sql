-- ═══════════════════════════════════════════════════════════════════
-- YALNIZCA TEST İÇİN — Supabase'in sağladığı parçaların sade taklidi.
-- Üretimde ÇALIŞTIRILMAZ; Supabase'de bunlar zaten vardır.
-- ═══════════════════════════════════════════════════════════════════
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);

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

-- Supabase'de bu izinler hazır gelir; taklitte elle veriyoruz.
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select on auth.users to authenticated;
