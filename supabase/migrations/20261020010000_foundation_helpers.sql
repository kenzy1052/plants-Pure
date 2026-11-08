-- =============================================================================
-- Migration 01 — foundation helpers
-- Plants & Pure Limited · Phase 1
--
-- Adds only helpers; changes no existing table. Safe to re-run.
--   * set_updated_at()      generic updated_at trigger
--   * current_app_role(), is_admin(), is_staff()   role helpers used by RLS
--
-- Security notes
--   * Helpers are SECURITY DEFINER with an empty search_path so they cannot be
--     hijacked by objects in other schemas, and so they can read public.profiles
--     without recursing into its RLS policies.
--   * Supabase grants EXECUTE on new public functions to anon/authenticated by
--     default. Every privileged function in this project therefore REVOKEs from
--     those roles explicitly (revoking from PUBLIC alone is not enough).
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- The role of the signed-in user, or NULL when anonymous / no profile yet.
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin'::public.user_role
     from public.profiles p
     where p.id = (select auth.uid())),
    false)
$$;

-- admin or dispatch (fulfilment staff)
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('admin'::public.user_role, 'dispatch'::public.user_role)
     from public.profiles p
     where p.id = (select auth.uid())),
    false)
$$;

revoke all on function public.set_updated_at()      from public, anon, authenticated;
revoke all on function public.current_app_role()    from public, anon, authenticated;
revoke all on function public.is_admin()            from public, anon, authenticated;
revoke all on function public.is_staff()            from public, anon, authenticated;

-- RLS policies call these as the querying role, so that role needs EXECUTE.
-- They only ever answer about the caller's own identity.
grant execute on function public.current_app_role() to anon, authenticated, service_role;
grant execute on function public.is_admin()         to anon, authenticated, service_role;
grant execute on function public.is_staff()         to anon, authenticated, service_role;

-- Stop FUTURE tables created by this role from being auto-exposed to the API
-- roles. Existing and new tables get explicit, minimal grants in each migration.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
