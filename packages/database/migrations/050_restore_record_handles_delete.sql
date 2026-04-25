-- 050_restore_record_handles_delete.sql
--
-- Extend restore_record() so it recovers from BOTH:
--   * soft-deletes (row physically exists, has deleted_at set) → UPDATE
--   * hard-deletes (row no longer exists; e.g. pg_cron purge or pre-soft-
--     delete app code) → INSERT using the change_log snapshot
--
-- Before this migration the RPC only handled UPDATE — restoring a hard-
-- deleted row was a silent no-op. After this, the same restore button on
-- /changelog works for both cases.

create or replace function public.restore_record(
  p_table_name text,
  p_record_id uuid,
  p_new_values jsonb,
  p_changed_by uuid
)
returns void as $$
declare
  _current jsonb;
  _cols text;
  _vals text;
  _exists bool;
begin
  perform set_config('app.suppress_audit', 'true', true);

  -- Snapshot current state (or null if the row is gone).
  execute format('select to_jsonb(t.*) from public.%I t where id = $1', p_table_name)
    into _current using p_record_id;
  _exists := _current is not null;

  if _exists then
    -- UPDATE path — the row is still there (e.g. soft-deleted). Write
    -- old_values back; this also flips deleted_at to NULL when old_values
    -- carries deleted_at = null.
    select
      string_agg(quote_ident(k), ','),
      string_agg('r.' || quote_ident(k), ',')
    into _cols, _vals
    from jsonb_object_keys(p_new_values) k
    where k not in ('id', 'created_at');

    execute format(
      'update public.%I as t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1) as r) where t.id = $2',
      p_table_name, _cols, _vals, p_table_name
    ) using p_new_values, p_record_id;
  else
    -- INSERT path — the row was hard-deleted. Re-create from snapshot.
    -- Filter out generated/audit-only keys that the table will set itself.
    select
      string_agg(quote_ident(k), ','),
      string_agg('r.' || quote_ident(k), ',')
    into _cols, _vals
    from jsonb_object_keys(p_new_values) k
    where k not in ('created_at');   -- keep id so the restored row matches

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
