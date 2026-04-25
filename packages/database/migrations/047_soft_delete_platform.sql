-- 047_soft_delete_platform.sql
--
-- Universal soft-delete foundation. Adds deleted_at to tier-1 tables, swaps
-- conflicting unique constraints for partial indexes, exposes a `live_*` view
-- per table that hides soft-deleted rows, ships a generic bulk_soft_delete
-- RPC + undo branch, and a retention purge.
--
-- Convention going forward:
--   * App code reads from `live_<table>` (these views filter deleted_at IS NULL).
--   * App code writes to base tables. Triggers fire on writes only on base.
--   * Soft-delete a row: `update <table> set deleted_at = now() where id = ?`.
--   * Hard-delete (purge): only via `purge_soft_deleted(...)` admin RPC.
--
-- Scope (tier 1, 18 tables):
--   items, item_types, tracking_codes, tags,
--   locations, spaces,
--   persons, organisations, legal_entities,
--   contracts, subscription_lines, subscription_option_groups, licenses,
--   notes, feature_requests, message_templates, approved_domains, wallets
--
-- Out of scope (audit/log, junctions, detail tables, auth/session,
-- financial-status-driven): see plan.

-- ─── 1. Add deleted_at column ───────────────────────────────────────────
alter table public.items                       add column if not exists deleted_at timestamptz;
alter table public.item_types                  add column if not exists deleted_at timestamptz;
alter table public.tracking_codes              add column if not exists deleted_at timestamptz;
alter table public.tags                        add column if not exists deleted_at timestamptz;
alter table public.locations                   add column if not exists deleted_at timestamptz;
alter table public.spaces                      add column if not exists deleted_at timestamptz;
alter table public.persons                     add column if not exists deleted_at timestamptz;
alter table public.organisations               add column if not exists deleted_at timestamptz;
alter table public.legal_entities              add column if not exists deleted_at timestamptz;
alter table public.contracts                   add column if not exists deleted_at timestamptz;
alter table public.subscription_lines          add column if not exists deleted_at timestamptz;
alter table public.subscription_option_groups  add column if not exists deleted_at timestamptz;
alter table public.licenses                    add column if not exists deleted_at timestamptz;
alter table public.notes                       add column if not exists deleted_at timestamptz;
alter table public.feature_requests            add column if not exists deleted_at timestamptz;
alter table public.message_templates           add column if not exists deleted_at timestamptz;
alter table public.approved_domains            add column if not exists deleted_at timestamptz;
alter table public.wallets                     add column if not exists deleted_at timestamptz;

-- ─── 2. Partial indexes on deleted_at for trash queries ─────────────────
-- Common path (deleted_at IS NULL) is the majority — no index needed; the
-- view's filter is cheap. But trash views benefit from a partial index.
create index if not exists items_deleted_idx                       on public.items                      (deleted_at) where deleted_at is not null;
create index if not exists item_types_deleted_idx                  on public.item_types                 (deleted_at) where deleted_at is not null;
create index if not exists tracking_codes_deleted_idx              on public.tracking_codes             (deleted_at) where deleted_at is not null;
create index if not exists tags_deleted_idx                        on public.tags                       (deleted_at) where deleted_at is not null;
create index if not exists locations_deleted_idx                   on public.locations                  (deleted_at) where deleted_at is not null;
create index if not exists spaces_deleted_idx                      on public.spaces                     (deleted_at) where deleted_at is not null;
create index if not exists persons_deleted_idx                     on public.persons                    (deleted_at) where deleted_at is not null;
create index if not exists organisations_deleted_idx               on public.organisations              (deleted_at) where deleted_at is not null;
create index if not exists legal_entities_deleted_idx              on public.legal_entities             (deleted_at) where deleted_at is not null;
create index if not exists contracts_deleted_idx                   on public.contracts                  (deleted_at) where deleted_at is not null;
create index if not exists subscription_lines_deleted_idx          on public.subscription_lines         (deleted_at) where deleted_at is not null;
create index if not exists subscription_option_groups_deleted_idx  on public.subscription_option_groups (deleted_at) where deleted_at is not null;
create index if not exists licenses_deleted_idx                    on public.licenses                   (deleted_at) where deleted_at is not null;
create index if not exists notes_deleted_idx                       on public.notes                      (deleted_at) where deleted_at is not null;
create index if not exists feature_requests_deleted_idx            on public.feature_requests           (deleted_at) where deleted_at is not null;
create index if not exists message_templates_deleted_idx           on public.message_templates          (deleted_at) where deleted_at is not null;
create index if not exists approved_domains_deleted_idx            on public.approved_domains           (deleted_at) where deleted_at is not null;
create index if not exists wallets_deleted_idx                     on public.wallets                    (deleted_at) where deleted_at is not null;

-- ─── 3. Rewrite unique constraints to ignore soft-deleted rows ──────────
-- Inline column-level UNIQUEs become partial indexes. This frees the slot
-- when a row is soft-deleted, so users can recreate with the same key.

-- locations.slug
alter table public.locations drop constraint if exists locations_slug_key;
create unique index if not exists locations_slug_key
  on public.locations (slug) where deleted_at is null;

-- organisations.slug
alter table public.organisations drop constraint if exists organisations_slug_key;
create unique index if not exists organisations_slug_key
  on public.organisations (slug) where deleted_at is null;

-- persons.email
alter table public.persons drop constraint if exists persons_email_key;
create unique index if not exists persons_email_key
  on public.persons (email) where deleted_at is null;

-- message_templates.slug
alter table public.message_templates drop constraint if exists message_templates_slug_key;
create unique index if not exists message_templates_slug_key
  on public.message_templates (slug) where deleted_at is null;

-- item_types.slug
alter table public.item_types drop constraint if exists item_types_slug_key;
create unique index if not exists item_types_slug_key
  on public.item_types (slug) where deleted_at is null;

-- tags.name
alter table public.tags drop constraint if exists tags_name_key;
create unique index if not exists tags_name_key
  on public.tags (name) where deleted_at is null;

-- wallets (organisation_id, currency)
alter table public.wallets drop constraint if exists wallets_organisation_id_currency_key;
create unique index if not exists wallets_organisation_id_currency_key
  on public.wallets (organisation_id, currency) where deleted_at is null;

-- Existing partial indexes — extend WHERE clause to include deleted_at IS NULL.
-- Drop and recreate so the new condition applies.

drop index if exists public.items_wsm_id_key;
create unique index if not exists items_wsm_id_key
  on public.items (wsm_id) where wsm_id is not null and deleted_at is null;

drop index if exists public.organisations_wsm_id_key;
create unique index if not exists organisations_wsm_id_key
  on public.organisations (wsm_id) where wsm_id is not null and deleted_at is null;

drop index if exists public.organisations_short_name_key;
create unique index if not exists organisations_short_name_key
  on public.organisations (short_name) where short_name is not null and deleted_at is null;

drop index if exists public.locations_wsm_id_key;
create unique index if not exists locations_wsm_id_key
  on public.locations (wsm_id) where wsm_id is not null and deleted_at is null;

drop index if exists public.locations_short_name_key;
create unique index if not exists locations_short_name_key
  on public.locations (short_name) where short_name is not null and deleted_at is null;

-- spaces.wsm_id was dropped in 040 when the table was recreated as a
-- saved-query. No partial unique to rewrite.
drop index if exists public.spaces_wsm_id_key;

drop index if exists public.licenses_wsm_id_key;
create unique index if not exists licenses_wsm_id_key
  on public.licenses (wsm_id) where wsm_id is not null and deleted_at is null;

drop index if exists public.contracts_wsm_id_key;
create unique index if not exists contracts_wsm_id_key
  on public.contracts (wsm_id) where wsm_id is not null and deleted_at is null;

drop index if exists public.subscription_lines_wsm_id_key;
create unique index if not exists subscription_lines_wsm_id_key
  on public.subscription_lines (wsm_id) where wsm_id is not null and deleted_at is null;

drop index if exists public.subscription_lines_license_id_active_key;
create unique index if not exists subscription_lines_license_id_active_key
  on public.subscription_lines (license_id)
  where license_id is not null
    and status not in ('superseded','cancelled','expired')
    and deleted_at is null;

-- tracking_codes — was previously (location_id, code) without WHERE.
drop index if exists public.tracking_codes_code_key;
create unique index if not exists tracking_codes_code_key
  on public.tracking_codes (location_id, code) where deleted_at is null;

drop index if exists public.tracking_codes_primary_key;
create unique index if not exists tracking_codes_primary_key
  on public.tracking_codes (location_id) where is_primary = true and deleted_at is null;

-- ─── 4. live_<table> views ──────────────────────────────────────────────
-- security_invoker = true so RLS on the base table applies through the view
-- (Postgres 15+). App code reads from these.

create or replace view public.live_items                       with (security_invoker = true) as select * from public.items                       where deleted_at is null;
create or replace view public.live_item_types                  with (security_invoker = true) as select * from public.item_types                  where deleted_at is null;
create or replace view public.live_tracking_codes              with (security_invoker = true) as select * from public.tracking_codes              where deleted_at is null;
create or replace view public.live_tags                        with (security_invoker = true) as select * from public.tags                        where deleted_at is null;
create or replace view public.live_locations                   with (security_invoker = true) as select * from public.locations                   where deleted_at is null;
create or replace view public.live_spaces                      with (security_invoker = true) as select * from public.spaces                      where deleted_at is null;
create or replace view public.live_persons                     with (security_invoker = true) as select * from public.persons                     where deleted_at is null;
create or replace view public.live_organisations               with (security_invoker = true) as select * from public.organisations               where deleted_at is null;
create or replace view public.live_legal_entities              with (security_invoker = true) as select * from public.legal_entities              where deleted_at is null;
create or replace view public.live_contracts                   with (security_invoker = true) as select * from public.contracts                   where deleted_at is null;
create or replace view public.live_subscription_lines          with (security_invoker = true) as select * from public.subscription_lines          where deleted_at is null;
create or replace view public.live_subscription_option_groups  with (security_invoker = true) as select * from public.subscription_option_groups  where deleted_at is null;
create or replace view public.live_licenses                    with (security_invoker = true) as select * from public.licenses                    where deleted_at is null;
create or replace view public.live_notes                       with (security_invoker = true) as select * from public.notes                       where deleted_at is null;
create or replace view public.live_feature_requests            with (security_invoker = true) as select * from public.feature_requests            where deleted_at is null;
create or replace view public.live_message_templates           with (security_invoker = true) as select * from public.message_templates           where deleted_at is null;
create or replace view public.live_approved_domains            with (security_invoker = true) as select * from public.approved_domains            where deleted_at is null;
create or replace view public.live_wallets                     with (security_invoker = true) as select * from public.wallets                     where deleted_at is null;

-- Grants — service_role reads everywhere; mirror table grants for consistency.
do $$
declare
  v_view text;
begin
  foreach v_view in array array[
    'live_items','live_item_types','live_tracking_codes','live_tags',
    'live_locations','live_spaces',
    'live_persons','live_organisations','live_legal_entities',
    'live_contracts','live_subscription_lines','live_subscription_option_groups','live_licenses',
    'live_notes','live_feature_requests','live_message_templates','live_approved_domains','live_wallets'
  ] loop
    execute format('grant select on public.%I to service_role, authenticated, anon', v_view);
  end loop;
end$$;

-- ─── 5. bulk_soft_delete_apply RPC ──────────────────────────────────────
-- Generic flag-delete for any tier-1 table. Whitelisted to prevent abuse.
-- Snapshots ids only (rows are still in base table; undo flips deleted_at).
create or replace function public.bulk_soft_delete_apply(
  p_table text,
  p_ids uuid[],
  p_performed_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bulk_id uuid;
  v_count int;
begin
  if p_table not in (
    'items','item_types','tracking_codes','tags',
    'locations','spaces',
    'persons','organisations','legal_entities',
    'contracts','subscription_lines','subscription_option_groups','licenses',
    'notes','feature_requests','message_templates','approved_domains','wallets'
  ) then
    raise exception 'soft-delete not enabled for table: %', p_table;
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'no ids supplied';
  end if;

  execute format(
    'update public.%I set deleted_at = now() where id = any($1) and deleted_at is null',
    p_table
  ) using p_ids;
  get diagnostics v_count = row_count;

  insert into bulk_actions (action, performed_by, params, snapshot, affected_count, notes)
  values (
    'bulk_soft_delete',
    p_performed_by,
    jsonb_build_object('table', p_table, 'ids', to_jsonb(p_ids)),
    jsonb_build_object('table', p_table, 'ids', to_jsonb(p_ids)),
    v_count,
    format('Soft-deleted %s row(s) from %s', v_count, p_table)
  )
  returning id into v_bulk_id;

  return v_bulk_id;
end;
$$;

revoke all on function public.bulk_soft_delete_apply(text, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.bulk_soft_delete_apply(text, uuid[], uuid) to service_role;

comment on function public.bulk_soft_delete_apply(text, uuid[], uuid) is
  'Soft-delete (flag deleted_at = now()) rows in any tier-1 table. Records bulk_actions row for undo.';

-- ─── 6. Extend bulk_action_undo with bulk_soft_delete branch ───────────
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

-- ─── 7. purge_soft_deleted retention RPC ────────────────────────────────
-- Hard-deletes rows where deleted_at is older than the cutoff. Default 90d.
-- Safe to call manually; can also be wired to pg_cron.
create or replace function public.purge_soft_deleted(
  p_table text,
  p_older_than interval default interval '90 days'
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_table not in (
    'items','item_types','tracking_codes','tags',
    'locations','spaces',
    'persons','organisations','legal_entities',
    'contracts','subscription_lines','subscription_option_groups','licenses',
    'notes','feature_requests','message_templates','approved_domains','wallets'
  ) then
    raise exception 'purge not enabled for table: %', p_table;
  end if;

  execute format(
    'delete from public.%I where deleted_at is not null and deleted_at < now() - $1',
    p_table
  ) using p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_soft_deleted(text, interval) from public, anon, authenticated;
grant execute on function public.purge_soft_deleted(text, interval) to service_role;

comment on function public.purge_soft_deleted(text, interval) is
  'Hard-delete rows soft-deleted older than the cutoff. Default 90 days. Wire to pg_cron for nightly retention.';

-- ─── 8. Permission seed ─────────────────────────────────────────────────
-- Per-table delete permission. admin/super_admin get all.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'items','item_types','tracking_codes','tags',
    'locations','spaces',
    'persons','organisations','legal_entities',
    'contracts','subscription_lines','subscription_option_groups','licenses',
    'notes','feature_requests','message_templates','approved_domains','wallets'
  ] loop
    insert into permissions (role_id, resource, action)
    select r.id, 'bulk_actions', 'delete_' || v_table
      from roles r
     where r.name in ('admin', 'super_admin')
    on conflict do nothing;
  end loop;
end$$;
