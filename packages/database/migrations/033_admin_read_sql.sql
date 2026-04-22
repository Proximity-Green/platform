-- 033_admin_read_sql.sql
-- RPC that lets the admin AI chat run ad-hoc read-only SELECT / WITH queries
-- against the public schema. SECURITY DEFINER + service_role grant only.
-- Multiple guard rails:
--   1. Must start with select or with (after trim + lower).
--   2. Rejects a blocklist of DML/DDL/TCL keywords even inside the query body
--      (insert / update / delete / drop / truncate / alter / grant / revoke /
--       create / copy / comment / vacuum / refresh / call / do / commit / rollback).
--   3. Wraps the caller's query in `select jsonb_agg(t) from (<q>) t` and hard-caps
--      the row count via an outer LIMIT 500 so one bad query can't dump the DB.
--   4. execute is granted to service_role only; the function body enforces
--      read_only transaction characteristics before running.
-- This is for a single-tenant POC admin UI; do NOT ship to multi-tenant prod
-- without revisiting the surface area.

create or replace function public.admin_read_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalised text := lower(btrim(query));
  result jsonb;
  blocked text[] := array[
    'insert','update','delete','drop','truncate','alter','grant','revoke',
    'create','copy','comment on','vacuum','refresh','call','commit','rollback',
    'reassign','reindex','cluster','listen','notify','unlisten','security definer',
    ';--','into ','pg_sleep','dblink','pg_read_file','pg_write_file'
  ];
  kw text;
begin
  if normalised is null or normalised = '' then
    raise exception 'empty query';
  end if;
  if not (normalised like 'select%' or normalised like 'with%') then
    raise exception 'only SELECT or WITH queries are allowed';
  end if;
  foreach kw in array blocked loop
    if position(kw in normalised) > 0 then
      raise exception 'disallowed keyword in query: %', kw;
    end if;
  end loop;

  set local transaction_read_only = on;
  set local statement_timeout = '5s';

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) _inner limit 500) t',
    query
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_read_sql(text) from public, anon, authenticated;
grant execute on function public.admin_read_sql(text) to service_role;

comment on function public.admin_read_sql(text) is
  'Read-only SQL runner for the admin AI chat. SELECT/WITH only, hard-capped at 500 rows, 5s timeout, service_role only.';
