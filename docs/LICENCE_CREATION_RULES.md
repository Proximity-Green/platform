# Licence creation — rules + onboarding plan

Status: **scoping**, no code yet. Captured during the 2026-04-30 / 05-01
session so the rules survive across conversations. Treat this as the source
of truth for the next coding parcel.

Companion docs (separate parcels):
- `docs/PRICING_AND_FORECAST.md` — per-sub-line rules (escalation, discount) +
  the org-default JSON shape that seeds new sub lines.
- `docs/SUBSCRIPTION_UPGRADE_DOWNGRADE.md` — atomic transitions between
  products, scheduled vs immediate, multi-option proposal flow,
  self-service for members with permissions.
- `docs/ONBOARDING.md` — onboarding & offboarding orchestration across
  WiFi / printing / access control sub-systems.

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

Extracted to `docs/SUBSCRIPTION_UPGRADE_DOWNGRADE.md`. The licence-creation
service exposes `createLicence(...)`; the upgrade/downgrade service
exposes `applyChange(...)` / `proposeChange(...)`. Both are atomic at the
licence ↔ sub level. Open questions about the actor model (primary
member, org-admin role) are the same blocker — answered once, applies to
both parcels.

## Onboarding & offboarding

Extracted to `docs/ONBOARDING.md`. The licence-creation service calls
`fireOnboardingHook(...)` when a licence is current at creation and the
member's `onboarded_at IS NULL`; calls `fireOffboardingHook(...)` when
ending a licence leaves the member with zero current licences.

The hooks are the only contact between this parcel and the onboarding
parcel — everything else (orchestration, sub-system integrations, queue
UI) lives over there.

## Side-effects to wire when the service exists

When `createLicence(...)` succeeds:
1. Insert the licence + paired sub atomically (the RPC already does this).
2. Copy current org defaults from `organisations.default_sub_rules` (JSON)
   into a fresh `subscription_line_rules` row for this sub. See
   `docs/PRICING_AND_FORECAST.md` for the JSON shape.
3. If the licence is current at creation, call `fireOnboardingHook(...)`.
4. Log the operation in `change_log` (the existing tier-1 trigger handles
   this for licences and subs, so probably nothing to add here — but verify).

## Out of scope for this parcel
- The onboarding queue UI / table.
- WiFi / printing / access-control integrations.
- Multi-tenant org-admin role model.
- Bulk licence operations.
- Price escalation (covered by the separate parcel — see `docs/PRICING_AND_FORECAST.md`).
