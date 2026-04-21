-- 030_changelog_all_tables.sql
-- Retroactively attach public.change_log_trigger to every public table that
-- doesn't already have one. Ensures new tables (item_types, items, invoices,
-- contracts, wallets, tracking_codes, *_details, …) are logged alongside the
-- originals from migration 006.
--
-- Going forward, new migrations should create the per-table trigger in the
-- same migration that creates the table. Re-running this migration is safe —
-- it skips tables that already have changelog_<table>.

begin;

do $$
declare
  t record;
  -- Tables to exclude: meta/log tables and anything high-churn where auditing
  -- would either recurse or just add noise.
  skip_list text[] := ARRAY[
    'change_log',
    'system_logs',
    'audit_log',
    'schema_migrations'
  ];
begin
  for t in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'                -- ordinary tables only
      and c.relname <> ALL(skip_list)
      and not exists (
        select 1 from pg_trigger tr
        where tr.tgrelid = c.oid
          and tr.tgname = 'changelog_' || c.relname
          and not tr.tgisinternal
      )
    order by c.relname
  loop
    execute format(
      'create trigger changelog_%I after insert or update or delete on public.%I for each row execute function public.change_log_trigger()',
      t.table_name, t.table_name
    );
    raise notice 'changelog trigger attached: %', t.table_name;
  end loop;
end $$;

commit;
