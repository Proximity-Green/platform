-- 038_bulk_feature_requests.sql
-- Bulk actions for feature requests: set status + add tags. Both record an
-- undoable snapshot in public.bulk_actions (migration 034) and are reversible
-- through the extended bulk_action_undo RPC below.

-- ─── bulk_set_fr_status_apply ───────────────────────────────────────────
create or replace function public.bulk_set_fr_status_apply(
  p_fr_ids uuid[],
  p_status text,
  p_performed_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_action_id uuid;
  v_applied int;
begin
  if p_status not in ('new', 'triaged', 'planned', 'in_progress', 'done') then
    raise exception 'invalid status: %', p_status;
  end if;

  -- Snapshot previous statuses of only the rows we'll touch.
  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'status', status)),
    '[]'::jsonb
  )
    into v_snapshot
    from feature_requests
   where id = any(p_fr_ids);

  update feature_requests
     set status = p_status
   where id = any(p_fr_ids);
  get diagnostics v_applied = row_count;

  insert into bulk_actions (action, performed_by, params, snapshot, affected_count)
  values (
    'bulk_set_fr_status',
    p_performed_by,
    jsonb_build_object('status', p_status),
    v_snapshot,
    v_applied
  )
  returning id into v_action_id;

  return v_action_id;
end;
$$;

revoke all on function public.bulk_set_fr_status_apply(uuid[], text, uuid) from public, anon, authenticated;
grant execute on function public.bulk_set_fr_status_apply(uuid[], text, uuid) to service_role;

comment on function public.bulk_set_fr_status_apply(uuid[], text, uuid) is
  'Atomic bulk status change for feature_requests with snapshot. Returns bulk_actions.id for undo.';

-- ─── bulk_add_fr_tags_apply ─────────────────────────────────────────────
-- Adds each of p_tag_ids to each of p_fr_ids. Skips pairs already assigned
-- (unique constraint). Snapshot records only the (fr_id, tag_id) pairs that
-- were genuinely newly inserted, so undo removes only those rows and leaves
-- pre-existing tag assignments untouched.
create or replace function public.bulk_add_fr_tags_apply(
  p_fr_ids uuid[],
  p_tag_ids uuid[],
  p_performed_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_action_id uuid;
  v_applied int;
begin
  with inserted as (
    insert into tag_assignments (entity_type, entity_id, tag_id, created_by)
    select 'feature_request', fr.id, t.id, p_performed_by
      from unnest(p_fr_ids) as fr(id)
      cross join unnest(p_tag_ids) as t(id)
    on conflict (entity_type, entity_id, tag_id) do nothing
    returning entity_id, tag_id
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('fr_id', entity_id, 'tag_id', tag_id)),
    '[]'::jsonb
  ),
  count(*)::int
    into v_snapshot, v_applied
    from inserted;

  insert into bulk_actions (action, performed_by, params, snapshot, affected_count)
  values (
    'bulk_add_fr_tags',
    p_performed_by,
    jsonb_build_object('tag_ids', to_jsonb(p_tag_ids), 'fr_ids', to_jsonb(p_fr_ids)),
    v_snapshot,
    v_applied
  )
  returning id into v_action_id;

  return v_action_id;
end;
$$;

revoke all on function public.bulk_add_fr_tags_apply(uuid[], uuid[], uuid) from public, anon, authenticated;
grant execute on function public.bulk_add_fr_tags_apply(uuid[], uuid[], uuid) to service_role;

comment on function public.bulk_add_fr_tags_apply(uuid[], uuid[], uuid) is
  'Atomic bulk tag addition for feature_requests. Snapshots only newly-added pairs so undo is surgical. Returns bulk_actions.id.';

-- ─── bulk_action_undo (extended) ────────────────────────────────────────
-- Re-declare to add branches for the two feature-request action types.
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

notify pgrst, 'reload schema';
