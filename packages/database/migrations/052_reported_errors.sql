-- 052_reported_errors.sql
--
-- Reported errors: when a user hits an ActionableError banner, they can
-- click "Report" to push the full blob (code, title, detail, raw, url,
-- user, when) into this table for triage. Mirrors a lightweight Sentry
-- — capturing only what the user explicitly reports, not every failure.
--
-- Triage flow:
--   open → in_progress → resolved | wont_fix
--
-- Operational table, not tier-1 (no soft-delete). Records can be physically
-- deleted by admins via the standard manage permission.

create table if not exists public.reported_errors (
  id              uuid        primary key default gen_random_uuid(),
  -- Snapshot of the ActionableError at report time. Title/detail are kept
  -- as text rather than referencing a separate matchers table because the
  -- copy may evolve and we want the record to stay accurate to what the
  -- user saw.
  code            text        not null,
  title           text        not null,
  detail          text,
  raw             text,
  -- Where it happened.
  url             text,
  user_agent      text,
  -- Who saw it. Nullable so reports made before sign-in (rare) still land.
  reported_by     uuid        references auth.users(id) on delete set null,
  reported_at     timestamptz not null default now(),
  -- Triage.
  status          text        not null default 'open'
                              check (status in ('open','in_progress','resolved','wont_fix')),
  resolution_note text,
  resolved_by     uuid        references auth.users(id) on delete set null,
  resolved_at     timestamptz
);

create index if not exists reported_errors_status_idx
  on public.reported_errors (status, reported_at desc);
create index if not exists reported_errors_code_idx
  on public.reported_errors (code, reported_at desc);
create index if not exists reported_errors_reported_by_idx
  on public.reported_errors (reported_by, reported_at desc);

comment on table public.reported_errors is 'reported error';

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.reported_errors enable row level security;

-- Any signed-in user can insert their own report; reported_by must match
-- auth.uid() to keep this from being abused as a generic write endpoint.
drop policy if exists reported_errors_insert_self on public.reported_errors;
create policy reported_errors_insert_self
  on public.reported_errors
  for insert
  to authenticated
  with check (reported_by = auth.uid());

-- Users can read back their own reports (so a future "my reports" page
-- works without admin elevation). Admins (manage permission) read all.
drop policy if exists reported_errors_select_own on public.reported_errors;
create policy reported_errors_select_own
  on public.reported_errors
  for select
  to authenticated
  using (
    reported_by = auth.uid()
    or exists (
      select 1
      from public.user_roles ur
      join public.permissions p on p.role_id = ur.role_id
      where ur.user_id = auth.uid()
        and p.resource = 'reported_errors'
        and p.action   = 'manage'
    )
  );

-- Only admins (reported_errors.manage) can update — triage actions.
drop policy if exists reported_errors_update_admin on public.reported_errors;
create policy reported_errors_update_admin
  on public.reported_errors
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      join public.permissions p on p.role_id = ur.role_id
      where ur.user_id = auth.uid()
        and p.resource = 'reported_errors'
        and p.action   = 'manage'
    )
  );

-- Only admins can delete a report.
drop policy if exists reported_errors_delete_admin on public.reported_errors;
create policy reported_errors_delete_admin
  on public.reported_errors
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      join public.permissions p on p.role_id = ur.role_id
      where ur.user_id = auth.uid()
        and p.resource = 'reported_errors'
        and p.action   = 'manage'
    )
  );

-- ─── Permissions seed ───────────────────────────────────────────────────
-- Admin-equivalent roles get reported_errors.manage. Mirrors the seeding
-- pattern other tier-2 admin tables use (system_logs etc.).
do $$
declare
  r record;
begin
  for r in
    select id from public.roles
    where name in ('admin', 'platform_admin', 'super_admin')
  loop
    insert into public.permissions (role_id, resource, action)
    values (r.id, 'reported_errors', 'manage')
    on conflict do nothing;

    insert into public.permissions (role_id, resource, action)
    values (r.id, 'reported_errors', 'read')
    on conflict do nothing;
  end loop;
end $$;

-- Audit trail: changelog trigger picks this up via the migration-030
-- "every public table" sweep, but this table didn't exist then. Attach
-- explicitly so triage edits land in /changelog like everything else.
drop trigger if exists changelog_reported_errors on public.reported_errors;
create trigger changelog_reported_errors
  after insert or update or delete on public.reported_errors
  for each row execute function public.change_log_trigger();

notify pgrst, 'reload schema';
