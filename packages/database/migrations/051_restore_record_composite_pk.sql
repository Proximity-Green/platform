-- 051_restore_record_composite_pk.sql
--
-- Fix: restore_record() hardcoded `where id = $1`, which fails with
--   ERROR: column "id" does not exist
-- on tables whose primary key is not a single `id` column — most notably
-- junction tables like public.item_tracking_codes whose PK is
--   (item_id, tracking_code_id).
--
-- The audit trigger (migration 031) already handles this by picking the
-- first PK column dynamically and storing the full row in old_values, so
-- the change_log entry is correct — only the restore path was broken.
--
-- New behaviour:
--   * Look up the table's primary-key column(s) from pg_index.
--   * Build the WHERE clause from those column(s), reading values out of
--     the snapshot (p_new_values).
--   * Single-`id` PK behaviour is unchanged (the loop just produces
--     `t.id::text = ($1->>'id')` which is equivalent to the old form for
--     uuid keys).
--   * For junction tables that have no non-PK columns, the UPDATE branch
--     short-circuits; only the INSERT branch (re-create from snapshot)
--     does meaningful work. That's the recovery path users actually hit
--     because junctions get hard-deleted (no soft-delete on junctions).

create or replace function public.restore_record(
  p_table_name text,
  p_record_id uuid,
  p_new_values jsonb,
  p_changed_by uuid
)
returns void as $$
declare
  _current  jsonb;
  _cols     text;
  _vals     text;
  _exists   bool;
  _pk_cols  text[];
  _where    text;
begin
  perform set_config('app.suppress_audit', 'true', true);

  -- Pull the primary-key column list from pg_index. ARRAY_AGG with
  -- ordinality keeps composite-PK columns in their declared order, which
  -- doesn't strictly matter for our equality WHERE but is tidy.
  select array_agg(a.attname order by array_position(i.indkey, a.attnum))
    into _pk_cols
  from pg_index i
  join pg_attribute a
    on a.attrelid = i.indrelid
   and a.attnum   = ANY(i.indkey)
  where i.indrelid = format('public.%I', p_table_name)::regclass
    and i.indisprimary;

  if _pk_cols is null or array_length(_pk_cols, 1) = 0 then
    raise exception 'restore_record: no primary key found on public.%', p_table_name;
  end if;

  -- Build "t.col::text = ($1->>'col')" for each PK column, AND-joined.
  -- Casting both sides to text means uuid / int / text PKs all work
  -- without per-type branching.
  select string_agg(format('t.%I::text = ($1->>%L)', col, col), ' AND ')
    into _where
  from unnest(_pk_cols) as col;

  -- Snapshot the current row (or null if it's been hard-deleted) using the
  -- PK-driven WHERE we just built.
  execute format('select to_jsonb(t.*) from public.%I t where %s', p_table_name, _where)
    into _current
    using p_new_values;
  _exists := _current is not null;

  if _exists then
    -- UPDATE path — row still there (soft-delete or stale). Write the
    -- snapshot back. Skip PK columns and created_at; rewriting a PK is a
    -- no-op at best and a constraint violation at worst.
    select
      string_agg(quote_ident(k), ','),
      string_agg('r.' || quote_ident(k), ',')
    into _cols, _vals
    from jsonb_object_keys(p_new_values) k
    where k <> 'created_at' and k <> all(_pk_cols);

    -- For junction tables there may be no non-PK columns to set; in that
    -- case there's literally nothing to UPDATE. Skip the EXECUTE rather
    -- than building invalid SQL like `set () = (...)`.
    if _cols is not null then
      execute format(
        'update public.%I as t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1) as r) where %s',
        p_table_name, _cols, _vals, p_table_name, _where
      ) using p_new_values;
    end if;
  else
    -- INSERT path — row was hard-deleted (junction cascade, pg_cron purge,
    -- or pre-soft-delete app code). Re-create from snapshot. Keep PK
    -- columns this time so the restored row matches the original key(s).
    select
      string_agg(quote_ident(k), ','),
      string_agg('r.' || quote_ident(k), ',')
    into _cols, _vals
    from jsonb_object_keys(p_new_values) k
    where k <> 'created_at';

    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) as r',
      p_table_name, _cols, _vals, p_table_name
    ) using p_new_values;
  end if;

  perform set_config('app.suppress_audit', 'false', true);

  insert into public.change_log (table_name, record_id, action, changed_by, old_values, new_values)
  values (p_table_name, p_record_id, 'RESTORE', p_changed_by, _current, p_new_values);
end;
$$ language plpgsql security definer;
