# Pricing — escalation, discounting & invoicing forecast

Status: **scoping**, no code yet. Companion parcel to
`docs/LICENCE_CREATION_RULES.md`. Covers everything a sub line carries
about *what it will charge over time*:

1. **Escalation** — how the rate moves up over time (per-line rules and
   the org-wide annual market increase).
2. **Discounting** — modifiers that reduce the charged amount per period.
3. **Invoicing forecast** — a deterministic projection of every invoice
   the sub will produce for the next 5 years (max horizon).

These three concerns live together because the forecast is a function of
the rules: change escalation or discount, the forecast shifts. Splitting
them across docs would mean the forecast doc would just point at the
other two for every line of input data.

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
these rules.

## Architectural principle

> **Each `subscription_line` is a mini-contract.** Its rules
> (escalation method, %, discount, etc.) live on `subscription_line_rules`
> and are owned by the sub. The org provides defaults — copied at sub
> creation, then never auto-updated.

Why this matters:
- Two members of the same org can have different deals.
- A signed sub from 2 years ago has its rules locked; a new sub today can
  carry different rules without affecting the old one.
- Audit-friendly: at any point you can see what rules applied when a sub
  was created.

---

# Part 1 — Escalation

Two distinct paths exist; never both for the same sub.

## Path A — per-sub-line rule escalation

Driven by each sub's own `subscription_line_rules`. Self-managing per line.

> **Rule 14a: Sub-line rule escalation walks each active sub independently.**
> The escalation function reads `subscription_line_rules` per-line, computes
> the new rate per-line, snapshots a new `subscription_lines.base_rate`, and
> appends to `subscription_line_rate_history`. Different lines on the same
> org can use different methods.
>
> Two methods supported in sub-line rules:
> - **`contracted`** — apply a known % bump (e.g. CPI + 2%) from the sub's
>   rules. `new_rate = current.base_rate × (1 + pct/100)`.
> - **`annual_lift`** — bring price to today's catalog rate.
>   `new_rate = item.base_rate` (current value).

## Path B — annual market-increase function

A deliberate operator-initiated event that resets prices "to market". Scope
is per-location (optionally narrowed by item-type) because the market doesn't
move uniformly across geographies — CPT might lift +8% while Paarl lifts +5%.

> **Rule 14b: Annual market-increase is location-scoped, scheduled, and
> skips contracted lines.**
>
> Inputs:
> - `location_id` (or set of locations)
> - optional `item_type_id` to narrow scope further
> - `pct` — the % to lift catalog prices by
> - `effective_at` — required, defaults to today. Today = applies on
>   confirm; future date = scheduled for the cron to pick up.
>
> Mechanics, atomic per run:
> 1. Update `items.base_rate` at the targeted scope: `new_rate = current × (1 + pct/100)`.
> 2. For every paired `subscription_line` whose item is in scope **and**
>    whose rules' `escalation_method` is `'annual_lift'` or unset, write a
>    row to `subscription_line_rate_history` with the new rate and the
>    chosen `effective_at`.
> 3. Skip any sub whose `escalation_method = 'contracted'` — those self-manage.
> 4. **Apply branch** depends on `effective_at`:
>    - `effective_at <= today` → write the new rate to
>      `subscription_lines.base_rate` immediately and stamp the history
>      row applied. Operator gets the result in the same response.
>    - `effective_at > today` → leave `subscription_lines.base_rate`
>      unchanged. The pending change is visible on the sub line as
>      "Scheduled change → R{x} from {date}". A daily cron promotes
>      future rows when their date arrives by writing the new rate to
>      `subscription_lines.base_rate` and marking the history row applied.
> 5. Operator can cancel before `effective_at` — soft-deletes the pending
>    rate-history row. Cron skips cancelled rows. (Cancelling an already-
>    applied row is a separate counter-action, not a one-click undo.)

The whole run is wrapped in `bulk_actions` for snapshot-backed undo if it's
caught before the cron applies.

## Path A vs Path B — mutually exclusive at the sub level

A sub line is either:
- **Self-managing** (has `escalation_method = 'contracted'`) → Path B never
  touches it.
- **Market-tracking** (`escalation_method = 'annual_lift'` or unset) → moves
  with the next Path B run for its location.

So the operator running a Path B sees a preview with three counts before
confirming:
- *N* subs will lift to market
- *M* subs skipped (contracted curve)
- *K* items repriced

---

# Part 2 — Discounting

Discounts modify the *invoiced* amount each period without changing the
underlying `subscription_lines.base_rate`. Two reasons to keep them
separate from base rate:
1. The base rate is what the sub is *worth*; the discount is a commercial
   concession. Reporting on "real" ARR vs "billed" ARR matters.
2. Discounts can expire (e.g. "first 3 months at 50% off"); base rate
   doesn't.

## Discount rules

> **Rule 17: Discounts live on the sub line's rules, not on the rate.** The
> sub's `subscription_lines.base_rate` always reflects the un-discounted
> price. Discounts are stored in `subscription_line_rules` (or a paired
> table — TBD when building) and applied at invoice-line generation time.

> **Rule 18: A discount has a kind, a value, and an active window.** Shape:
> - `kind ∈ ('percent', 'amount')` — % off the line, or absolute currency
>   off the line.
> - `value` — the % or the amount.
> - `starts_at`, `ends_at` — the window during which the discount applies
>   to invoicing periods. Both optional; null = open-ended.
> - `notes` — free text for the operator's reason.
>
> Multiple discounts can be active on one sub at the same time — they
> stack, applied in deterministic order (largest absolute first to keep
> compounded math sensible). Stacking is uncommon but supported.

> **Rule 19: Discount is captured per invoice line, not per period.** When
> the invoicing run produces a line, it stamps the resolved discount
> (kind/value/source-rule-id) onto `invoice_lines.discount` and a JSON
> breakdown column. Same snapshot principle as Rule 11: an issued invoice
> never shifts when the rule later changes.

> **Rule 20: Discount changes don't retroactively touch issued invoices.**
> Adjusting a discount rule applies to *future* invoice runs. To correct
> an issued invoice, raise a credit note — separate flow, not in this
> parcel.

## Discount config sources

In priority order (highest wins for the resolved discount on a given period):
1. **Per-sub-line override** — set directly on `subscription_line_rules`.
   Most specific.
2. **Org default** — copied from `organisations.default_sub_rules.discount_*`
   at sub creation (per Rule 15). Older subs keep the org default they
   were born with.
3. **No discount** — if neither of the above applies, the line is
   un-discounted.

## Self-service discounting

Out of scope. Members can't apply discounts to themselves. Operators can.
Bulk-apply a discount to a set of sub lines uses the standard bulk action
pattern (see Rule 16).

---

# Part 3 — Invoicing forecast

Given a sub line's current state — `base_rate`, frequency, escalation
rules, discount rules, started_at, ended_at — the platform can deterministically
project every future invoice up to a maximum 5-year horizon.

## What the forecast answers

For each future invoice period that the sub will produce:
- Period start / end
- Quantity
- Gross base (rate × qty, before discount)
- Discount applied (resolved from active rules at that period)
- Net (after discount)
- Tax (per the sub's tax rule)
- Total

Aggregated views:
- **Per sub line** — 60-row forecast on the sub-line detail page.
- **Per org** — sum across all active sub lines, grouped by month/quarter
  /year. Shows the org's projected billing trajectory.
- **Per location** — same aggregation across an entire location's sub
  lines.
- **Platform-wide** — for finance projections.

## Forecast rules

> **Rule 21: Forecast is a deterministic, pure function.** Given the same
> inputs (sub state, rules, today's date), the forecast always produces
> the same output. No randomness, no caching surprises. Recomputable on
> demand.

> **Rule 22: Forecast horizon is capped at 60 months from today.**
> Beyond that the projections become noise (escalation compounds,
> assumptions stale, sub probably ends). 60 months = 5 years matches
> typical commercial contract horizons.

> **Rule 23: Forecast applies all *known* future events at the right
> dates.** This includes:
> - Pending Path A escalation rows (sub-line rule scheduled to fire at
>   anniversary).
> - Pending Path B rate-history rows (annual market increase queued for
>   a future date).
> - Pending subscription change (Mode A from
>   `SUBSCRIPTION_UPGRADE_DOWNGRADE.md` with future `effective_at`).
> - Discount rules' `starts_at` / `ends_at` windows.
> - Sub's own `ended_at` if set.

> **Rule 24: Forecast does NOT speculate about future Path B runs.** The
> forecast is "what will I be billed *given the current state of rules
> and pending changes*". It does not assume next year's annual increase
> will happen at a particular % — that's a planning question, separate
> from the forecast. Future enhancement: a `forecast_with_assumed_increase(pct)`
> for finance modelling.

> **Rule 25: Forecast does NOT issue invoices.** It's a projection only.
> The actual invoicing process is separate (out of scope for this
> parcel). Forecast and invoicing read from the same sources but produce
> different artifacts: forecast = projection, invoicing = real
> invoice_lines / invoices rows.

## Where the forecast renders

- **Sub-line detail page** (`/subs/[id]` or wherever): a "Forecast"
  panel showing the next 12 / 24 / 60 months in a table. Toggle granularity.
- **Org Subscription tab** (`/organisations/[id]?tab=subscription`):
  an aggregated forecast chart underneath the current sub list — "What
  will this org bill us over time?".
- **Member portal**: the member's own subs, projected forward. Useful
  for "what will I pay over the next year?".
- **Finance / reports section** (future): platform-wide aggregations.

---

## Org defaults — JSON on `organisations`

Decision: a single `jsonb` column rather than a new table. Reasons:
- Read-only at sub-creation time — we never query *across* orgs in a hot
  path. Reports can use JSONB path operators (acceptable for ad-hoc).
- Set of settings will grow (escalation, discount, payment terms, billing
  day, late-fee policy, …). JSON keeps the migration cost flat.
- Snapshots already give us history — when org defaults change, existing
  subs are unaffected. We don't need versioned history of org defaults;
  the sub captured what mattered.
- Established platform precedent: `item_types.pricing_params jsonb`.

### Migration (future parcel)

```sql
alter table public.organisations
  add column default_sub_rules jsonb not null default '{}'::jsonb;
```

### TypeScript shape

```ts
type OrgDefaultSubRules = {
  // Escalation
  escalation_method?: 'contracted' | 'annual_lift'
  escalation_pct?: number              // only when method = 'contracted'
  escalation_anniversary?: 'sub_started_at' | 'org_anniversary'
  // Discount
  discount_kind?: 'percent' | 'amount'
  discount_value?: number
  discount_starts_at?: string          // ISO date
  discount_ends_at?: string
  // Other commercial
  payment_terms_days?: number
  // …grow as needed
}
```

Validation lives in TypeScript at the org-edit endpoint (Zod or hand-rolled).
DB stays loose to keep evolution cheap.

### When to promote to a table

If we ever need:
- Versioned history of org defaults independently of subs.
- Cross-org reporting in hot paths.
- Multi-tenant joins on individual settings.

…then we promote `default_sub_rules` to `organisation_contract_terms` as a
separate parcel. Not now.

## Reporting

JSONB path operators handle ad-hoc reports comfortably. Examples:

```sql
-- "How many orgs use each escalation method?"
select default_sub_rules->>'escalation_method' as method, count(*) as orgs
from public.organisations
where deleted_at is null
group by 1 order by 2 desc;

-- "Orgs with > 10% contracted escalation"
select id, name, (default_sub_rules->>'escalation_pct')::numeric as pct
from public.organisations
where (default_sub_rules->>'escalation_method') = 'contracted'
  and (default_sub_rules->>'escalation_pct')::numeric > 10
  and deleted_at is null
order by pct desc;

-- "Orgs missing escalation config"
select id, name
from public.organisations
where default_sub_rules->>'escalation_method' is null
  and deleted_at is null;
```

If a report ever runs slow enough to matter, add a partial expression
index — don't add it pre-emptively.

## Future build — what this parcel needs

### Migrations
1. `organisations.default_sub_rules jsonb` (org defaults, seed blank).
2. Verify `subscription_line_rate_history` has `effective_at` and a way
   to mark rows "applied" / "cancelled". If missing, extend.
3. New columns on `subscription_line_rules` if the table doesn't already
   carry `escalation_method`, `escalation_pct`, `discount_kind`,
   `discount_value`, etc.
4. New permission seeds: `bulk_actions.apply_sub_rules`,
   `bulk_actions.annual_increase`.

### Services
1. `pricing-rules.service.ts`:
   - `previewSubLineEscalation(sub_ids[])` — Path A preview.
   - `applySubLineEscalation(sub_ids[])` — Path A apply.
   - `previewAnnualIncrease(...)` — Path B preview with the three counts.
   - `applyAnnualIncrease(...)` — Path B apply.
   - `cancelScheduledChange(history_row_id)`.
   - `applyDiscount(sub_ids[], discount)` / `removeDiscount(sub_ids[],
     discount_id)` — operator discount management.
2. `invoicing-forecast.service.ts`:
   - `forecastSubLine(sub_id, { horizon_months = 60 })` — pure function,
     returns array of projected periods.
   - `forecastOrg(org_id, { horizon_months })` — aggregates across all
     org subs.
   - `forecastLocation(location_id, { horizon_months })` — same for
     location.
3. Cron job — daily: walk `subscription_line_rate_history` where
   `effective_at <= today` AND not yet applied → write to
   `subscription_lines.base_rate`, mark the history row applied.
   **Use pg_cron / Node, NOT Trigger.dev** — purely internal, no
   external dependencies.

### Bulk actions
1. `bulk_apply_sub_rules_apply(sub_ids[], keys[], performer)` RPC + new
   branch in `bulk_action_undo` + permission seed for
   `bulk_actions.apply_sub_rules`. Snapshot-backed undo.
2. `annual_increase_apply(location_ids[], item_type_id?, pct, effective_at, performer)`
   RPC + new branch in `bulk_action_undo` + permission seed for
   `bulk_actions.annual_increase`.

### UI
- **Org edit page**: form for `default_sub_rules` (the JSON shape).
- **Subscription tab**: multi-select rows → "Apply org defaults…" dialog
  with per-key checkboxes → phase progress + Undo.
- **Sub-line detail**: editable rules section (per-line override). Plus
  a "Scheduled change → R{x} from {date}" badge if a pending rate-history
  row exists. **Forecast panel** showing the 60-month projection.
- **Annual increase wizard**: Locations / Item type / % / Effective date
  → preview (lift / skipped / repriced counts) → confirm. Lives on a
  dedicated "Pricing → Annual Increase" page (admin-only).
- **Pending escalations report**: list of all pending future-dated
  history rows with cancel-action per row.
- **Org Subscription tab → forecast chart**: aggregated 60-month
  projection of all active sub lines.
- Optional: "Escalations due this month" report.

## Out of scope for this parcel

- Discount approval workflow (e.g. discount > 25% requires manager sign-off).
- Anniversary cron jobs beyond the daily promote-pending-changes runner.
- ERPNext / accounting-side rate updates — handled by existing accounting
  sync once the platform-side rate moves.
- Actual invoicing run (separate flow that *consumes* this parcel's
  rules + forecast at issue time, but the issuance logic lives elsewhere).
- Speculative forecasts ("what if next year's increase is 12%?") — useful
  but explicitly Rule 24 territory, follow-up parcel.
