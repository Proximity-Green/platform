-- ──────────────────────────────────────────────────────────────────────
-- 058_licence_change_proposals.sql
--
-- L2 of the upgrade/downgrade flow per docs/SUBSCRIPTION_LIFECYCLE.md:
-- "Save as proposal" lets an operator stage a licence change for
-- approval before it's applied. Once approved, the existing
-- apply_licence_change RPC fires.
--
-- Why a dedicated table instead of subscription_option_groups +
-- status='option': the existing enforce_subscription_line_item_rules
-- trigger blocks item_id-backed subscription_lines for licence-
-- requiring item types. A draft option sub with item_id pointing at a
-- membership would be rejected. Cleaner to keep the proposal as its
-- own first-class entity that's *intent* rather than a dummy sub line.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.licence_change_proposals (
  id                  uuid primary key default uuid_generate_v4(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  source_licence_id   uuid not null references public.licenses(id),
  new_item_id         uuid not null references public.items(id),
  effective_at        timestamptz not null,

  status              text not null default 'pending'
                      check (status in ('pending','approved','rejected','cancelled')),

  proposed_by         uuid,                          -- references auth.users(id), keep nullable for system-proposed
  proposed_notes      text,

  decided_by          uuid,                          -- approver / rejecter
  decided_at          timestamptz,
  decided_notes       text,

  -- Once approved AND the underlying apply_licence_change has fired,
  -- record the new ids so the audit trail closes.
  applied_at          timestamptz,
  applied_licence_id  uuid references public.licenses(id),
  applied_subscription_line_id uuid references public.subscription_lines(id)
);

create index if not exists licence_change_proposals_source_idx
  on public.licence_change_proposals (source_licence_id);
create index if not exists licence_change_proposals_status_idx
  on public.licence_change_proposals (status)
  where status in ('pending','approved');
create index if not exists licence_change_proposals_effective_idx
  on public.licence_change_proposals (effective_at);

-- One open proposal per source licence at a time (multiple pending
-- proposals would race each other when applied; force the operator to
-- decide on the existing one first).
create unique index if not exists licence_change_proposals_one_open
  on public.licence_change_proposals (source_licence_id)
  where status = 'pending';

comment on table public.licence_change_proposals is
  'Staged licence upgrade/downgrade proposals awaiting approval. Once approved, apply_licence_change runs and applied_* fields capture the resulting ids.';

-- ─── Capability permission seeds ─────────────────────────────────────
insert into permissions (role_id, resource, action)
select r.id, 'subscriptions', a
  from roles r
 cross join unnest(array['propose','approve_proposal']) a
 where r.name in ('admin', 'super_admin')
on conflict do nothing;

notify pgrst, 'reload schema';
