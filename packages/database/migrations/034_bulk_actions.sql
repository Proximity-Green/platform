-- 034_bulk_actions.sql
-- Undoable bulk operations. One row = one user action affecting many records.
-- Separate from change_log (which tracks per-row audit) because bulk ops are
-- semantically a single act the user performed, and should be undone as one.
--
-- Capability grants (permissions.resource = 'bulk_actions'):
--   action = 'set_role'  → may run bulkSetRole
--   action = 'invite'    → may run bulkInvite
--   action = 'email'     → may run bulkEmail
--   action = 'undo'      → may restore a previously applied bulk action
--
-- These are *function* permissions, not row permissions — we're granting the
-- right to invoke a capability, not touch a specific table. Same permissions
-- table, same requirePermission() call, different resource namespace.

create table if not exists public.bulk_actions (
  id uuid primary key default gen_random_uuid(),
  action text not null,                    -- 'bulk_set_role', 'bulk_invite', 'bulk_email', …
  performed_by uuid references auth.users(id) on delete set null,
  performed_at timestamptz not null default now(),
  params jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '[]'::jsonb,
  affected_count int not null default 0,
  notes text,
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null
);

create index if not exists bulk_actions_performed_at_idx on public.bulk_actions (performed_at desc);
create index if not exists bulk_actions_action_idx on public.bulk_actions (action);

comment on table public.bulk_actions is
  'Undo-able bulk operations. One row per user action (e.g. set role on 22 members). snapshot holds the pre-change state for restoration.';

-- ─── bulk_set_role_apply ────────────────────────────────────────────────
-- Atomically:
--   1. snapshot current user_roles rows for the affected users
--   2. delete those rows
--   3. insert the new (user_id, role_id) rows
--   4. record a bulk_actions row with the snapshot
-- Returns the new bulk_actions.id.
create or replace function public.bulk_set_role_apply(
  p_user_ids uuid[],
  p_role_id uuid,
  p_performed_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_role_name text;
  v_bulk_id uuid;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'no user ids supplied';
  end if;
  if p_role_id is null then
    raise exception 'role_id is required';
  end if;

  select name into v_role_name from roles where id = p_role_id;
  if v_role_name is null then
    raise exception 'role not found: %', p_role_id;
  end if;

  -- Snapshot pre-state: every user_roles row we're about to delete.
  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'role_id', role_id)), '[]'::jsonb)
    into v_snapshot
    from user_roles
   where user_id = any(p_user_ids);

  delete from user_roles where user_id = any(p_user_ids);

  insert into user_roles (user_id, role_id)
  select uid, p_role_id from unnest(p_user_ids) as uid
  on conflict do nothing;

  insert into bulk_actions (action, performed_by, params, snapshot, affected_count, notes)
  values (
    'bulk_set_role',
    p_performed_by,
    jsonb_build_object('role_id', p_role_id, 'role_name', v_role_name),
    v_snapshot,
    array_length(p_user_ids, 1),
    format('Applied role "%s" to %s user(s)', v_role_name, array_length(p_user_ids, 1))
  )
  returning id into v_bulk_id;

  return v_bulk_id;
end;
$$;

revoke all on function public.bulk_set_role_apply(uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.bulk_set_role_apply(uuid[], uuid, uuid) to service_role;

-- ─── bulk_set_first_name_apply ─────────────────────────────────────────
-- Testing-friendly bulk action: set persons.first_name for many rows.
-- Snapshots prior first_names so the operation can be undone.
create or replace function public.bulk_set_first_name_apply(
  p_person_ids uuid[],
  p_first_name text,
  p_performed_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_bulk_id uuid;
begin
  if p_person_ids is null or array_length(p_person_ids, 1) is null then
    raise exception 'no person ids supplied';
  end if;
  if p_first_name is null or length(btrim(p_first_name)) = 0 then
    raise exception 'first_name is required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name)), '[]'::jsonb)
    into v_snapshot
    from persons
   where id = any(p_person_ids);

  update persons set first_name = p_first_name where id = any(p_person_ids);

  insert into bulk_actions (action, performed_by, params, snapshot, affected_count, notes)
  values (
    'bulk_set_first_name',
    p_performed_by,
    jsonb_build_object('first_name', p_first_name),
    v_snapshot,
    array_length(p_person_ids, 1),
    format('Set first_name to "%s" on %s persons', p_first_name, array_length(p_person_ids, 1))
  )
  returning id into v_bulk_id;

  return v_bulk_id;
end;
$$;

revoke all on function public.bulk_set_first_name_apply(uuid[], text, uuid) from public, anon, authenticated;
grant execute on function public.bulk_set_first_name_apply(uuid[], text, uuid) to service_role;

-- ─── bulk_action_undo ───────────────────────────────────────────────────
-- Restore the pre-change state from the snapshot. Idempotent guard: refuses
-- to undo twice. Currently handles 'bulk_set_role' — extend with elsif when
-- more bulk types gain undo support.
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
    -- Collect affected user_ids from the snapshot, plus any users currently
    -- holding the bulk-applied role (in case the snapshot was empty for them).
    select array_agg(distinct (s->>'user_id')::uuid)
      into v_affected_user_ids
      from jsonb_array_elements(v_row.snapshot) s;

    -- Include users who had no prior role but got the bulk role applied.
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

    -- Wipe current state for those users, then restore snapshot.
    if v_affected_user_ids is not null and array_length(v_affected_user_ids, 1) > 0 then
      delete from user_roles where user_id = any(v_affected_user_ids);
    end if;

    insert into user_roles (user_id, role_id)
    select (s->>'user_id')::uuid, (s->>'role_id')::uuid
      from jsonb_array_elements(v_row.snapshot) s
    on conflict do nothing;

    get diagnostics v_restored = row_count;

  elsif v_row.action = 'bulk_set_first_name' then
    -- Restore each person's original first_name from the snapshot.
    update persons p
       set first_name = (s.elem->>'first_name')
      from (select value as elem from jsonb_array_elements(v_row.snapshot)) s
     where p.id = (s.elem->>'id')::uuid;
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

comment on function public.bulk_set_role_apply(uuid[], uuid, uuid) is
  'Atomic bulk role assignment with snapshot. Returns bulk_actions.id for undo.';
comment on function public.bulk_action_undo(uuid, uuid) is
  'Restore the snapshot of a bulk_actions row. Idempotent-guarded.';

-- ─── Capability permission seeds ─────────────────────────────────────────
-- Grant super_admin + admin the bulk_actions capabilities. super_admin gets
-- everything implicitly via the 'all' shortcut in getUserPermissions(), but
-- we still seed explicit rows so a permissions UI can reflect them.
insert into permissions (role_id, resource, action)
select r.id, 'bulk_actions', a
  from roles r
 cross join unnest(array['set_role', 'set_first_name', 'invite', 'email', 'undo']) a
 where r.name in ('admin', 'super_admin')
on conflict do nothing;
