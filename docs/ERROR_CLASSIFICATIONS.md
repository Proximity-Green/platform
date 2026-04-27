# Error classifications — log

A running record of every error pattern the smart-error system has learned to classify, plus pending unclassified errors waiting to get a matcher.

For the design of the system itself see `docs/ERRORS.md`. This doc is the **operational log** — each entry is a real failure observed in the wild that was either (a) added as a new matcher, (b) folded into an existing one, or (c) is queued for next time.

---

## How to use this log

Whenever an `unclassified` banner shows up in your testing or in `system_logs`:

1. Open the banner's "Show technical detail", copy the raw message + URL + when.
2. Add an entry to **§ Open / unclassified** below with the raw message and the action that produced it.
3. If the pattern is a Postgres SQLSTATE-driven failure, write a matcher under `apps/web/src/lib/services/errors/matchers/` and register it in `translator.ts`.
4. Move the entry to **§ Classified** with the matcher file name, the date, and a one-liner on what changed.

Goal: drive `unclassified` to zero for the failure modes that actually happen in this app.

---

## Classified

Each entry: **`code` (SQLSTATE)** — what triggers it · matcher file · when added · notes.

| Code | SQLSTATE | Matcher | Added | Notes |
|------|----------|---------|-------|-------|
| `cross_location_tracking_code` | n/a | `cross-location-tc.ts` | initial | Bespoke trigger message: cannot link a tracking code to an item in a different location. |
| `permission_denied` | 42501 | `permission-denied.ts` | initial | Catches both `requirePermission` denials and Postgres RLS errors. Surfaces the resource name. |
| `duplicate_key` | 23505 | `unique-violation.ts` | initial | Friendlier copy with column names extracted from `Key (col)=(val)`. |
| `fk_violation` / `fk_to_soft_deleted` / `fk_to_possibly_deleted` | 23503 | `fk-violation.ts` | initial | The big one — also detects whether the missing parent is in the soft-deleted state, and surfaces "Open Change Log →" in that case. |
| `not_null_violation` | 23502 | `not-null-violation.ts` | 2026-04-27 | Names the missing column. Driven by the `unclassified` we hit for `column "id" does not exist` testing — added defensively to prevent similar future mismatches showing as generic. |
| `check_violation` | 23514 | `check-violation.ts` | 2026-04-27 | Pulls the field from the constraint name (`<table>_<col>_check` convention). Detail explains common causes (enum mismatch, percent out of range). |
| `string_too_long` | 22001 | `string-too-long.ts` | 2026-04-27 | Surfaces the limit (e.g. "max 50 characters") so the user knows how much to trim. |
| `invalid_text_representation` | 22P02 | `invalid-text-representation.ts` | 2026-04-27 | Most common form: empty-string into a uuid column from a dropdown that didn't blank-out. Detail tailored per target type (uuid / numeric / date / boolean). |
| `undefined_column` | 42703 | `undefined-column.ts` | 2026-04-27 | **Schema/code drift indicator.** Detail names the three usual causes (hardcoded column in SQL func, renamed column, unapplied migration) and points at `packages/database/migrations`. Originally added because `restore_record()` hardcoded `WHERE id = $1` and broke on composite-PK junction tables (fixed in migration 051). Copy was tightened 2026-04-27 to be useful to both end-users and developers. |

---

## Helpers (proactive checks)

| Helper | Returns | When to use |
|--------|---------|-------------|
| `findSoftDeleted(table, ids)` | `SoftDeletedRef[]` | Before doing an op that takes a list of tier-1 ids — surfaces a clean banner with names + "Open Change Log" instead of letting Postgres throw a generic FK error. |
| `softDeletedRefError(table, refs)` | `ActionableError` | Builds the canonical "n records you selected are deleted" banner from the helper's output. |

---

## Open / unclassified

Entries here are pending — either I haven't classified them yet, or the failure is genuinely a one-off that doesn't deserve its own matcher.

_Add new entries by date. When you classify one, move it up to the **Classified** table and link the matcher file._

### 2026-04-27 — _no open items_
All known unclassified failures from this round have been classified.

---

## History — what changed and when

### 2026-04-27 — Wide expansion + restore_record fix

Triggered by: `column "id" does not exist` showing as `unclassified` in `/changelog?filter=delete` when restoring a soft-deleted `item_tracking_codes` row.

Root-cause fix:
- **Migration 051** (`packages/database/migrations/051_restore_record_composite_pk.sql`) — `restore_record()` now reads the table's primary-key columns from `pg_index` instead of hardcoding `id = $1`. Junction tables (composite PK) and any future table with a non-`id` PK now restore correctly.

Smart-error infrastructure improvements (defensive — to give better messages even if a similar bug slips through next time):
- New matcher: `undefined_column` (42703) → `Server bug` chip with "share with support" detail.
- New matcher: `not_null_violation` (23502) → names the missing column.
- New matcher: `check_violation` (23514) → guesses the field from the constraint name.
- New matcher: `string_too_long` (22001) → surfaces the character limit.
- New matcher: `invalid_text_representation` (22P02) → tailored copy per target type (uuid/numeric/date/etc.).

UI surface upgrades — every admin page now shows persistent errors in `ErrorBanner` instead of a fading `Toast`:
- All 19 admin `+page.svelte` files now import `ErrorBanner` and route `form?.actionable ?? form?.error` to it.
- All 17 admin `+page.server.ts` files now call `logFail(userId, scope, err, ctx)` for Postgres-shaped errors. Validation strings (e.g. "Name is required") still use plain `fail()`.
- `Toast` is now success-only across admin — never carries error text.

### Initial release — 2026-04-23 (commit `d509ef6`)
First version of the smart-error system shipped with these matchers: `cross_location_tracking_code`, `permission_denied`, `duplicate_key`, `fk_violation` (+ soft-deleted variants).
