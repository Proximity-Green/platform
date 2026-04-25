# Platform conventions

## Soft-delete (universal rule)

The platform uses soft-delete on tier-1 tables. Hard-delete only via `purge_soft_deleted(...)` after retention period.

**Tier-1 tables** (have `deleted_at timestamptz`):
- `items`, `item_types`, `tracking_codes`, `tags`
- `locations`, `spaces`
- `persons`, `organisations`, `legal_entities`
- `contracts`, `subscription_lines`, `subscription_option_groups`, `licenses`
- `notes`, `feature_requests`, `message_templates`, `approved_domains`, `wallets`

**Reading tier-1 tables**

Two equivalent options — pick the one that fits the query:

1. **Use the `live_<table>` view** (preferred for simple top-level lists):
   ```ts
   supabase.from('live_items').select('*').order('name')
   ```
   The view filters `deleted_at IS NULL` automatically.

2. **Use the base table + explicit filter** (when you need PostgREST embeds, since views don't carry FK relationships):
   ```ts
   supabase.from('items')
     .select('*, item_types!inner(name), locations(name)')
     .is('deleted_at', null)
   ```

Never read from a tier-1 base table without one of these. If you need to read soft-deleted rows (admin trash UI, audit), do it explicitly with `.not('deleted_at', 'is', null)` or filter by id.

**Writing tier-1 tables**

Always write to the base table — views are read-only. Inserts and updates work as before. The `deleted_at` column should never be set by app code; use `bulk_soft_delete_apply(...)` or a single-row update via a permission-gated endpoint.

**Soft-deleting**

Don't `DELETE FROM items` or `.from('items').delete()` in app code. Instead:
- Bulk: `POST /api/admin/bulk-soft-delete` with `{ table, ids, confirm: 'DELETE' }`. Permission-gated per table (`bulk_actions.delete_<table>`).
- Single row: same RPC with one id, or build a thin per-table endpoint that calls the RPC.

**Undelete**

Use `bulk_action_undo` with the action's id (returned in the bulk response). The undo branch flips `deleted_at = NULL`.

**Retention / purge**

Soft-deleted rows are kept for 90 days, then hard-deleted via `purge_soft_deleted(p_table, '90 days')`. Wire this to `pg_cron` (Supabase supports it) for nightly cleanup. Configurable per-table interval.

**Unique constraints**

All UNIQUE constraints on tier-1 tables are partial indexes filtered to `deleted_at IS NULL`, so a soft-deleted row's slot is freed when it's deleted. When adding a new unique on a tier-1 table, follow the same pattern:
```sql
create unique index ... on public.<table> (...) where deleted_at is null;
```

**Realtime**

Supabase Realtime fires `UPDATE` events for soft-deletes (not `DELETE`). Subscribers that need to react to deletions should listen for `UPDATE` where `deleted_at IS NOT NULL`.

**FK behaviour**

Soft-deleted parents still satisfy FK constraints (the row physically exists). Selection UIs (dropdowns) must read from `live_<table>` views to avoid offering deleted parents. Do not add triggers to enforce "no new FK to deleted parent" — handle it in the UI layer.

**Tables NOT in tier 1**
- Audit/log: `audit_log`, `bulk_actions`, `change_log`, `system_logs` — append-only.
- Junctions: `item_tracking_codes`, `tag_assignments`, `user_roles`, `feature_request_votes` — cascade with parent.
- Detail tables: `*_details` — follow the parent `items.deleted_at`.
- Auth/session: `permissions`, `roles`, `impersonation_*`, `signatures`, `user_preferences`.
- Financial transactions (use status, not soft-delete): `invoices`, `invoice_lines`, `wallet_transactions`, `subscription_line_rate_history`, `contract_subscription_lines`, `organisation_accounting_customers`.

## Smart errors

User-facing errors must be `ActionableError` — a structured object with title, optional detail, and suggested next-step actions. **Never** return a raw Supabase or Postgres error string to the UI.

- Reactive: wrap operations in try/catch and call `translate(e)` from `$lib/services/errors` to convert the raw error.
- Proactive: before doing the operation, call `findSoftDeleted(table, ids)` to detect missing references and surface a clean `softDeletedRefError(...)`.
- Render via `<ErrorBanner error={...} />` from `$lib/components/ui`.
- Add new error patterns by writing a matcher under `apps/web/src/lib/services/errors/matchers/` and registering it in `translator.ts`. Adding a matcher costs one file plus one line — don't sprinkle one-off humanizers across endpoints.

See `docs/ERRORS.md` for the full convention.

## Bulk actions

All bulk operations record a `bulk_actions` row and are reversible via `bulk_action_undo(p_bulk_action_id, p_undone_by)`. New bulk actions extend the `bulk_action_undo` dispatcher with a new branch — don't reinvent the audit/undo plumbing.

Permission resource is `bulk_actions`, action is the verb (e.g. `update_items`, `delete_items`, `set_role`). Seed in the same migration that adds the action.
