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

## Rules

> **Rule 14: Price escalation walks each active sub line independently.**
> The escalation function reads `subscription_line_rules` per-line, computes
> the new rate per-line, snapshots a new `subscription_lines.base_rate`,
> and appends to `subscription_line_rate_history`. There is no
> "one method per org" assumption — different lines on the same org can use
> different methods.
>
> Two methods supported:
> - **Contracted escalation** — apply a known % bump (e.g. CPI + 2%) defined
>   in the sub's rules. `new_rate = current.base_rate × (1 + pct/100)`.
> - **Annual lift-to-current** — bring price to today's catalog rate.
>   `new_rate = item.base_rate` (current value).

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

1. **Migration**: add `organisations.default_sub_rules jsonb`. Seed with
   sensible blanks for existing orgs.
2. **Service**: `price-escalation.service.ts` with:
   - `previewEscalation(subIds[])` — returns proposed new rates without
     applying.
   - `applyEscalation(subIds[])` — runs the per-line walk, snapshots
     prior rate, writes `subscription_line_rate_history`, updates
     `subscription_lines.base_rate`. Atomic per-line; bulk-action wrapper
     for undo.
3. **Bulk action**: `bulk_apply_sub_rules_apply(sub_ids[], keys[], performer)`
   RPC + new branch in `bulk_action_undo` + permission seed for
   `bulk_actions.apply_sub_rules`. Snapshot-backed undo.
4. **UI**:
   - Org edit page: form for `default_sub_rules` (the JSON shape).
   - Subscription tab: multi-select rows → "Apply org defaults…" dialog
     with per-key checkboxes → phase progress + Undo (mirrors existing
     bulk patterns).
   - Sub-line detail: editable rules section (per-line override).
   - Optional: an "Escalations due this month" report list.

## Out of scope for this parcel

- Discount logic beyond the schema field (UX/UI for tiered discount tables,
  promo codes, etc.).
- Anniversary cron jobs (deferred until method/anniversary fields stable).
- ERPNext / accounting-side rate updates — handled by existing accounting
  sync once the platform-side rate moves.
