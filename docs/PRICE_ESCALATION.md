# Price escalation + sub-line rules

Status: **scoping**, no code yet. Companion parcel to
`docs/LICENCE_CREATION_RULES.md`. Covers the per-sub-line rules engine
(escalation, discount) and the org-default JSON shape that seeds new sub
lines at creation time.

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

## Two distinct paths

Price changes happen via **one of two paths**, never both for the same sub:

### Path A — per-sub-line rule escalation

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

### Path B — annual market-increase function

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
caught before the cron applies. After the cron applies, undo is still
possible (it just inverts the rate-history rows) but the operator must
explicitly run a counter-action — not the standard one-click undo.

### Path A vs Path B — mutually exclusive at the sub level

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

> **Rule 15: Escalation and discount config lives on the sub line, not the
> org.** Each `subscription_line` has its own `subscription_line_rules` row
> (the table from migration 019). The org provides **defaults** — when a
> sub is created, those defaults are copied into the sub's rules. After
> creation the rules can be edited per-line without affecting any other sub.

> **Rule 16: Snapshot rule is hard, but a bulk-update path can deliberately
> re-apply org defaults to selected sub lines.** The default flow has no
> auto-cascade when org defaults change. The escape hatch is a bulk action
> that takes `(sub_ids, keys[])` and overwrites only those keys on the
> targeted sub lines, snapshotting prior values to `bulk_actions.snapshot`
> for undo via the standard `bulk_action_undo` dispatcher.

## Org defaults — JSON on `organisations`

Decision: a single `jsonb` column rather than a new table. Reasons:
- Read-only at sub-creation time — we never query *across* orgs in a hot
  path. Reports can use JSONB path operators (acceptable for ad-hoc).
- Set of settings will grow (escalation, discount, payment terms, billing
  day, late-fee policy, …). JSON keeps the migration cost flat.
- Snapshots already give us history — when org defaults change, existing
  subs are unaffected (Rule 15). We don't need versioned history of org
  defaults; the sub captured what mattered.
- Established platform precedent: `item_types.pricing_params jsonb`.

### Migration (future parcel)

```sql
alter table public.organisations
  add column default_sub_rules jsonb not null default '{}'::jsonb;
```

### TypeScript shape

```ts
type OrgDefaultSubRules = {
  escalation_method?: 'contracted' | 'annual_lift'
  escalation_pct?: number              // only when method = 'contracted'
  escalation_anniversary?: 'sub_started_at' | 'org_anniversary'
  discount_pct?: number
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

If a report ever runs slow enough to matter (unlikely at expected scale), add
a partial expression index — don't add it pre-emptively:

```sql
create index if not exists organisations_escalation_method_idx
  on public.organisations ((default_sub_rules->>'escalation_method'))
  where deleted_at is null;
```

## Future build — what this parcel needs

### Migrations
1. `organisations.default_sub_rules jsonb` (org defaults, seed blank).
2. Verify `subscription_line_rate_history` has `effective_at` and a way
   to mark rows "applied" / "cancelled". If missing, extend.
3. New columns on `subscription_line_rules` if the table doesn't already
   carry `escalation_method`, `escalation_pct`, `discount_pct`, etc.
4. New permission seeds: `bulk_actions.apply_sub_rules`,
   `bulk_actions.annual_increase`.

### Services
1. `price-escalation.service.ts`:
   - `previewSubLineEscalation(sub_ids[])` — Path A preview, returns
     proposed rates without applying.
   - `applySubLineEscalation(sub_ids[])` — Path A apply.
   - `previewAnnualIncrease({ location_ids, item_type_id?, pct, effective_at })`
     — Path B preview: returns the matrix of items + per-sub effects, +
     the three counts (lift / skipped / repriced).
   - `applyAnnualIncrease(...)` — Path B apply: writes future-dated history
     rows, wraps in `bulk_actions` for undo.
   - `cancelScheduledIncrease(history_row_id)` — soft-deletes a pending
     rate-history row before cron picks it up.
2. Cron job (pg_cron) — daily: walk `subscription_line_rate_history` where
   `effective_at <= today` AND not yet applied → write to
   `subscription_lines.base_rate`, mark the history row applied.

### Bulk actions
1. `bulk_apply_sub_rules_apply(sub_ids[], keys[], performer)` RPC + new
   branch in `bulk_action_undo` + permission seed for
   `bulk_actions.apply_sub_rules`. Snapshot-backed undo (Rule 16).
2. `annual_increase_apply(location_ids[], item_type_id?, pct, effective_at, performer)`
   RPC + new branch in `bulk_action_undo` + permission seed for
   `bulk_actions.annual_increase`.

### UI
- **Org edit page**: form for `default_sub_rules` (the JSON shape).
- **Subscription tab**: multi-select rows → "Apply org defaults…" dialog
  with per-key checkboxes → phase progress + Undo (mirrors existing bulk
  patterns).
- **Sub-line detail**: editable rules section (per-line override). Plus
  a "Scheduled change → R{x} from {date}" badge if a pending rate-history
  row exists.
- **Annual increase wizard**: Locations / Item type / % / Effective date
  → preview (lift / skipped / repriced counts) → confirm. Lives on a
  dedicated "Pricing → Annual Increase" page (admin-only).
- **Pending escalations report**: list of all pending future-dated
  history rows with cancel-action per row.
- Optional: "Escalations due this month" report.

## Out of scope for this parcel

- Discount logic beyond the schema field (UX/UI for tiered discount tables,
  promo codes, etc.).
- Anniversary cron jobs (deferred until method/anniversary fields stable).
- ERPNext / accounting-side rate updates — handled by existing accounting
  sync once the platform-side rate moves.
