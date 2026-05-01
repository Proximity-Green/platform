# Licence creation — rules + onboarding plan

Status: **scoping**, no code yet. Captured during the 2026-04-30 / 05-01
session so the rules survive across conversations. Treat this as the source
of truth for the next coding parcel.

Companion doc: `docs/PRICE_ESCALATION.md` covers the per-sub-line rules
(escalation, discount) and the org-default JSON shape — separate parcel.

## How to use this doc

This doc plays two roles depending on stage:

- **Pre-build (now)** — the design contract. Read it, edit it, get buy-in
  on it. Rules get locked in here before any code is written.
- **Post-build** — the living reference. Open it later to remember *why*
  the code is shaped the way it is.

**When to update:**
- A rule changes during a design conversation → update before any code lands.
- Code drifts from a rule during build → update the doc (or push back on
  the code). Out-of-sync docs are worse than missing docs.
- New requirement surfaces post-ship → **append, don't rewrite**. Add an
  amendment section dated. Old rules marked `~~superseded YYYY-MM~~`,
  not deleted.

**Rule numbering is stable.** Don't renumber when a rule is dropped — code
comments and old commits reference numbers. Drop the body, keep the slot.

**Audit trail = git history.** Every rule change is a commit with a clear
message. The repo log answers "when did Rule N change and why?".

**Audience for this doc**: solo dev + AI pair, *not* admins/operators.
WSM admins aren't doc-readers — getting feedback by handing them
markdown is theatre. **V1 ships from these rules; admin feedback comes
from using V1**. Then we amend the doc based on what real usage reveals.

## Why a service?

Today licence creation is splintered across four call sites:
- `licenses.service.ts:create()` — bare CRUD insert, no validation.
- `/licenses/+page.server.ts:create` action — uses the service as-is.
- `/organisations/[id]/+page.server.ts:addLicence` action — calls the
  `add_licence_with_sub` RPC (added in migration 056).
- `/organisations/[id]/+page.server.ts:createSub` action — creates a licence
  inline if `item_types.requires_license = true`.

Goal: a single `licence-creation.service.ts` that owns the rules. All four
entry points route through it.

## Rules (locked in)

1. **Required inputs**: a licence must have a Member (`user_id`), a Membership
   (item where `item_types.requires_license = true`), and may have a Space
   (`space_id` — optional, only used for reporting).
2. **Item must require licence**: `item_types.requires_license = true`. Reject
   otherwise.
3. **Item must be active and not soft-deleted**.
4. **Member belongs to org**: if `user_id` is set, `persons.organisation_id`
   must equal the licence's `organisation_id`. Hard reject (not warn).
5. **Location consistency**: input `location_id` must equal `item.location_id`,
   or auto-fill from the item.
6. **Date sanity**: `ended_at` (if set) must be ≥ `started_at`.
7. **No overlap, but future-dated is fine**: reject if another active licence
   for the same `(user_id, item_id, organisation_id)` has an overlapping date
   range. A start date *after* the current licence ends is allowed → enables
   scheduled upgrades / downgrades.
8. **Currency = `location.currency`. Rate = `item.base_rate`.** No overrides
   at creation time. Rate changes are made on the paired sub afterwards.
9. **Always pair licence + subscription_line, atomically.** No opt-out flag.
   The `add_licence_with_sub` RPC already does this in one round-trip.
10. **Subscription tab default-filters to currently-valid lines** (date range
    active, status not in superseded/cancelled/expired/ended). Historical subs
    reachable via "Show ended" toggle. Data layer keeps full history.
11. **Pricing is a snapshot at creation time.** A licence inherits its price
    from `item.base_rate` when created; that price is stored on the paired
    `subscription_lines.base_rate`. Subsequent changes to `items.base_rate`
    do **not** cascade to existing licences or subs — same principle as
    `invoice_lines`. Display surfaces (e.g. the org-page Licences Rate
    column) must read from the paired sub, not the item join.

### Invariant
> **1:1 licence ↔ subscription_line.** Always paired at creation, throughout
> life. UI filters what to display; data stays consistent.

## Upgrade / Downgrade

> **Rule 7 companion: upgrade / downgrade is a first-class operation.**
> Not a delete-and-create. The service exposes
> `upgradeLicence(currentId, newItemId, effectiveAt)` /
> `downgradeLicence(...)`. Same mechanics for both — direction is informational.
>
> Atomic effect:
> 1. Existing licence's `ended_at = effectiveAt - 1 day`
> 2. Existing paired sub's `status = 'superseded'` (or 'ended')
> 3. New licence opens with `started_at = effectiveAt`
> 4. New paired sub created at the new item's rate

### Actor model (open — needs schema check)
- Platform admin / super_admin — always (implicit).
- The org's **primary member**.
- Any org member with **org member admin** rights.

Open questions before encoding the actor model:
- Does the platform have a `primary_member_id` on `organisations` already?
  (`signatory_person_id` exists but that's a different concept.)
- Where would "org member admin" rights be tracked? On `persons`? On a new
  per-org junction (`organisation_members` with role)?

## Onboarding (separate parcel)

Onboarding talks to multiple sub-systems (WiFi, printing, access control) so
it deserves its own design / build. Don't bundle with the licence-creation
service. Instead:

> **Rule 12: On a licence becoming current, fire the onboarding hook.**
> Hook is a stub today (writes a TODO row to `system_logs`). When the
> onboarding system is built, the hook becomes the orchestrator entry point.
> No code outside the hook function changes.
>
> **Rule 13: Every current licence must resolve to an onboarded member.**
> A current licence is in one of two states:
> - **Onboarded** — `persons.onboarded_at IS NOT NULL`, fully reconciled.
> - **Pending onboarding** — sitting on the onboarding queue.
>
> No third state. The onboarding queue is the gap between the two.

### Future onboarding-system shape (tentative)
Probably a dedicated `onboarding_tasks` table with per-step status (wifi,
print account, access card, welcome email, induction meeting) so each
sub-system integration can succeed/fail/retry independently. Decide when
the first integration is built — the table shape will be obvious then.

**Runtime**: each step that calls an external sub-system (WiFi controller,
print server, access-control API) goes through **Trigger.dev**, not an
in-process worker. External APIs flake; Trigger.dev gives us durable
retries + visibility into failure. The internal coordinator that sequences
steps and updates `onboarding_tasks` rows can be plain Node/Postgres —
that part is bullet-proof. (See the `feedback_task_execution` memory for
the rule of thumb.)

## Side-effects to wire when the service exists

When `createLicence(...)` succeeds:
1. Insert the licence + paired sub atomically (the RPC already does this).
2. Copy current org defaults from `organisations.default_sub_rules` (JSON)
   into a fresh `subscription_line_rules` row for this sub. See
   `docs/PRICE_ESCALATION.md` for the JSON shape.
3. If the licence is current at creation, call `fireOnboardingHook(...)`.
4. Log the operation in `change_log` (the existing tier-1 trigger handles
   this for licences and subs, so probably nothing to add here — but verify).

## Out of scope for this parcel
- The onboarding queue UI / table.
- WiFi / printing / access-control integrations.
- Multi-tenant org-admin role model.
- Bulk licence operations.
- Price escalation (covered by the separate parcel — see `docs/PRICE_ESCALATION.md`).
