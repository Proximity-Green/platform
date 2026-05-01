-- ──────────────────────────────────────────────────────────────────────
-- 056_add_licence_with_sub.sql
--
-- Atomic "add licence + paired draft subscription" RPC. Wraps three
-- previously-sequential round-trips (licence insert → item/location
-- lookup → sub insert) into a single statement so the org-page
-- Add Licence form feels instant.
--
-- Returns jsonb with both new ids so the UI can do an optimistic insert
-- without a follow-up SELECT.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.add_licence_with_sub(
  p_org_id          uuid,
  p_item_id         uuid,
  p_location_id     uuid,
  p_user_id         uuid,
  p_started_at      timestamptz,
  p_ended_at        timestamptz,
  p_notes           text,
  p_performed_by    uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_licence_id uuid;
  v_sub_id     uuid;
  v_base_rate  numeric(12,2);
  v_currency   text;
begin
  -- One lookup for both rate + currency context.
  select i.base_rate, l.currency
    into v_base_rate, v_currency
    from items i
    join locations l on l.id = p_location_id
   where i.id = p_item_id
     and i.deleted_at is null
     and l.deleted_at is null;

  if not found then
    raise exception 'item or location missing/deleted (item=%, location=%)', p_item_id, p_location_id;
  end if;

  insert into licenses (item_id, location_id, organisation_id, user_id, started_at, ended_at, notes)
  values (p_item_id, p_location_id, p_org_id, p_user_id, p_started_at, p_ended_at, p_notes)
  returning id into v_licence_id;

  insert into subscription_lines (
    license_id, organisation_id, location_id, user_id,
    base_rate, currency, quantity,
    frequency, interval_months,
    status, started_at, ended_at, notes
  ) values (
    v_licence_id, p_org_id, p_location_id, p_user_id,
    coalesce(v_base_rate, 0), coalesce(v_currency, 'ZAR'), 1,
    'monthly', 1,
    'draft', p_started_at, p_ended_at, p_notes
  )
  returning id into v_sub_id;

  return jsonb_build_object(
    'licence_id', v_licence_id,
    'subscription_line_id', v_sub_id,
    'base_rate', coalesce(v_base_rate, 0),
    'currency', coalesce(v_currency, 'ZAR')
  );
end;
$$;

revoke all on function public.add_licence_with_sub(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.add_licence_with_sub(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) to service_role;

comment on function public.add_licence_with_sub(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) is
  'Atomic licence + paired draft subscription_line insert. One DB round-trip; returns both new ids.';
