-- =============================================================================
-- LOCAL TEST SHIM, part 2 — NEVER APPLY TO A REAL SUPABASE PROJECT
-- Applied AFTER the baseline dump has (re)created the public schema.
-- Reproduces how a fresh Supabase project exposes the public schema:
--   * the API roles can use the schema
--   * every existing and future table / sequence / function in it is granted to
--     anon, authenticated and service_role (so "RLS is the only protection")
--   * the "automatically enable RLS" event trigger created by the dashboard
--     option (its function rls_auto_enable() is in the baseline dump)
-- The migrations must tighten this; the tests prove that they do.
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
