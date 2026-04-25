# Catalog & Tracking

How items are typed (families), how tracking codes cascade from location → item → subscription → invoice, and where the logic lives today.

## Item families

Every `items` row has a `item_type_id` pointing at a lookup in `item_types`. Each `item_type` carries a **`family`** label — the attribute set the item exposes. Six families today:

| Family       | Detail table          | Typical use                                       |
| ------------ | --------------------- | ------------------------------------------------- |
| `space`      | `space_details`       | Meeting rooms, hot desks, floors, event spaces   |
| `membership` | `membership_details`  | Hotdesk/dedicated/coworking membership plans     |
| `product`    | `product_details`     | Beverages, merch, printables — countable goods   |
| `service`    | `service_details`     | Bookable services (durations, per-session rates) |
| `art`        | `art_details`         | Artworks on consignment, for sale, on display    |
| `asset`      | `asset_details`       | Vehicles, equipment, bicycles — rentable assets  |

Each `*_details` table has `item_id uuid PK` (1:1 with `items`) plus its family-specific columns.

### How the UI resolves a family

1. Item detail page (`/items/[id]/+page.server.ts`) fetches the item with a nested `item_types(family)` join.
2. `family` is derived synchronously and passed to the client.
3. The Meta Data tab reads a hard-coded `FAMILY_FIELDS` map (in `items/[id]/+page.svelte`) keyed by family name and renders a form per the field definitions (text/number/integer/boolean/date/enum/long_text).
4. On save, the page server coerces each `detail_<slug>` field via `FAMILY_COLUMNS` (mirror map) and upserts into the matching `*_details` table.

### Known debt

`FAMILY_FIELDS` (UI) and `FAMILY_COLUMNS` (server) are **duplicated** across:
- `apps/web/src/routes/(admin)/items/+page.svelte` (list create form)
- `apps/web/src/routes/(admin)/items/+page.server.ts` (create action)
- `apps/web/src/routes/(admin)/items/[id]/+page.svelte` (detail form)
- `apps/web/src/routes/(admin)/items/[id]/+page.server.ts` (update action)
- `apps/web/src/routes/(admin)/item-types/+page.svelte` (family field preview)

Any schema change currently requires editing all five. Consolidation target: a single `$lib/catalog/families.ts` module exporting `FAMILY_FIELDS` + `FAMILY_COLUMNS` + helpers (`coerceDetailValue`, `upsertDetails`). Migrating is safe — the shapes are already kept in sync manually.

## Tracking-code cascade

A tracking code identifies a sub-location or revenue stream under a physical location (e.g. `KL-L1` = Kloof Level 1, `NCG` = Newlands Cricket Ground). Codes power reporting in the external accounting system (Xero / similar).

### Data model

```
locations
  └─ tracking_codes (location_id, code, name, category, is_primary, active)
       └─ item_tracking_codes (item_id, tracking_code_id)    -- many-to-many
            └─ subscription_lines (item_id, organisation_id, location_id, ...)
                 └─ invoice_lines  (accounting_tracking_codes TEXT[] snapshot)
```

Key design choices:

1. **Codes belong to a location**, not globally — so each workspace owns its own chart.
2. **Items link to codes via `item_tracking_codes`** — a join table, not a column. An item can live under multiple codes (e.g. a meeting room billed against both "Rooms" and "Level 1").
3. **Primary code** — `tracking_codes.is_primary = true` marks the default code surfaced first in the cascading dropdown and auto-picked during backfills.
4. **Invoice lines snapshot the codes as `TEXT[]`** — once an invoice is issued, its tracking codes are frozen. Renaming a code later doesn't rewrite history. This is deliberate: the accounting system expects immutability.

### Cascading dropdown

The UX for selecting tracking codes — on the item detail page, subscription form, and invoice line editor — is a cascade driven by the chosen `location_id`:

1. User selects a **Location** (primary dropdown).
2. The **Tracking Codes** area underneath filters `tracking_codes` to that `location_id` + `active = true`, grouped by `category`, primary first.
3. User ticks one or more codes. Selection persists as rows in `item_tracking_codes` (for items) or in the subscription/invoice line's own code array.

This pattern lives in:
- `items/[id]/+page.svelte` — on the Properties tab, below Location
- `items/+page.svelte` — create-item form
- `subs/` — subscription line form
- `invoices/[id]/edit/+page.server.ts` — line editor's `addLine` action

The client filters from a single preloaded `tracking_codes` list (cached via `$lib/services/item-lookups.service.ts`), so changing location is instant — no network roundtrip.

### Snapshotting into invoice lines

When a subscription line becomes an invoice line (via `createInvoiceFromSubs` on the org page, or `addLine` on the invoice edit page), we resolve the item's current code set:

```sql
items → item_tracking_codes → tracking_codes.code
```

and copy the resulting `code[]` array into `invoice_lines.accounting_tracking_codes`. That column is never read back from `item_tracking_codes` — the invoice line is self-describing from that point on.

### Filters exposed to users

On `/items` the list offers:
- **No tracking codes** — items with an empty `item_tracking_codes` link set (candidates for backfill).
- **On active subs** — items that appear on at least one `subscription_lines` row with `status = 'signed'`.

Both filters use streamed data from the server (item-ids sets) and evaluate client-side on the existing items list.

## Backfilling tracking codes

Re-runnable SQL to give every location-bound item its location's best available code (primary first):

```sql
INSERT INTO item_tracking_codes (item_id, tracking_code_id)
SELECT i.id, tc.id
FROM items i
JOIN LATERAL (
  SELECT id FROM tracking_codes
  WHERE location_id = i.location_id AND active = true
  ORDER BY is_primary DESC, category NULLS LAST, code
  LIMIT 1
) tc ON TRUE
WHERE i.location_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM item_tracking_codes itc WHERE itc.item_id = i.id);
```

Safe to re-run — the `NOT EXISTS` guard prevents double-inserts.
