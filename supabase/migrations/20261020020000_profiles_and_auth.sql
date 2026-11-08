-- =============================================================================
-- Migration 02 — customer profiles and the auth ↔ profile link
-- Plants & Pure Limited · Phase 1
--
-- Problems in the existing schema this fixes
--   * public.profiles has RLS enabled but NO policy: every client read/write is
--     denied, so the app could never show or save a profile.
--   * Nothing creates a profile when a user registers.
--   * Nothing stops a customer from granting themselves role = 'admin' once a
--     profile UPDATE policy exists.
--
-- Design
--   * handle_new_user() — trigger on auth.users, idempotent, never lets a
--     profile problem block registration, never reads `role` from user metadata.
--   * ensure_my_profile() — self-healing RPC for users whose profile is missing.
--   * Column-level privileges: customers may UPDATE only their contact/delivery
--     fields. `role` and `id` are not grantable to them.
--   * Trigger guard as a second, independent barrier for role / id changes.
--   * Admins are created ONLY through the documented trusted process (SQL
--     editor / service role) — see docs/DATABASE.md.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internal: provision a profile row from an auth user's *whitelisted* metadata.
-- ---------------------------------------------------------------------------
create or replace function public.provision_profile(p_user_id uuid, p_meta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := case when jsonb_typeof(p_meta) = 'object' then p_meta else '{}'::jsonb end;
  v_phone text := case when jsonb_typeof(meta -> 'phone') = 'string' then btrim(meta ->> 'phone') end;
begin
  -- Only plain strings are accepted, and a phone that would violate the table's
  -- CHECK is dropped rather than letting it block provisioning.
  insert into public.profiles (id, first_name, last_name, phone)
  values (
    p_user_id,
    case when jsonb_typeof(meta -> 'first_name') = 'string'
         then nullif(left(btrim(meta ->> 'first_name'), 80), '') end,
    case when jsonb_typeof(meta -> 'last_name') = 'string'
         then nullif(left(btrim(meta ->> 'last_name'), 80), '') end,
    case when v_phone ~ '^[0-9+()\-\s]{6,32}$' then v_phone end
  )
  on conflict (id) do nothing;      -- idempotent: never overwrites an existing profile
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.provision_profile(new.id, new.raw_user_meta_data);
  return new;
exception when others then
  -- Registration must not fail because of a profile problem; the user can be
  -- healed later by ensure_my_profile(). The warning lands in the Postgres log.
  raise warning 'handle_new_user: profile provisioning failed for user %: % (SQLSTATE %)',
    new.id, sqlerrm, sqlstate;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Self-healing RPC for the signed-in user (e.g. after a failed provisioning).
-- ---------------------------------------------------------------------------
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  meta jsonb;
  result public.profiles;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select u.raw_user_meta_data into meta from auth.users u where u.id = uid;
  if not found then
    raise exception 'Auth user not found' using errcode = '28000';
  end if;

  perform public.provision_profile(uid, meta);
  select * into result from public.profiles where id = uid;
  return result;
end;
$$;

revoke all on function public.provision_profile(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.handle_new_user()              from public, anon, authenticated;
revoke all on function public.ensure_my_profile()            from public, anon;
grant  execute on function public.ensure_my_profile()        to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill: give every existing auth user a profile (idempotent).
-- ---------------------------------------------------------------------------
select public.provision_profile(u.id, u.raw_user_meta_data)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ---------------------------------------------------------------------------
-- Integrity: profile fields
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'profiles_phone_format' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_phone_format
      check (phone is null or phone ~ '^[0-9+()\-\s]{6,32}$') not valid;
    alter table public.profiles validate constraint profiles_phone_format;
  end if;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Guard: id is immutable; role changes only from trusted database roles.
-- SECURITY INVOKER on purpose, so current_user is the *real* caller:
--   authenticated / anon  → PostgREST client  → rejected
--   service_role          → our server code   → allowed
--   postgres / supabase_admin → SQL editor / migrations → allowed
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Changing a profile role is not permitted for role %', current_user
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

revoke all on function public.guard_profile_privileged_columns() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone, delivery_address, delivery_area)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_own   on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using ((select public.is_admin()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT or DELETE policy and no INSERT/DELETE grant: profiles are created by
-- the trigger / ensure_my_profile() and removed only by the auth.users cascade.
