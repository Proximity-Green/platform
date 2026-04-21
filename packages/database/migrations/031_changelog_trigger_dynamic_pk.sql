-- 031_changelog_trigger_dynamic_pk.sql
-- Fix: change_log_trigger hardcoded NEW.id / OLD.id, which breaks on tables
-- whose primary key is not called `id` (e.g. *_details.item_id).
--
-- New version looks up the first PK column from pg_index and extracts the
-- value via jsonb. Tables without a uuid PK are skipped (change_log.record_id
-- is NOT NULL uuid).

begin;

create or replace function public.change_log_trigger()
returns trigger as $$
declare
  _changed_by uuid;
  _pk_col     text;
  _pk_type    text;
  _record_id  uuid;
  _new_json   jsonb;
  _old_json   jsonb;
begin
  begin
    _changed_by := auth.uid();
  exception when others then
    _changed_by := null;
  end;

  -- First column of the primary key for this relation.
  select a.attname, format_type(a.atttypid, a.atttypmod)
    into _pk_col, _pk_type
  from pg_index i
  join pg_attribute a
    on a.attrelid = i.indrelid
   and a.attnum = ANY(i.indkey)
  where i.indrelid = TG_RELID and i.indisprimary
  order by array_position(i.indkey, a.attnum)
  limit 1;

  -- No PK or non-uuid PK → skip logging. We still have to return a row so the
  -- trigger doesn't reject the write.
  if _pk_col is null or _pk_type <> 'uuid' then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  if TG_OP = 'DELETE' then
    _old_json := to_jsonb(OLD);
    _record_id := (_old_json ->> _pk_col)::uuid;
    insert into public.change_log (table_name, record_id, action, changed_by, old_values)
    values (TG_TABLE_NAME, _record_id, 'DELETE', _changed_by, _old_json);
    return OLD;
  end if;

  _new_json := to_jsonb(NEW);
  _record_id := (_new_json ->> _pk_col)::uuid;

  if TG_OP = 'INSERT' then
    insert into public.change_log (table_name, record_id, action, changed_by, new_values)
    values (TG_TABLE_NAME, _record_id, 'INSERT', _changed_by, _new_json);
  elsif TG_OP = 'UPDATE' then
    _old_json := to_jsonb(OLD);
    if _old_json is distinct from _new_json then
      insert into public.change_log (table_name, record_id, action, changed_by, old_values, new_values)
      values (TG_TABLE_NAME, _record_id, 'UPDATE', _changed_by, _old_json, _new_json);
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

commit;
