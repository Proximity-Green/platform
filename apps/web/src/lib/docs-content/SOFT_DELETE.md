# Soft-delete — debugging guide

**Read this first** when something feels wrong with deletions, list views, unique constraints, or "why is this row still showing".

The platform soft-deletes everything in tier 1. Soft-delete is universal: a "deleted" row should be invisible everywhere except the change log and admin trash views. If a soft-deleted row appears anywhere a live row would, that's a bug — not a quirk to live with.

---

## Tier 1 (have `deleted_at timestamptz`)

```
items, item_types, tracking_codes, tags
locations, spaces
persons, organisations, legal_entities
contracts, subscription_lines, subscription_option_groups, licenses
notes, feature_requests, message_templates, approved_domains, wallets
```

Everything else (audit logs, junctions, *_details, financial transactions, auth tables) does NOT have `deleted_at`. They cascade with their parent or are append-only.

---

## Where the implementation lives

| What | Where |
|---|---|
| Schema (column, partial uniques, views) | `migrations/047_soft_delete_platform.sql` |
| pg_cron retention (90-day purge) | `migrations/048_pg_cron_purge.sql` |
| Generic apply RPC | `bulk_soft_delete_apply(p_table, p_ids, p_performed_by)` |
| Generic undo branch | `bulk_action_undo` → `'bulk_soft_delete'` branch |
| Per-table purge | `purge_soft_deleted(p_table, p_older_than)` |
| Bulk endpoint | `/api/admin/bulk-soft-delete` (NDJSON, requires `confirm: 'DELETE'`) |
| Convention rule | `CLAUDE.md` (project root) |
| `live_<table>` views | created with `security_invoker = true` for every tier-1 table |
| Change log + Undo UI | `/changelog` (Bulk actions tab) |

---

## Reading rules (non-negotiable)

1. **Every SELECT on a tier-1 table must filter `deleted_at IS NULL`.** Either by reading from `live_<table>` view, or by chaining `.is('deleted_at', null)` on the query.
2. **Every embed of a tier-1 table inside a SELECT must filter the embedded relation too.** `from('items').select('*, locations(name)')` leaks soft-deleted locations unless you add `.is('locations.deleted_at', null)`.
3. **Filter all the way down.** A query like `subscription_lines → licenses → items → item_tracking_codes → tracking_codes` needs `.is('deleted_at', null)` AT EVERY LEVEL including the deepest. If you stop short, soft-deleted rows leak in nested data and the abstraction is broken.

If a list view shows a row that was just deleted, the FIRST suspect is a missing read filter.

---

## Writing rules

- **Soft-delete a single row**: `update <table> set deleted_at = now() where id = ?`. Components doing this directly are fine if they were already going through the same auth path (e.g. `Notes.svelte`).
- **Soft-delete in bulk**: `POST /api/admin/bulk-soft-delete` with `{ table, ids, confirm: 'DELETE' }`. Records a `bulk_actions` row → undoable from `/changelog`.
- **Hard-delete**: never from app code. Only via `purge_soft_deleted(...)` or the nightly pg_cron job.
- **Restore**: undo via `/changelog` (Bulk actions tab) for bulk-deleted rows. Single-row restore needs a manual `update <table> set deleted_at = null where id = ?` until a per-row restore UI is built.

---

## Common debugging scenarios

### "I deleted this row but it's still showing in a list."
- Check the read query. Almost certainly missing `.is('deleted_at', null)`.
- If the row appears via an embedded relation (e.g. shows up as a parent of another row), the embed needs its own filter: `.is('<relation>.deleted_at', null)`.
- After fixing, also check the `live_<table>` view — using the view in place of the base table is cleaner.

### "I'm getting a unique violation when inserting a row that exists in a soft-deleted form."
- The unique constraint isn't a partial index. Should be `CREATE UNIQUE INDEX ... ON <table> (...) WHERE deleted_at IS NULL`.
- Check `migrations/047_soft_delete_platform.sql` for the existing partial-index pattern. If you added a new unique, follow the same pattern.

### "Undo doesn't restore the row."
- Open `/changelog` → Bulk actions tab. Find the action. Is it marked Undone already?
- If the action is `bulk_soft_delete`, the undo flips `deleted_at` back to `NULL`. If the action is something else (e.g. an old `.delete()` call before soft-delete was rolled out), there's no row to restore.
- Hard-deletes by `pg_cron` purge after 90 days are not recoverable. That's the design.

### "A foreign key constraint is failing on a row I can see."
- The referenced parent might be soft-deleted. Soft-deleted rows physically exist, so FK isn't violated — but a UI might offer them in a dropdown by accident.
- Selection UIs (dropdowns, lookups) MUST read from `live_<table>` views or apply `.is('deleted_at', null)`. Don't add a Postgres trigger to enforce "no FK to deleted parent" — that's the UI's job.

### "Realtime subscription isn't firing on delete."
- Soft-deletes are `UPDATE` events, not `DELETE` events. Subscribers expecting `DELETE` need to also listen for `UPDATE WHERE deleted_at IS NOT NULL`.
- If you need true delete events, you're looking at the 90-day pg_cron purge or a manual `purge_soft_deleted(...)` call. Both fire `DELETE`.

### "PostgREST returns 'could not embed' when I add a deep filter."
- Some embed chains are 4–5 levels deep (e.g. `licenses.items.item_tracking_codes.tracking_codes.deleted_at`). PostgREST usually handles them, but the schema cache must know every relationship in the chain.
- If a 5-level chain breaks, demote one level — filter at the junction (`item_tracking_codes`) instead of at the leaf table. Slightly less precise, but resilient.
- If you can, refactor the query to fetch related data in a separate call and join in JS instead of relying on a long embed chain.

### "Invoice / financial path: a soft-deleted item is shaping the invoice."
- All five levels are filtered as of migration 047 + reads-rollout. Specifically:
  - `convertToInvoice` (subscription-lines.service.ts) filters items/licenses/items.tracking_codes
  - `createInvoiceFromSubs` (organisations/[id]/+page.server.ts) does the same
- If a deleted code is still showing on an invoice, check those filters are still present and the embed is still resolving.

### "I added a new tier-1 table — what do I need to do?"
1. Add `deleted_at timestamptz` column.
2. Add `live_<table>` view with `security_invoker = true`.
3. Convert any unique constraints to partial indexes (`WHERE deleted_at IS NULL`).
4. Add the table name to the whitelists in `bulk_soft_delete_apply`, `bulk_action_undo`, `purge_soft_deleted`, `purge_all_tier1_soft_deleted`.
5. Seed the `bulk_actions.delete_<table>` permission for admin/super_admin.
6. Update CLAUDE.md and this doc with the table name.
7. Patch every read site for the new table.

---

## What if soft-delete is in the way?

If you genuinely need a hard-delete for a tier-1 table (data privacy request, GDPR, accidental bulk soft-delete on test data), use `purge_soft_deleted(<table>, '0 seconds')` — that immediately hard-deletes anything currently flagged.

Don't go around the convention with ad-hoc `DELETE FROM ...`. If you do, the change log loses the trail and `bulk_action_undo` won't help anyone.

---

## Why universal?

Because half-soft-delete is worse than no soft-delete: users see "Deleted" but the row still surfaces in dropdowns, embeds, or invoices, and trust dies. Either it's gone everywhere, or you can't claim it's gone.
