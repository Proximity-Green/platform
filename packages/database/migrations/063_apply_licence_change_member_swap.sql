-- ──────────────────────────────────────────────────────────────────────
-- 063_apply_licence_change_member_swap.sql
--
-- Widen apply_licence_change to also accept p_new_user_id, so the same
-- "end old + open new" primitive serves both upgrades AND member swaps
-- (e.g. Alice's seat reassigned to Bob).
--
-- Rationale: a licence's identity is (org, member, item, location). Any
-- of those changing means a new licence — same shape regardless of which
-- field moved. Modelling member swap as a separate flow would have meant
-- two parallel mechanics for what is conceptually the same transaction.
-- See docs/SUBSCRIPTION_LIFECYCLE.md "Edit vs end-and-new".
--
-- Behaviour:
--   - p_new_user_id null  → keep the old licence's user_id (upgrade flow)
--   - p_new_user_id set   → use it as the new licence + sub's user_id;
--                            validated to belong to the same organisation
--                            and not be soft-deleted.
-- Everything else (atomic end+open, supersedes link, snapshot rate,
-- cross-location, currency) is unchanged.
--
-- Drop the old 4-arg signature first; PostgREST sees the new one only.
-- ──────────────────────────────────────────────────────────────────────

drop function if exists public.apply_licence_change(uuid, uuid, timestamptz, uuid);

create or replace function public.apply_licence_change(
  p_old_licence_id uuid,
  p_new_item_id    uuid,
  p_effective_at   timestamptz,
  p_performed_by   uuid,
  p_new_user_id    uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old        licenses%rowtype;
  v_new_item   items%rowtype;
  v_new_user   uuid;
  v_new_lic    uuid;
  v_new_sub    uuid;
  v_old_sub    uuid;
  v_base_rate  numeric(12,2);
  v_currency   text;
  v_end_at     timestamptz;
  v_member_org uuid;
begin
  -- Old licence
  select * into v_old from licenses where id = p_old_licence_id and deleted_at is null;
  if not found then
    raise exception 'old licence missing or deleted: %', p_old_licence_id;
  end if;

  -- Decide the new licence's user. Default to keeping the existing one.
  v_new_user := coalesce(p_new_user_id, v_old.user_id);

  -- If the caller asked for a member swap, validate the new member.
  if p_new_user_id is not null and p_new_user_id is distinct from v_old.user_id then
    select organisation_id into v_member_org
      from persons
     where id = p_new_user_id
       and deleted_at is null;
    if not found then
      raise exception 'new member missing or deleted: %', p_new_user_id;
    end if;
    if v_member_org is distinct from v_old.organisation_id then
      raise exception 'new member belongs to a different organisation';
    end if;
  end if;

  -- New item — active, licence-requiring. Cross-location is allowed:
  -- the new licence + sub will live at the new item's location regardless
  -- of where the old one was.
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

  -- "Different from current" only matters when neither item nor member is
  -- changing — otherwise a same-item swap to a new member is a legitimate
  -- transaction (Alice → Bob on the same office).
  if p_new_item_id = v_old.item_id and v_new_user = v_old.user_id then
    raise exception 'no change requested — pick a different item or member';
  end if;

  -- Effective_at must be after the existing licence's start
  if p_effective_at <= v_old.started_at then
    raise exception 'effective_at must be after the old licence start';
  end if;

  -- Rate + currency from the new item / its location (catalog snapshot).
  v_base_rate := v_new_item.base_rate;
  select currency into v_currency from locations where id = v_new_item.location_id;

  v_end_at := p_effective_at - interval '1 day';

  -- End the old licence
  update licenses
     set ended_at = v_end_at,
         updated_at = now()
   where id = p_old_licence_id;

  -- Find and end the old paired sub (non-terminal status only)
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

  -- Open the new licence with the (possibly new) user_id.
  insert into licenses (item_id, location_id, organisation_id, user_id, started_at, ended_at, notes)
  values (p_new_item_id, v_new_item.location_id, v_old.organisation_id, v_new_user, p_effective_at, null, null)
  returning id into v_new_lic;

  -- Open the new paired sub. supersedes_subscription_line_id links to
  -- the previous row for audit / forecast continuity.
  insert into subscription_lines (
    license_id, organisation_id, location_id, user_id,
    base_rate, currency, quantity, frequency, interval_months,
    status, started_at, supersedes_subscription_line_id
  ) values (
    v_new_lic, v_old.organisation_id, v_new_item.location_id, v_new_user,
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
    'currency', coalesce(v_currency, 'ZAR'),
    'old_user_id', v_old.user_id,
    'new_user_id', v_new_user,
    'member_changed', (v_new_user is distinct from v_old.user_id)
  );
end;
$$;

revoke all on function public.apply_licence_change(uuid, uuid, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_licence_change(uuid, uuid, timestamptz, uuid, uuid) to service_role;

comment on function public.apply_licence_change(uuid, uuid, timestamptz, uuid, uuid) is
  'Atomic licence change. Ends old licence+sub at effective_at-1 day, opens new at effective_at with the new item.base_rate + new location.currency snapshotted. Optional p_new_user_id widens this to member swaps without a separate flow.';

notify pgrst, 'reload schema';
