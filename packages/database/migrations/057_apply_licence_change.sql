-- ──────────────────────────────────────────────────────────────────────
-- 057_apply_licence_change.sql
--
-- Atomic licence upgrade/downgrade. The "V7 composition" from
-- docs/SUBSCRIPTION_LIFECYCLE.md: end the old licence + sub at
-- effective_at - 1 day, open a new licence + sub at effective_at with
-- the new item's catalog rate snapshotted.
--
-- One statement so the 1:1 licence ↔ sub invariant is never broken even
-- for a moment. Used by the upgrade-licence flow on /organisations/[id].
--
-- Constraints enforced inside the function (raise on violation):
--   - old licence exists and isn't soft-deleted
--   - new item exists, is active, not soft-deleted, requires_license = true
--   - new item is at the same location as the old licence
--   - new item is different from the old one
--   - effective_at is strictly after the old licence's started_at
--
-- Returns the new ids + rate snapshot so the UI can merge optimistically.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.apply_licence_change(
  p_old_licence_id uuid,
  p_new_item_id    uuid,
  p_effective_at   timestamptz,
  p_performed_by   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old        licenses%rowtype;
  v_new_item   items%rowtype;
  v_new_lic    uuid;
  v_new_sub    uuid;
  v_old_sub    uuid;
  v_base_rate  numeric(12,2);
  v_currency   text;
  v_end_at     timestamptz;
begin
  -- Old licence
  select * into v_old from licenses where id = p_old_licence_id and deleted_at is null;
  if not found then
    raise exception 'old licence missing or deleted: %', p_old_licence_id;
  end if;

  -- New item — active, licence-requiring, same location, different from current
  select i.* into v_new_item
    from items i
    join item_types it on it.id = i.item_type_id and it.deleted_at is null
   where i.id = p_new_item_id
     and i.deleted_at is null
     and i.active = true
     and it.requires_license = true;
  if not found then
    raise exception 'new item missing, inactive, soft-deleted, or not licence-requiring: %', p_new_item_id;
  end if;
  if v_new_item.location_id is distinct from v_old.location_id then
    raise exception 'new item must be at the same location as the old licence';
  end if;
  if p_new_item_id = v_old.item_id then
    raise exception 'new item must be different from the current one';
  end if;

  -- Effective_at must be after the existing licence's start
  if p_effective_at <= v_old.started_at then
    raise exception 'effective_at must be after the old licence start';
  end if;

  -- Rate + currency context for the new paired sub
  v_base_rate := v_new_item.base_rate;
  select currency into v_currency from locations where id = v_old.location_id;

  v_end_at := p_effective_at - interval '1 day';

  -- End the old licence
  update licenses
     set ended_at = v_end_at,
         updated_at = now()
   where id = p_old_licence_id;

  -- Find and end the old paired sub (filter to non-terminal status so a
  -- previous superseded row from an earlier change isn't touched)
  select id into v_old_sub
    from subscription_lines
   where license_id = p_old_licence_id
     and status not in ('superseded','cancelled','expired','ended')
   order by created_at desc
   limit 1;
  if v_old_sub is not null then
    update subscription_lines
       set status = 'superseded',
           ended_at = v_end_at,
           updated_at = now()
     where id = v_old_sub;
  end if;

  -- Open the new licence (open-ended)
  insert into licenses (item_id, location_id, organisation_id, user_id, started_at, ended_at, notes)
  values (p_new_item_id, v_old.location_id, v_old.organisation_id, v_old.user_id, p_effective_at, null, null)
  returning id into v_new_lic;

  -- Open the new paired sub. supersedes_subscription_line_id links the
  -- new row to the previous one for audit / forecast continuity.
  insert into subscription_lines (
    license_id, organisation_id, location_id, user_id,
    base_rate, currency, quantity, frequency, interval_months,
    status, started_at, supersedes_subscription_line_id
  ) values (
    v_new_lic, v_old.organisation_id, v_old.location_id, v_old.user_id,
    coalesce(v_base_rate, 0), coalesce(v_currency, 'ZAR'), 1, 'monthly', 1,
    'draft', p_effective_at, v_old_sub
  )
  returning id into v_new_sub;

  return jsonb_build_object(
    'old_licence_id', p_old_licence_id,
    'old_subscription_line_id', v_old_sub,
    'new_licence_id', v_new_lic,
    'new_subscription_line_id', v_new_sub,
    'effective_at', p_effective_at,
    'base_rate', coalesce(v_base_rate, 0),
    'currency', coalesce(v_currency, 'ZAR')
  );
end;
$$;

revoke all on function public.apply_licence_change(uuid, uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.apply_licence_change(uuid, uuid, timestamptz, uuid) to service_role;

comment on function public.apply_licence_change(uuid, uuid, timestamptz, uuid) is
  'Atomic licence upgrade/downgrade. Ends old licence+sub at effective_at-1 day, opens new at effective_at with item.base_rate snapshotted. Maintains 1:1 invariant.';
