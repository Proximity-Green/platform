# Subscription lifecycle

Status: **scoping** — V1 in build (commit forthcoming). Consolidates
what was previously split across `LICENCE_CREATION_RULES.md`,
`PRICING_AND_FORECAST.md`, and `SUBSCRIPTION_UPGRADE_DOWNGRADE.md`
(deleted; full audit trail in git history).

Companion docs (separate parcels):
- `docs/ONBOARDING.md` — onboarding & offboarding orchestration.
- `docs/OCCUPANCY.md` — derived presence/occupancy.
- `docs/RADIUS_INTEGRATION.md` — WiFi auth backend (W17 adapter, etc.).

## How to use this doc

Same convention as the other parcel docs.

- **Pre-build**: design contract.
- **Post-build**: living reference for *why* the code is shaped the way it is.
- Update when rules change or code drifts. Append amendments dated; never
  delete numbered rules — drop the body, keep the slot.
- Audit trail = git history.
- Audience: solo dev + AI pair, not admins/operators.

## The unifier: `subscription_lines`

> **`subscription_lines` is the single billable entity.** Every recurring
> charge on the platform is one row in that table. A row is either:
> - **Licence-backed** — `license_id` set; e.g. memberships, dedicated
>   desks. Gates access.
> - **Item-backed** — `item_id` set; e.g. recurring products like coffee
>   plans, parking, ad-hoc lines. No access gating.
>
> The XOR CHECK on the table enforces "exactly one source". Anywhere
> the platform says "subs", it means both — Subscription tab, forecast,
> escalation, invoicing. Licence creation is a specialisation that
> always produces a licence-backed sub; it never makes the platform
> licence-centric.

## Why the split (vs WSM)

> **Licences hold zero financial data.** No `base_rate`, no `currency`,
> no billing `status`. The licence row is identity (member, item,
> location, dates). The paired `subscription_lines` row is money
> (rate, currency, quantity, frequency, status). They join 1:1 on
> `license_id`.

This is the single biggest departure from the WSM legacy model, where
the licence-equivalent row carried financial fields directly. The split
looks like ceremony for the simple case (one licence, one rate) but
earns its keep on every harder case:

1. **Snapshot pricing without trickery.** Sub.base_rate is captured at
   creation; the catalog can move freely without silently re-billing
   anyone. Single-row would force you to either denormalise the
   catalog rate onto the licence (same idea, less obvious) or read
   the live catalog (the WSM trap).
2. **Multiple rates over time per licence.** A licence may have one
   active sub plus N superseded subs — every rate it has ever been on,
   each with its own start/end. Reconstructable with one `select`.
   Single-row forces this into change_log diffing.
3. **Lifecycle separation.** Sub.status is `draft → active →
   superseded → ...` — billing-period semantics, not
   licence-identity semantics. Conflating them on one row mixes
   "is this membership valid?" with "is this billing line being
   invoiced?" — different questions, different lifecycles.
4. **One billing engine, two shapes.** Item-backed and licence-backed
   subs share the table → share the invoicing pipeline. Money on the
   licence row would split that into parallel pipelines.
5. **Forward-looking schedules** (V2: price escalations, scheduled
   rate changes). Naturally future-dated `subscription_lines` rows.
   With money on the licence, you'd reinvent this split as a side
   table.

### Operator-facing rule

> **Edit financial data only via the licence UI.** Touch, rate change,
> upgrade — all attached to the licence's expand panel on the org
> page. There is no operator surface that exposes the paired sub
> directly. The split is a schema concern; the licence is the
> operator-facing unit of edit.

This keeps the operator's mental model simple ("I edit the licence")
while preserving every benefit of the split underneath.

### Where this gotcha bites

When something "didn't show up" the question is almost always *which
of the two rows did the write land on, and which row is the UI
reading?* Examples:

- A raw SQL update of `subscription_lines.base_rate` does NOT show in
  a `RecordHistory` panel bound to `licenses` — it's on the other
  row. Use composite mode (`pairs={[{licenses,id},{subscription_lines,id}]}`).
- A licence rate that "didn't update from the catalog" is the
  snapshot rule working as intended; Touch is the deliberate
  operator break.
- A licence with rate `—` is an orphan: the licence row exists but
  no active paired sub. Health check: count active subs per licence
  should be exactly 1.

## The timeline model

A sub has a timeline:

```
   started_at                                  ended_at (nullable)
       │                                              │
       ▼                                              ▼
       ├──────┬────────────┬─────────────┬───────────►
              │            │             │
              ▼            ▼             ▼
            rate         rate          rate
            change       change        change
            (immediate)  (scheduled)   (scheduled)
```

The materialised "current rate" lives on `subscription_lines.base_rate`.
Every rate change writes to `subscription_line_rate_history` with an
`effective_at`; rows with `effective_at <= today` are promoted into
`base_rate` (cron, daily). Rows with future `effective_at` are *pending*
— visible in the UI but not yet on the rate.

Discount rules + escalation method live on `subscription_line_rules`
(per-sub, mini-contract). Org-level defaults seed new subs from
`organisations.default_sub_rules` (jsonb) at creation; thereafter the
sub owns its own rules.

## The three primitives

Every operation in the system reduces to one or two of these.

### `openSub(person, item|licence_for_item, location, started_at)`
Atomic licence+sub create when the item requires a licence; pure sub
create when it doesn't. Returns the new ids. Already implemented in
`add_licence_with_sub` RPC for the licence path.

### `scheduleRateChange(sub_id, new_rate, effective_at, source)`
Writes one row to `subscription_line_rate_history`. Source is metadata
(`'operator'`, `'rule'`, `'annual_increase'`). Mechanism is identical
regardless of source. If `effective_at <= today`, promotes immediately;
otherwise the daily cron handles it.

### `closeSub(sub_id, ended_at)`
Atomic — sets `subscription_lines.ended_at` and `status = 'ended'`,
and (for licence-backed subs) ends the paired licence. Maintains the
1:1 invariant.

## Operations — composed from the primitives

| Operation | What it actually is |
|---|---|
| Create licence | `openSub` (licence path) |
| Create product sub | `openSub` (item path) |
| End licence / sub | `closeSub` |
| Operator rate edit | `scheduleRateChange(sub, new_rate, today, 'operator')` |
| Per-line annual escalation | `scheduleRateChange(sub, computed, anniversary, 'rule')` |
| Annual market increase | bulk wrapper — many `scheduleRateChange(...)` in one action |
| Upgrade / downgrade | `closeSub(old, T)` + `openSub(person, new_item, location, T)` |
| Apply discount | row in `subscription_line_rules` with date window |
| Forecast | pure read function over the timeline |

The escalation **method** (`contracted` vs `annual_lift`) is just a
recipe for *computing* the next rate. The application is the same
primitive either way. The proposal flow (multi-option upgrade) uses
the existing `subscription_option_groups` schema (migration 018) and
boils down to "draft sub lines, member picks one, chosen one becomes
a regular `closeSub + openSub` transition".

## Rules

1. **Required inputs (licence path)**: a licence needs a Member
   (`user_id`), a Membership (item where `item_types.requires_license = true`),
   and may optionally have a Space (`space_id`, reporting only).
2. **Item must require licence (licence path)**: reject if
   `item_types.requires_license = false`.
3. **Item must be active and not soft-deleted**.
4. **Member belongs to org**: if `user_id` is set,
   `persons.organisation_id` must equal the licence's
   `organisation_id`. Hard reject.
5. **Location consistency**: input `location_id` must equal
   `item.location_id`, or auto-fill from the item.
6. **Date sanity**: `ended_at` (if set) must be ≥ `started_at`.
7. **No overlap, but future-dated is fine**: reject if another active
   licence for the same `(user_id, item_id, organisation_id)` overlaps
   the new date range. A start date *after* the current licence ends
   enables scheduled upgrades/downgrades.
8. **Currency & rate at creation**: `currency = location.currency`,
   `base_rate = item.base_rate`. No overrides at creation time.
9. **1:1 invariant (licence path)**: a licence has exactly one paired
   `subscription_line` with non-terminal status. Created atomically
   via `openSub`; never both, never neither.
10. **Snapshot pricing**: future changes to `items.base_rate` do not
    cascade to existing subs. Display surfaces read from the paired
    `subscription_lines.base_rate`, not the item join.
11. **Subscription tab default-filters to currently-valid lines**
    (date active, status not in superseded/cancelled/expired/ended).
    "Show ended" toggle reveals history.

## Self-service

Members with the platform-level **`org_admin`** role (granted via
`user_roles`) can perform a defined set of operations on their own org's
subs. Scope derives from `persons.organisation_id` — no per-org junction
table.

V1 self-service surface: **none**. Operators do everything in V1. Self-
service is layered on top once the operator flow is solid (V6 below).

Operational policy (frequency caps, default-off downgrades, locked sub
lines, etc.) belongs in `organisations.default_sub_rules` jsonb when
introduced — not in service-level rules.

## Forecast

Pure, deterministic read function over a sub's timeline. Inputs:
current state + scheduled changes + active discount windows. Output:
projected invoice rows up to 60-month horizon. Does not speculate
about future market increases (those are operator events, not data).

V5 — see version table below.

## Schema state today vs needed

| Table | Today | Needs |
|---|---|---|
| `subscription_lines` | exists, XOR check, supersedes_subscription_line_id, option_group_id | nothing for V1 |
| `subscription_line_rate_history` | exists per CLAUDE.md | verify shape; needed for V2 |
| `subscription_line_rules` | exists (migration 019) | extend with escalation/discount fields when needed (V3, V4) |
| `subscription_option_groups` | exists (migration 018) | nothing — already shaped right |
| `licenses` | exists | nothing |
| `organisations.default_sub_rules` | not yet | add when V3+ ships |
| `persons.organisation_id` | exists | nothing |

## Build versioning

| V | Adds | Notes |
|---|---|---|
| **V1 (now)** | `licence-creation.service.ts` consolidating the four call sites; rules 1–11 enforced. Calls existing `add_licence_with_sub` RPC. | Zero schema changes. Parity with current WSM capability. |
| V2 | Scheduled rate changes — verify/extend `subscription_line_rate_history`, daily promote-pending cron, `scheduleRateChange` primitive. | First time the timeline becomes "real". |
| V3 | Per-line escalation method on `subscription_line_rules`; bulk Path B annual increase wizard; `default_sub_rules` jsonb. | Builds on V2. |
| V4 | Discounting fields on `subscription_line_rules`; invoice-line snapshot capture. | Independent of V2/V3. |
| V5 | Forecast read-only service over the timeline. | Builds on V2 + V4. |
| V6 | `org_admin` role + self-service flows + member portal. | Builds on V1+. |
| V7 | Multi-option proposal UX (Mode B) using existing schema. | Builds on V1. |

Each row is a real PR, independently scopable. None require throwing
away V1.

## Open questions

- **Where does the operator-fed annual-increase wizard route the bulk
  scheduleRateChange calls** — single bulk action with snapshot+undo,
  or scheduler that emits one per sub? Decide when V3 lands.
- **Pro-rata billing on mid-period changes** — needed at V1 or
  deferrable? V1 says deferrable.
- **W17 RADIUS interface** — open question for `RADIUS_INTEGRATION.md`,
  affects how onboarding wires up but not licence creation itself.
- **Locked sub lines** (a per-line "no self-service" flag) — speculative,
  decide when self-service ships.

## Out of scope

- Onboarding orchestration (`docs/ONBOARDING.md`).
- Occupancy reporting (`docs/OCCUPANCY.md`).
- Accounting integrations (Sage etc.).
- Invoice generation — separate service that *consumes* this parcel's
  rules + forecast at issue time.
- Bulk licence operations (V3+).
- Member portal (V6+).
