# Onboarding & offboarding

Status: **scoping**, no code yet. Fourth design parcel alongside
`docs/LICENCE_CREATION_RULES.md`, `docs/PRICING_AND_FORECAST.md`, and
`docs/SUBSCRIPTION_UPGRADE_DOWNGRADE.md`.

Covers the cross-system orchestration that fires when a member becomes
active (onboarding) and when they leave (offboarding). Talks to multiple
external sub-systems (WiFi, printing, access control, email, etc.) so it
sits behind its own service and uses Trigger.dev for the external calls.

## How to use this doc

Same convention as the other parcel docs:

- **Pre-build (now)** — the design contract. Read it, edit it. Rules get
  locked in here before any code is written.
- **Post-build** — the living reference for *why* the code is shaped the
  way it is.

**When to update:** rule changes during a design conversation; code drifts
from a rule during build; new requirement surfaces post-ship (append, don't
rewrite — old rules marked `~~superseded YYYY-MM~~`, not deleted).

**Rule numbering is stable.** Don't renumber when a rule is dropped.

**Audit trail = git history.** Every rule change is a commit with a clear
message.

**Audience:** solo dev + AI pair, *not* admins/operators. V1 ships from
these rules.

## Why a service?

Onboarding and offboarding are multi-step orchestrations across systems
the platform doesn't own — WiFi controllers, print servers, access-control
APIs, email lists. Any one of them can flake at the network edge. Doing
this work inline in the licence-creation flow would make a successful
licence insert dependent on a successful WiFi provisioning call, which is
the wrong coupling.

A `member-lifecycle.service.ts` (working name) consolidates the flows
behind one entry point. The service:

- Coordinates the sub-task sequence (in-process, transactional with the
  internal DB).
- Dispatches each external call as a **Trigger.dev** task so retries +
  observability + dead-letter handling come for free.
- Maintains the `onboarding_tasks` row that represents "the open job".

This matches the platform's runtime convention (see
`feedback_task_execution` memory): pg_cron / Node for internal /
bullet-proof; Trigger.dev for any path with a 3rd-party failure surface.

## Onboarding rules

1. **Onboarding fires on a current licence + non-onboarded member.** A
   licence is "current" when `started_at <= today` AND
   (`ended_at IS NULL` OR `ended_at > today`). A member is "onboarded"
   when `persons.onboarded_at IS NOT NULL`. The intersection — current
   licence + null onboarded_at — is exactly the work-list.

2. **Every current licence resolves to an onboarded member.** A current
   licence is in one of two states only:
   - **Onboarded** — `persons.onboarded_at IS NOT NULL`, fully reconciled.
   - **Pending onboarding** — sitting on the onboarding queue.

   No third state. The onboarding queue is the gap between the two.

3. **Onboarding is per-member, not per-licence.** A member with multiple
   current licences (rare, but possible — e.g. a desk + parking) gets
   onboarded once. Subsequent licences for the same person don't re-fire
   the onboarding flow — they may fire a *change* hook (see
   `SUBSCRIPTION_UPGRADE_DOWNGRADE.md`) but not a fresh onboarding.

4. **Sub-tasks succeed/fail/retry independently.** Each external system
   integration is its own Trigger.dev task with its own retry policy.
   The onboarding row tracks per-step status; the overall job is
   complete only when every step has succeeded (or been manually
   marked skipped/manual).

5. **Failure is visible, not silent.** A failed step keeps the
   onboarding row open with `status = 'pending'` on that step. The
   operator-facing onboarding queue page surfaces the failure so an
   operator can retry, mark manual, or escalate.

6. **`persons.onboarded_at` is set only when all required steps
   succeed.** A "required" step is configurable per location (some
   locations don't have printing, etc.). Optional steps can be missing
   without blocking the timestamp.

7. **Re-onboarding is allowed.** If a member offboards then later
   re-joins, the same flow runs again. `onboarded_at` is updated to
   the new completion time; the prior onboarding row is preserved as
   audit history.

## Offboarding rules

8. **Offboarding fires on the last licence ending OR explicit operator
   action.** Two triggers:
   - **Auto**: when a member's last current licence transitions to
     ended (or its `ended_at` arrives via the daily cron), an
     offboarding row is created.
   - **Explicit**: operator clicks "Offboard" on a member; the action
     ends any current licences first (via the licence-creation
     service), then creates the offboarding row.

9. **Symmetric to Rule 2: every offboarded member has no current
   licences.** Offboarding cannot complete while a current licence
   exists for the member. The auto-trigger naturally satisfies this;
   the explicit trigger ends licences as part of the same transaction.

10. **Sub-task reversal.** Each external integration that ran during
    onboarding has a corresponding reversal step:

    | Onboarding step | Offboarding step |
    |---|---|
    | Create WiFi user | Disable WiFi user |
    | Create print account | Disable print account |
    | Issue access card | Deactivate / collect access card |
    | Add to welcome list | Remove from internal lists |
    | Send welcome email | Send goodbye email |

    Each reversal is its own Trigger.dev task. Same retry / observability
    semantics as onboarding.

11. **`persons.offboarded_at` is set only when all reversal steps
    succeed.** Same pattern as Rule 6. `persons.status` flips to
    `'offboarded'` at the same moment.

12. **Data retention is separate.** Offboarding does **not** soft-delete
    the `persons` row. The member's record stays for audit, historical
    invoicing, re-onboarding, and reporting. Soft-delete is a separate
    operator action (or a retention policy down the line — out of scope
    here).

13. **Offboarding is reversible until complete.** A scheduled offboarding
    (created by the auto-trigger but not yet processed by cron) can be
    cancelled before it runs — for example if the operator extends the
    last licence. After completion, "reversing" means re-onboarding
    (Rule 7).

## Schema — `onboarding_tasks` table

Both onboarding and offboarding share one table; the `kind` column
disambiguates.

```sql
create table public.onboarding_tasks (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  kind            text not null check (kind in ('onboard', 'offboard')),
  person_id       uuid not null references public.persons(id),
  licence_id      uuid references public.licenses(id),  -- the trigger licence (onboard only)
  location_id     uuid not null references public.locations(id),

  status          text not null default 'pending'
                  check (status in ('pending', 'in_progress', 'completed', 'cancelled', 'failed')),
  due_at          timestamptz,
  assignee_user_id uuid references auth.users(id),

  -- per-step state. shape: [{ key, label, required, status, started_at, done_at, error, trigger_run_id }]
  steps           jsonb not null default '[]'::jsonb,

  notes           text,
  completed_at    timestamptz
);

create index onboarding_tasks_person_idx on public.onboarding_tasks (person_id);
create index onboarding_tasks_status_idx on public.onboarding_tasks (status) where status in ('pending','in_progress');
create index onboarding_tasks_kind_idx   on public.onboarding_tasks (kind);
```

JSON `steps` shape rather than a separate `onboarding_task_steps` table:
the step set is small (~5–10 per kind), evolves as new sub-systems get
integrated, and we don't query *across* steps in hot paths.

## Hooks — entry points from other services

The licence-creation service and the subscription-change service call
into this parcel via two functions:

- `fireOnboardingHook({ person_id, licence_id, location_id })`
  - Called from `licence-creation.service.ts` when a licence is current
    at creation AND the member's `onboarded_at IS NULL`.
  - Also called from `subscription-change.service.ts` when a Mode A
    change opens a member's *first* current licence (re-onboarding
    after a gap).

- `fireOffboardingHook({ person_id })`
  - Called from `licence-creation.service.ts` when ending a licence
    leaves the member with zero current licences.
  - Also called from an explicit operator action on `/people/[id]`.

Both hooks return immediately after writing the `onboarding_tasks` row.
The actual sub-task dispatch happens via Trigger.dev tasks chained off
the row's INSERT (or via a coordinator polling for new rows).

## External integrations

Each integration is its own Trigger.dev task:

- `apps/web/src/trigger/onboard-wifi.ts`
- `apps/web/src/trigger/onboard-print.ts`
- `apps/web/src/trigger/onboard-access.ts`
- `apps/web/src/trigger/onboard-welcome-email.ts`
- (paired offboard- variants)

Each task:
1. Reads its slice of the `onboarding_tasks.steps` JSON.
2. Calls the external API.
3. Writes back per-step status (`done`, `error`, `started_at`, etc.).
4. On success of all required steps, the coordinator promotes the row
   to `completed` and stamps `persons.onboarded_at` /
   `offboarded_at`.

## Self-service / member-facing

Out of scope for v1. Operators run onboarding and offboarding. A future
parcel may expose "complete your profile" / "request offboarding" flows
to members directly — but the orchestration sits behind the same
service either way.

## Future build — what this parcel needs

### Migrations
1. `onboarding_tasks` table + indexes (above).
2. New permission seeds:
   - `onboarding.read`, `onboarding.update`, `onboarding.complete_step`
3. (Possibly) location-level config for "which steps are required at
   this location" — `locations.onboarding_required_steps text[]` or
   embedded in a JSON column.

### Services
1. `member-lifecycle.service.ts`:
   - `fireOnboardingHook(...)` — entry point.
   - `fireOffboardingHook(...)` — entry point.
   - `markStepDone(task_id, step_key, payload)` — called by Trigger.dev
     tasks after each external API succeeds.
   - `markStepFailed(task_id, step_key, error)` — same, on failure.
   - `completeIfReady(task_id)` — checks all required steps done,
     promotes row + stamps `persons.{on,off}boarded_at`.
   - `cancel(task_id)` — operator cancel.

### Trigger.dev tasks
1. One task per external integration (above list). Each task is small,
   idempotent (safe to retry), and writes its own result back.

### Cron
1. Daily walk to catch licences whose `ended_at` arrived overnight →
   auto-fire offboarding hook for any member left with zero current
   licences. **Use pg_cron / Node, not Trigger.dev** — internal,
   transactionally clean.

### UI
- **Onboarding queue page** (`/onboarding`): list of pending +
  in_progress onboarding rows, per-step status visible, retry / mark
  manual / cancel actions.
- **Offboarding queue page** (`/offboarding` or filter on the same
  page by `kind`): same shape.
- **Member detail page** (`/people/[id]`): show a compact onboarding
  status card if a row is open. "View details" jumps to the queue
  page.
- **Admin settings**: per-location editor for which steps are
  required.

## Open questions

- **Step set per location** — is the same set of steps run everywhere,
  or does each location define its own (e.g. 20 Kloof has print but
  Tabakhuis doesn't)? Schema above supports per-location override;
  default to platform-wide list?
- **Manual mark-as-done** — does an operator clicking "mark step done
  manually" count the same as a successful Trigger.dev run? Probably
  yes, with a flag distinguishing the source for audit.
- **Re-trigger semantics** — if a step fails 3 times and Trigger.dev
  gives up, does the operator retry from the queue UI, and does that
  reset the failure count?
- **Welcome email content** — templated per location, per item type, or
  one shared template? Likely per location at minimum.
- **Access-card workflow** — physical issuance can't be fully automated
  ("hand the new member a card"); the step is more of a checklist
  item the operator marks done. Confirm.
- **Notification to operators** — when a step fails, does the queue
  page suffice, or do we need email/Slack pings?

## Out of scope for this parcel

- The actual external API integrations (WiFi controller specifics,
  print server API, access-control vendor API). Each is a follow-up
  parcel once the orchestrator + table + UI are in place.
- Member-facing self-service flows.
- Soft-delete / hard-purge of offboarded members.
- Bulk re-onboarding (e.g. "we changed WiFi vendor — re-provision
  everyone"). Doable on the same primitive but not surfaced in v1 UI.
