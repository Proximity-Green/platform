-- 046_bulk_update_items.sql
-- Items bulk-edit: GL code, location, tracking codes, tax code & tax percentage.
-- Modeled on the bulk_set_role / bulk_set_first_name pattern in 034.
-- Snapshots all touched fields so bulk_action_undo can fully restore.

-- ─── bulk_update_items_apply ─────────────────────────────────────────────
-- Generic items-patch RPC. p_patch is a JSONB object whose keys are columns
-- on items that may be updated: item_type_id, location_id, accounting_gl_code,
-- accounting_tax_code, accounting_tax_percentage, active.
-- Only keys present in the patch are touched — empty/missing keys leave the
-- column alone.
--
-- Tracking codes are managed separately via p_tc_op:
--   'replace' → wipe existing item_tracking_codes for these items, insert p_tc_ids
--   'add'     → insert p_tc_ids on top of existing (idempotent)
--   null      → leave links alone
--
-- Note: when location_id changes we MUST drop existing tracking codes since
-- the enforce_item_tracking_code_location() trigger forbids cross-location links.
create or replace function public.bulk_update_items_apply(
  p_item_ids uuid[],
  p_patch jsonb,
  p_tc_op text,
  p_tc_ids uuid[],
  p_performed_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_snapshot jsonb;
  v_tc_snapshot jsonb;
  v_bulk_id uuid;
  v_count int;
  v_has_type bool := p_patch ? 'item_type_id';
  v_has_loc bool := p_patch ? 'location_id';
  v_has_gl  bool := p_patch ? 'accounting_gl_code';
  v_has_tax_code bool := p_patch ? 'accounting_tax_code';
  v_has_tax_pct  bool := p_patch ? 'accounting_tax_percentage';
  v_has_active bool := p_patch ? 'active';
  v_tc_touched bool := (p_tc_op is not null) or v_has_loc;
  v_summary text;
begin
  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'no item ids supplied';
  end if;

  -- Snapshot every updateable column for every affected item.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'item_type_id', item_type_id,
    'location_id', location_id,
    'accounting_gl_code', accounting_gl_code,
    'accounting_tax_code', accounting_tax_code,
    'accounting_tax_percentage', accounting_tax_percentage,
    'active', active
  )), '[]'::jsonb)
    into v_items_snapshot
    from items
   where id = any(p_item_ids);

  -- Snapshot tracking-code links if we'll touch them.
  if v_tc_touched then
    select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', item_id,
      'tracking_code_id', tracking_code_id
    )), '[]'::jsonb)
      into v_tc_snapshot
      from item_tracking_codes
     where item_id = any(p_item_ids);
  else
    v_tc_snapshot := '[]'::jsonb;
  end if;

  -- Apply column patches. Each block is a no-op if the key is absent.
  if v_has_type then
    update items
       set item_type_id = nullif(p_patch->>'item_type_id', '')::uuid
     where id = any(p_item_ids);
  end if;

  if v_has_loc then
    update items
       set location_id = nullif(p_patch->>'location_id', '')::uuid
     where id = any(p_item_ids);
    -- Drop existing tracking codes — they belong to the old location.
    delete from item_tracking_codes where item_id = any(p_item_ids);
  end if;

  if v_has_gl then
    update items
       set accounting_gl_code = nullif(p_patch->>'accounting_gl_code', '')
     where id = any(p_item_ids);
  end if;

  if v_has_tax_code then
    update items
       set accounting_tax_code = nullif(p_patch->>'accounting_tax_code', '')
     where id = any(p_item_ids);
  end if;

  if v_has_tax_pct then
    update items
       set accounting_tax_percentage = nullif(p_patch->>'accounting_tax_percentage', '')::numeric
     where id = any(p_item_ids);
  end if;

  if v_has_active then
    update items
       set active = (p_patch->>'active')::bool
     where id = any(p_item_ids);
  end if;

  -- Apply tracking-code op (after location change so we're inserting against
  -- the new location).
  if p_tc_op = 'replace' then
    delete from item_tracking_codes where item_id = any(p_item_ids);
    if p_tc_ids is not null and array_length(p_tc_ids, 1) > 0 then
      insert into item_tracking_codes (item_id, tracking_code_id)
      select i, c
        from unnest(p_item_ids) i
       cross join unnest(p_tc_ids) c
      on conflict do nothing;
    end if;
  elsif p_tc_op = 'add' then
    if p_tc_ids is not null and array_length(p_tc_ids, 1) > 0 then
      insert into item_tracking_codes (item_id, tracking_code_id)
      select i, c
        from unnest(p_item_ids) i
       cross join unnest(p_tc_ids) c
      on conflict do nothing;
    end if;
  end if;

  v_count := array_length(p_item_ids, 1);

  -- Build a human summary based on what changed.
  v_summary := case
    when v_has_type     then 'type'
    when v_has_loc      then 'location'
    when v_has_gl       then 'GL code'
    when v_has_tax_code or v_has_tax_pct then 'tax'
    when v_has_active   then 'active'
    when p_tc_op is not null then 'tracking codes'
    else 'fields'
  end;

  insert into bulk_actions (action, performed_by, params, snapshot, affected_count, notes)
  values (
    'bulk_update_items',
    p_performed_by,
    jsonb_build_object(
      'patch', p_patch,
      'tc_op', p_tc_op,
      'tc_ids', to_jsonb(coalesce(p_tc_ids, array[]::uuid[])),
      'tc_touched', v_tc_touched
    ),
    jsonb_build_object('items', v_items_snapshot, 'tracking_codes', v_tc_snapshot),
    v_count,
    format('Bulk-updated %s on %s item(s)', v_summary, v_count)
  )
  returning id into v_bulk_id;

  return v_bulk_id;
end;
$$;

revoke all on function public.bulk_update_items_apply(uuid[], jsonb, text, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.bulk_update_items_apply(uuid[], jsonb, text, uuid[], uuid) to service_role;

comment on function public.bulk_update_items_apply(uuid[], jsonb, text, uuid[], uuid) is
  'Bulk-update items by JSONB patch (location, GL, tax) and optional tracking-code op (replace/add). Snapshots prior state. Returns bulk_actions.id for undo.';

-- ─── Extend bulk_action_undo with bulk_update_items branch ──────────────
-- Keeps every existing branch (bulk_set_role, bulk_set_first_name,
-- bulk_set_fr_status, bulk_add_fr_tags) intact and adds the items branch.
create or replace function public.bulk_action_undo(
  p_bulk_action_id uuid,
  p_undone_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row bulk_actions%rowtype;
  v_affected_user_ids uuid[];
  v_affected_item_ids uuid[];
  v_restored int := 0;
begin
  select * into v_row from bulk_actions where id = p_bulk_action_id for update;
  if not found then
    raise exception 'bulk action not found: %', p_bulk_action_id;
  end if;
  if v_row.undone_at is not null then
    raise exception 'bulk action already undone at %', v_row.undone_at;
  end if;

  if v_row.action = 'bulk_set_role' then
    select array_agg(distinct (s->>'user_id')::uuid)
      into v_affected_user_ids
      from jsonb_array_elements(v_row.snapshot) s;

    with applied as (
      select ur.user_id
        from user_roles ur
       where ur.role_id = (v_row.params->>'role_id')::uuid
         and ur.user_id = any(coalesce(v_affected_user_ids, array[]::uuid[]))
    )
    select array(select distinct uid from (
      select unnest(coalesce(v_affected_user_ids, array[]::uuid[])) as uid
      union
      select user_id from applied
    ) t) into v_affected_user_ids;

    if v_affected_user_ids is not null and array_length(v_affected_user_ids, 1) > 0 then
      delete from user_roles where user_id = any(v_affected_user_ids);
    end if;

    insert into user_roles (user_id, role_id)
    select (s->>'user_id')::uuid, (s->>'role_id')::uuid
      from jsonb_array_elements(v_row.snapshot) s
    on conflict do nothing;

    get diagnostics v_restored = row_count;

  elsif v_row.action = 'bulk_set_first_name' then
    update persons p
       set first_name = (s.elem->>'first_name')
      from (select value as elem from jsonb_array_elements(v_row.snapshot)) s
     where p.id = (s.elem->>'id')::uuid;
    get diagnostics v_restored = row_count;

  elsif v_row.action = 'bulk_set_fr_status' then
    update feature_requests fr
       set status = (s.elem->>'status')
      from (select value as elem from jsonb_array_elements(v_row.snapshot)) s
     where fr.id = (s.elem->>'id')::uuid;
    get diagnostics v_restored = row_count;

  elsif v_row.action = 'bulk_add_fr_tags' then
    delete from tag_assignments ta
     using (select value as elem from jsonb_array_elements(v_row.snapshot)) s
     where ta.entity_type = 'feature_request'
       and ta.entity_id = (s.elem->>'fr_id')::uuid
       and ta.tag_id    = (s.elem->>'tag_id')::uuid;
    get diagnostics v_restored = row_count;

  elsif v_row.action = 'bulk_update_items' then
    -- Restore items columns from the snapshot.
    update items i
       set item_type_id              = nullif(s.elem->>'item_type_id', '')::uuid,
           location_id               = nullif(s.elem->>'location_id', '')::uuid,
           accounting_gl_code        = s.elem->>'accounting_gl_code',
           accounting_tax_code       = s.elem->>'accounting_tax_code',
           accounting_tax_percentage = nullif(s.elem->>'accounting_tax_percentage', '')::numeric,
           active                    = (s.elem->>'active')::bool
      from (select value as elem from jsonb_array_elements(v_row.snapshot->'items')) s
     where i.id = (s.elem->>'id')::uuid;
    get diagnostics v_restored = row_count;

    -- If we touched tracking codes (either explicit op or location change),
    -- wipe current links for the affected items and replay the snapshot.
    if (v_row.params->>'tc_touched')::bool then
      select array_agg((s->>'id')::uuid)
        into v_affected_item_ids
        from jsonb_array_elements(v_row.snapshot->'items') s;

      if v_affected_item_ids is not null and array_length(v_affected_item_ids, 1) > 0 then
        delete from item_tracking_codes where item_id = any(v_affected_item_ids);
      end if;

      insert into item_tracking_codes (item_id, tracking_code_id)
      select (s->>'item_id')::uuid, (s->>'tracking_code_id')::uuid
        from jsonb_array_elements(v_row.snapshot->'tracking_codes') s
      on conflict do nothing;
    end if;

  else
    raise exception 'undo not implemented for action: %', v_row.action;
  end if;

  update bulk_actions
     set undone_at = now(), undone_by = p_undone_by
   where id = p_bulk_action_id;

  return jsonb_build_object(
    'ok', true,
    'restored', v_restored,
    'action', v_row.action
  );
end;
$$;

revoke all on function public.bulk_action_undo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bulk_action_undo(uuid, uuid) to service_role;

-- ─── Capability seed ────────────────────────────────────────────────────
insert into permissions (role_id, resource, action)
select r.id, 'bulk_actions', 'update_items'
  from roles r
 where r.name in ('admin', 'super_admin')
on conflict do nothing;
