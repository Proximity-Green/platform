# Conventions

The rules. Read after `ARCHITECTURE.md`. These are non-negotiable defaults — deviate only with a good reason and a comment explaining why.

## Database — naming

**Casing:** `snake_case` everywhere. Tables, columns, indexes, constraints, function names. No camelCase, no PascalCase.

**Tables:** plural nouns, South African English spelling.
- ✓ `persons`, `organisations`, `locations`, `roles`, `permissions`, `user_roles`, `system_logs`
- ✗ `organizations`, `Person`, `tbl_users`
- Join tables: `<a>_<b>` ordered alphabetically — `user_roles`, `tag_assignments`.
- Logs: singular when conceptually "the log" (`change_log`); plural when "many entries" (`system_logs`).

**Primary keys:** always `id`, type `uuid`, default `uuid_generate_v4()`.

**Foreign keys:** `<singular_target>_id` — `user_id`, `organisation_id`, `role_id`. Multi-valued only when no join table makes sense: `tag_ids uuid[]`.

**Temporal columns — one rule, no exceptions:**
- **Always `<verb>_at`, always `timestamptz`.**
- Examples: `created_at`, `updated_at`, `onboarded_at`, `offboarded_at`, `started_at`, `last_login_at`, `born_at`.
- No `_date` suffix. No `date_X` prefix. If the source data was date-only, cast to `00:00:00` in `Africa/Johannesburg` at import.
- *Why:* the old WSM system had `start_date`, `date_start`, `createdAt`, `date_created` all mixed. One convention kills the ambiguity.

**Booleans:** descriptive name, no `is_` prefix.
- ✓ `community_visible`, `onboarded`, `requires_impersonation_permission`
- ✗ `is_visible`, `has_onboarded`

**Constrained-value strings (status, kind, type):** plain `text`, lowercase values, `CHECK` constraint.
- `status` ∈ `{'active', 'inactive', 'offboarded'}`

**External system IDs:** name by **role**, not provider. Providers change.
- ✓ `external_accounting_customer_id`, `external_payment_customer_id`, `external_crm_contact_id`
- ✗ `xero_id`, `stripe_id`, `hubspot_id`
- If multi-provider in future: pair with sibling `external_<role>_provider text`.

**Migration trace IDs (for legacy data):** `<source>_id text`, indexed. Not a foreign key.
- `wsm_id` on `persons` is the canonical example (carries the old MongoDB ObjectID).

**URLs / files:** `_url` suffix — `photo_url`, `logo_url`, `invoice_pdf_url`.

**Counts / amounts:** `_count` for integer counts (`member_count`). `_amount` for money — `numeric(12,2)` paired with sibling `currency text DEFAULT 'ZAR'`.

**Avoid:**
- Abbreviations — write `description` not `desc`, `address` not `addr`, `quantity` not `qty`.
- Hungarian-ish prefixes — no `tbl_`, `fld_`, `bln_`.
- Mixing singular/plural for the same concept across tables.

## Database — atomicity & triggers

**Multi-step writes go in Postgres, not in the TS service.**

When a user action needs more than one DB write to be atomic, or needs to coordinate/suppress a trigger, write a `SECURITY DEFINER` Postgres function and call it via `supabase.rpc('fn_name', { ... })`. Do **not** sequence multiple `.from().update()` / `.insert()` calls from TypeScript.

*Why:* the Supabase JS client sends each query as its own transaction. `SET LOCAL` (e.g. `app.suppress_audit`) doesn't carry between calls; trigger-suppression patterns and multi-statement atomicity simply don't work from TS.

**Reference implementation:** `restore_record` in migration `011_restore_rpc.sql`, called from `change-log.service.ts`. The trigger checks `current_setting('app.suppress_audit', true) = 'true'` and early-returns; the RPC sets the flag, performs the UPDATE (skipped by trigger), then writes the explicit `RESTORE` log row — all in one transaction.

**Always add a NOTE comment** in the calling service file pointing to the migration so future readers see why the function is a one-liner `.rpc()` call.

## Domain modelling

**Membership comes from the active licence, not from `persons`.**
- Do **not** add `membership_id`, `home_location_id`, `space_id`, or similar billing/seat fields to `persons`.
- Org affiliation (`organisation_id`) on persons is fine — that's a relationship, not a billing source of truth.
- *Why:* WSM had `user.membership_id` and `user.location_id` as required fields, and they drifted out of sync with the actual licence/contract. We're not repeating that.

## Service layer (TS)

- One file per domain in `lib/services/<domain>.service.ts`.
- Server-only (uses Supabase service-role). Never imported from browser code.
- Function shape returns `{ ok: true, ...data }` or `{ ok: false, error: string }` for mutations; plain data for reads.
- Heavy logic stays here, not in `+page.server.ts`.

## Server actions (`+page.server.ts`)

- Always permission-check first:
  ```ts
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'update')
  ```
- Return `{ success: true, message: '…' }` for the Toast (don't return raw service results).
- Return `fail(400, { error: '…' })` for failures.
- Empty-string form values → `null` for nullable columns (use a `blank()` helper).

## UI

**Always reach for a primitive in `lib/components/ui/` first.** Reinventing a table, drawer, or form is forbidden — extend the primitive instead.

**Tight UI rule:** default to minimal whitespace; compact controls; dense rhythm; no wasted space.

**Tables:** every list page uses `DataTable`. Pass `title` + `lede` + `pageActions` snippet so full-screen mode renders its own header (PageHead handles normal mode).

**Editing:** use `Drawer` with `formId`. Cmd+Enter submits, Esc closes, focus traps, autofocus first field.

**Toasts/feedback:** every form-result message goes through `<Toast>` reading `form?.success` / `form?.error` / `form?.message`. Don't `alert()`.

**Confirmation dialogs:** use `<Confirm>` (or `<Prompt>` for text input). No browser `confirm()` / `prompt()`.

**Action results in tables:** use `<SubmitButton>` for delete/restore/archive — handles confirm, pending state, and hiding sibling actions while in-flight.

## Forms

- Use `<Field>`, `<FieldGrid cols={1|2|3|...}>`, `<Select>` — never raw `<input>` / `<select>`.
- `<Field>` accepts children: `<Field label="Status"><Select … /></Field>` for non-input controls.
- Date inputs: `type="date"`, value formatted `YYYY-MM-DD`. Server stores as `timestamptz` (midnight in `Africa/Johannesburg`).

## Per-user state

- Filters/sort/page size/column widths persist to BOTH the URL and the `user_preferences` table (jsonb blob).
- Hydrate from preferences on first load if URL has no value.
- Implementation: `lib/utils/tableState.svelte.ts` + `lib/stores/prefs.ts`.

## Auth

- PKCE flow only. `GOTRUE_EXTERNAL_FLOW_STATE_ENABLED=true` is required for self-hosted Supabase.
- `/auth/confirm` handles invite tokens (signs out current user first if needed).
- Impersonation is a cookie set by `/api/impersonate`. Layout shows a banner; permissions rebind to target user.

## Migrations

- Sequential numbered SQL files in `packages/database/migrations/NNN_name.sql`.
- One concern per file. Re-runnable via `IF NOT EXISTS` / `OR REPLACE` where possible.
- After functions/RPCs change, end with `NOTIFY pgrst, 'reload schema';` so the API picks them up.

## Logging

- App-side events go through `lib/services/system-log.service.ts` (`log(...)`). Surfaces in `/system-logs`.
- DB changes are auto-logged by triggers to `change_log`. Surfaces in `/changelog`.
- For user-facing operational status (mailgun/trigger/supabase), use the source/via tags already in `system-logs`.

## Deployment

- `develop` branch → `poc.proximity.green`. There is no separate `main` for now.
- Always `docker build --no-cache` and `git clone --depth 1 --branch develop` — the cache has served stale code in the past.
- See `ARCHITECTURE.md` § Deployment for the full SSH command.

## Things to avoid

- `is_*` boolean prefixes
- `*_date` columns
- `xero_*` / `stripe_*` columns
- `confirm()` / `prompt()` / `alert()` in the browser
- Raw `<input>` / `<select>` / `<table>` in pages
- Sequencing multi-write logic in TS when atomicity matters
- Hardcoded color hex values in component CSS (use design tokens — `var(--accent)`, `var(--text-muted)`, etc.)
- Long docstrings / multi-line comment blocks in code (one short line max; explain *why*, not *what*)
