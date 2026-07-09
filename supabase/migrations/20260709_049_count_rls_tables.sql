-- Compliance report (#98) support: expose a count of public tables with RLS
-- enabled so the admin compliance page can report row-level-security coverage
-- without granting the client access to pg_catalog directly.
--
-- SECURITY DEFINER so it can read pg_class under a restricted role; the function
-- only returns an aggregate integer (no row data), so it is safe to grant.

create or replace function public.count_rls_enabled_tables()
returns int
language sql
security definer
set search_path = public, pg_catalog
as $$
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and c.relrowsecurity = true
    and n.nspname = 'public';
$$;

grant execute on function public.count_rls_enabled_tables() to anon, authenticated, service_role;
