-- =============================================================================
-- LOCAL TEST SHIM — NEVER APPLY TO A REAL SUPABASE PROJECT
-- =============================================================================
-- Recreates the small part of a Supabase project that our schema depends on, so
-- the migrations and row-level-security rules can be tested on a plain
-- PostgreSQL server (e.g. `docker run postgres:17`):
--   * the API roles  anon / authenticated / service_role / authenticator
--   * the `auth` schema: auth.users, auth.uid(), auth.role(), auth.jwt()
-- Real Supabase already has all of this; do not run this file there.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;
-- The test runner connects as a superuser/owner and switches role with SET ROLE.

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_app_meta_data   jsonb not null default '{}'::jsonb,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  email_confirmed_at  timestamptz,
  created_at          timestamptz not null default now()
);

-- Same GUC contract as PostgREST/Supabase: request.jwt.claims holds the JWT.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;
grant select on auth.users to service_role;
