# Subscription upgrade / downgrade

Status: **scoping**, no code yet. Third design parcel alongside
`docs/LICENCE_CREATION_RULES.md` and `docs/PRICING_AND_FORECAST.md`.

Covers the operator-driven and member-driven flows for moving a member
from one subscription product to another — both immediate and scheduled,
including the multi-option proposal flow used at quote time.

## How to use this doc

Same convention as the other parcel docs:

- **Pre-build (now)** — the design contract. Read it, edit it. Rules get
  locked in here before any code is written.
- **Post-build** — the living reference for *why* the code is shaped the
  way it is.

**When to update:** rule changes during a design conversation; code drifts
from a rule during build; new requirement surfaces post-ship (append, don't
rewrite — old rules marked `~~superseded YYYY-MM~~`, not deleted).

**Rule numbering is stable.** Don't renumber when a rule is dropped — code
comments and old commits reference numbers. Drop the body, keep the slot.

**Audit trail = git history.** Every rule change is a commit with a clear
message.

**Audience:** solo dev + AI pair, *not* admins/operators. V1 ships from
these rules; admin feedback comes from using V1.

## Why a service?

Today the codebase has no upgrade/downgrade primitive. The only way to
"change" a member's product is to manually end the existing licence + sub
and create new ones. That:

- Loses the atomicity (briefly the member has zero subs, breaks Rule 1:1
  invariant from `LICENCE_CREATION_RULES.md`).
- Drops the audit relationship (no record that B *replaces* A; just two
  separate records).
- Has no scheduled mode — must be done at the cutover moment.
- Has no proposal/option mode — can't offer "here are three desks at
  different price points, pick one".

A `subscription-change.service.ts` consolidates upgrade, downgrade, and
proposal flows behind one entry point. The service walks the licence ↔ sub
1:1 invariant correctly and snapshots prior state for undo.

## Rules

1. **Upgrade and downgrade are the same operation.** Direction is purely
   informational (current `item.base_rate` < new vs. current > new). The
   service exposes one function — `applyChange(...)` — and the caller
   labels it for UI purposes. Same atomic effect either way.

2. **Atomic transition.** A change is one transaction:
   - Existing licence's `ended_at = effectiveAt - 1 day`.
   - Existing paired sub gets `status = 'superseded'`.
   - New licence opens with `started_at = effectiveAt`.
   - New paired sub created at the *new item's* current `base_rate`,
     `supersedes_subscription_line_id` set to the previous sub's id.
   - 1:1 invariant maintained throughout (each licence has exactly one
     non-terminal-status sub at any moment).

3. **Effective date — required, defaults today.**
   - `effective_at <= today` → immediate. The transition fires in the same
     request; member sees the new product on next page load.
   - `effective_at > today` → scheduled. Pending change written to the
     same rate-history / lifecycle infrastructure as Path B in
     `PRICING_AND_FORECAST.md`. Daily cron promotes when the date arrives.
   - Cancellable before the effective date.

4. **New sub inherits org default rules**, same as a fresh licence
   (rule 9 in `LICENCE_CREATION_RULES.md`). Pre-existing per-line
   overrides on the *old* sub do not carry through — operators wanting
   continuity must replicate them on the new sub. This is intentional:
   a change is a fresh commercial event, not a copy.

5. **Pricing snapshot on the new sub.** Same as Rule 11 in
   `LICENCE_CREATION_RULES.md`: `subscription_lines.base_rate` is set
   from `item.base_rate` at `effective_at`, then locked. Future
   `items.base_rate` edits do not cascade to it.

6. **Pending escalations on the old sub are dropped.** If the old sub had
   a future-dated rate-history row (e.g. annual increase scheduled for
   next month), the change cancels it — the new sub starts fresh from
   the new item's catalog rate at `effective_at`.

7. **Date sanity.** `effective_at` must be ≥ the existing licence's
   `started_at`. Cannot retroactively change the past.

## Modes

### Mode A — Direct change (no proposal)

The operator (or self-service member, see below) picks a target item and
an effective date. The service runs. One round-trip, atomic.

Inputs:
- `current_sub_id`
- `new_item_id`
- `effective_at`
- (optional) `notes` — captured on both the superseded sub and the new sub

Use cases: "move this member from Hot Desk to Dedicated Desk Wednesday",
"downgrade Joe to part-time from start of next month".

### Mode B — Proposal (multi-option)

The operator builds a **subscription_option_group** containing N draft sub
lines, each representing a possible target. Member receives the proposal
(email + portal link). Member picks one. On pick, the selected option
becomes a Mode A change with the agreed `effective_at`; non-selected
options are marked superseded.

Schema is already in place — `subscription_option_groups` and
`subscription_lines.option_group_id` exist (migration 018). Status
`'option'` requires `option_group_id` (CHECK constraint already there).

Flow:
1. Operator clicks "Propose change" on the current sub.
2. Picks 1–N target items (could be different products at different
   price points, or the same product at different effective dates).
3. Service writes:
   - One `subscription_option_groups` row (FK to org + location).
   - One draft `subscription_lines` row per option, status = `'option'`,
     `option_group_id` = the new group.
   - The existing sub stays untouched (no transition yet).
4. Member view shows the options + Accept buttons.
5. On accept:
   - `subscription_option_groups.chosen_subscription_line_id` is set.
   - Other options' status → `'cancelled'`.
   - Mode A transition fires for the chosen one.

Use cases: quote-stage upgrades, sales-driven re-quoting, "here are three
desks in CPT — pick the one you want".

## Self-service — member-driven changes

A subset of changes can be member-initiated (without operator approval),
subject to permissions and guardrails.

### Actor permissions

A member can self-service if **all** of:
- They are a `persons` row attached to the org of the sub
  (`person.organisation_id == sub.organisation_id`).
- They have a linked user account (`persons.user_id IS NOT NULL`).
- That user holds the **`org_admin`** role (or platform admin /
  super_admin).

The `org_admin` role is platform-level (one row per role in `roles`
table, granted per-user via `user_roles`) but its *scope* is implicit:
an `org_admin` can only act on subs whose `organisation_id` matches
their own `persons.organisation_id`. The service enforces this at the
authorization check.

Resource permissions on the role:
- `subscriptions:change_self` — change one's own sub.
- `subscriptions:change_org` — change any sub in the same org. Held
  by `org_admin` (and by platform admin / super_admin implicitly).

No per-org junction table needed. The role is the role, the scope
comes from the actor's persons row.

Platform admins can always override. Operators retain full control via
the existing operator-flow.

### Self-service guardrails

These keep self-service safe by default; operator can override per-org
via the org's `default_sub_rules` JSON (see `PRICING_AND_FORECAST.md`):

- **Upgrades** (new rate ≥ current): allowed.
- **Downgrades** (new rate < current): allowed only if the org's
  `default_sub_rules.allow_self_downgrade = true`. Default: false —
  protects ARR.
- **Proposal mode**: members can only *accept* proposals built by
  operators; they cannot construct multi-option proposals themselves
  in v1. (Future: allow members to request a quote.)
- **Effective date constraints**: scheduled changes must be at least
  N days out (org-configurable; default 0 = same day allowed).
- **Locked sub lines**: a sub line marked `locked = true` (future flag
  on `subscription_line_rules`?) cannot be self-changed — operator only.
- **Frequency cap**: at most one self-initiated change per sub per N
  days (default 30) to prevent thrash. Configurable per org.

### Self-service audit

Every self-service change writes:
- A `bulk_actions` row with `performed_by = persons.user_id` (the
  member, not an operator).
- `notes` field set to "self-service".
- Standard `change_log` rows on both the old and new sub via the
  existing tier-1 trigger.

So an admin reviewing the changelog can always see "Joe Smith
self-upgraded from Hot Desk to Dedicated on 2026-09-01."

## Side effects

When a change is applied (immediate or via cron at effective date):

1. **Onboarding hook**: not re-fired. The member is the same person; the
   onboarding system from `LICENCE_CREATION_RULES.md` Rule 12 only fires
   on a fresh person+licence pair, not on a product change. (Open: do
   sub-system integrations need to know about the change? E.g.,
   access-control might need new tier permissions. If so, they get a
   *change* hook, not a *fresh* hook — separate event type.)

2. **Notification email** to the member: confirmation of the change with
   effective date. Sent via Trigger.dev (external API, retry surface).

3. **Notification email** to the operator (if not the actor): summary
   of who changed what, when. Same Trigger.dev path.

4. **Pro-rata billing** (open): if the change happens mid-billing-period,
   does the next invoice carry a credit for the unused old rate + a
   pro-rated charge for the new rate? Decide before invoice flow ships
   against this.

## Future build — what this parcel needs

### Migrations
1. None new for the change mechanics — `subscription_lines.status`,
   `supersedes_subscription_line_id`, `option_group_id` already exist.
2. New permission seeds:
   - `subscriptions.change_self`
   - `subscriptions.change_org`
   - `subscriptions.propose`
3. (Possibly) `subscription_line_rules.locked boolean` if locked-sub-line
   guardrail is wanted.
4. Org primary-member-id and member-admin role schema (depends on
   answers to open questions in `LICENCE_CREATION_RULES.md`).

### Services
1. `subscription-change.service.ts`:
   - `previewChange({ current_sub_id, new_item_id, effective_at })` —
     returns proposed end + start dates, new rate, prorate amounts,
     dropped pending escalations.
   - `applyChange(...)` — runs the atomic transition. Returns new
     licence_id + sub_id.
   - `proposeChange({ current_sub_id, options[], notes })` — Mode B,
     creates the option_group + draft subs.
   - `acceptProposal({ option_group_id, chosen_sub_id, effective_at })`
     — member-side accept of an existing proposal.
   - `cancelProposal({ option_group_id })` — operator cancel before
     acceptance.
   - `cancelScheduledChange(sub_id)` — operator cancels a future-dated
     change before its effective date.

### RPCs
1. `apply_subscription_change_atomic(...)` — ends old licence + sub,
   opens new licence + sub. Same shape as `add_licence_with_sub` but
   walks two more rows.
2. New branch in `bulk_action_undo` for change actions (the snapshot
   captures both the old and new licence/sub state so undo flips both).

### Cron
1. Daily promote-pending-changes job. Same daily window as the price
   escalation cron — both are internal pg_cron / Node, no external
   dependency. (See `feedback_task_execution` memory: pg_cron for
   internal, Trigger.dev for external.)

### UI
- **Operator path**: Subscription tab row → ⋮ menu → "Change…" opens a
  drawer with target-item picker, effective date, preview of price
  delta + prorate. "Apply" or "Schedule".
- **Operator proposal path**: same drawer, "Propose multi-option"
  toggle reveals an option-builder (N rows, each with item + rate +
  effective date).
- **Member portal**: Sub line card → Change button → similar drawer,
  guardrail-aware (downgrade option hidden if disallowed). Accept-
  proposal flow shown when an active option_group exists for the
  member.
- **Pending changes report**: list of all scheduled future-dated
  changes, cancellable per row (admin-only).
- **Email templates**: confirmation (member-facing), summary
  (operator-facing). Sent via Mailgun through Trigger.dev.

## Open questions

- ~~**Primary member + org-admin role schema**~~ — resolved 2026-05-01.
  Use a platform-level `org_admin` role granted per-user via `user_roles`;
  scope derives from the actor's `persons.organisation_id`. No per-org
  junction needed.
- **Pro-rata billing** — required at v1 or deferrable to a follow-up?
- **Self-service downgrades** — default off feels right; confirm before
  building.
- **Locked sub lines** — is this a real WSM concept, or speculative?
- **Sub-system change hook** — does access-control / WiFi etc. need
  notification of tier changes? Or do they read the live sub on every
  request anyway?
- **Frequency cap** — is "one change per 30 days" the right shape? Per
  sub? Per member? Configurable how?

## Out of scope for this parcel

- The proposal-acceptance email signing flow (separate parcel — likely
  ties into `signatures` table from migration 020).
- Pro-rata invoice line generation (touches the invoicing service).
- Member portal authentication if it doesn't already exist.
- ERPNext / accounting-side propagation of the change (handled by
  existing accounting sync once the platform-side change is committed).
