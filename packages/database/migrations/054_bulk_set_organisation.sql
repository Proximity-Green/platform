-- ──────────────────────────────────────────────────────────────────────
-- 054_bulk_set_organisation.sql
--
-- Adds a bulk action to set persons.organisation_id for many rows at once.
-- Mirrors bulk_set_first_name pattern: snapshot → update → record bulk
-- action → undo branch in bulk_action_undo.
--
-- Surfaced in /people list as the "Set Organisation…" bulk button. Useful
-- for testing the licence flow on /organisations/[id] without clicking
-- through every member individually.
-- ──────────────────────────────────────────────────────────────────────

-- ─── bulk_set_organisation_apply ───────────────────────────────────────
-- p_organisation_id may be null to clear the org assignment.
create or replace function public.bulk_set_organisation_apply(
  p_person_ids uuid[],
  p_organisation_id uuid,
  p_performed_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_bulk_id uuid;
  v_org_name text;
begin
  if p_person_ids is null or array_length(p_person_ids, 1) is null then
    raise exception 'no person ids supplied';
  end if;

  if p_organisation_id is not null then
    select name into v_org_name from organisations where id = p_organisation_id and deleted_at is null;
    if v_org_name is null then
      raise exception 'organisation not found or deleted: %', p_organisation_id;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'organisation_id', organisation_id)), '[]'::jsonb)
    into v_snapshot
    from persons
   where id = any(p_person_ids);

  update persons set organisation_id = p_organisation_id where id = any(p_person_ids);

  insert into bulk_actions (action, performed_by, params, snapshot, affected_count, notes)
  values (
    'bulk_set_organisation',
    p_performed_by,
    jsonb_build_object('organisation_id', p_organisation_id),
    v_snapshot,
    array_length(p_person_ids, 1),
    case
      when p_organisation_id is null
        then format('Cleared organisation on %s persons', array_length(p_person_ids, 1))
      else format('Set organisation to "%s" on %s persons', v_org_name, array_length(p_person_ids, 1))
    end
  )
  returning id into v_bulk_id;

  return v_bulk_id;
end;
$$;

revoke all on function public.bulk_set_organisation_apply(uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.bulk_set_organisation_apply(uuid[], uuid, uuid) to service_role;

comment on function public.bulk_set_organisation_apply(uuid[], uuid, uuid) is
  'Atomic bulk persons.organisation_id assignment with snapshot. Returns bulk_actions.id for undo.';

-- ─── extend bulk_action_undo with bulk_set_organisation branch ─────────
-- Re-creating the function in full so the new elsif sits alongside the
-- existing branches (set_role, set_first_name, set_fr_status, add_fr_tags,
-- update_items, soft_delete) — must match 047_soft_delete_platform.sql.
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
  v_table text;
  v_ids uuid[];
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

  elsif v_row.action = 'bulk_set_organisation' then
    update persons p
       set organisation_id = nullif(s.elem->>'organisation_id', '')::uuid
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

  elsif v_row.action = 'bulk_soft_delete' then
    v_table := v_row.params->>'table';
    if v_table not in (
      'items','item_types','tracking_codes','tags',
      'locations','spaces',
      'persons','organisations','legal_entities',
      'contracts','subscription_lines','subscription_option_groups','licenses',
      'notes','feature_requests','message_templates','approved_domains','wallets'
    ) then
      raise exception 'soft-delete undo not enabled for table: %', v_table;
    end if;

    select array_agg((s)::uuid)
      into v_ids
      from jsonb_array_elements_text(v_row.params->'ids') s;

    if v_ids is not null and array_length(v_ids, 1) > 0 then
      execute format(
        'update public.%I set deleted_at = null where id = any($1) and deleted_at is not null',
        v_table
      ) using v_ids;
      get diagnostics v_restored = row_count;
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

-- ─── Capability permission seed ──────────────────────────────────────
insert into permissions (role_id, resource, action)
select r.id, 'bulk_actions', 'set_organisation'
  from roles r
 where r.name in ('admin', 'super_admin')
on conflict do nothing;
