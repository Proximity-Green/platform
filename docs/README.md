# Platform docs

The canonical reference for how this repo works. Rendered live inside the app at `/docs`.

## Files

### [`ARCHITECTURE.md`](ARCHITECTURE.md) — the shape
What lives where, what talks to what, how the pieces fit.

- **Stack** — SvelteKit 2 + Svelte 5, self-hosted Supabase (Postgres + GoTrue + PostgREST), Trigger.dev for background jobs, Mailgun for email, Hetzner + Coolify for hosting.
- **Repo layout** — `apps/web/` (the app), `packages/database/migrations/` (schema), `docs/` (this folder).
- **Layering** — `lib/services/*.service.ts` (server-only Supabase access) ← `+page.server.ts` (actions, guarded by permissions) ← `routes/` (pages).
- **Audit pipeline** — every domain table has a trigger writing to `change_log`; a session-local `app.suppress_audit` flag lets multi-step RPCs (like `restore_record`) coordinate single-row audit behaviour.
- **UI primitives** — `DataTable`, `Drawer`, `Field`, `Select`, `Badge`, `Toast`, `SubmitButton`… every page composes these; no one re-invents table / drawer / form chrome.
- **Auth** — Supabase with PKCE, `/auth/confirm` for invite tokens, cookie-based impersonation via `/api/impersonate`.
- **Deploy** — single SSH command to Hetzner that rebuilds the Docker container with `--no-cache` and swaps it in under Traefik.

### [`CONVENTIONS.md`](CONVENTIONS.md) — the rules
Concrete, non-negotiable defaults. Deviate only with a good reason and a comment.

- **DB naming** — `snake_case`, plural tables, `id uuid` PKs, `<entity>_id` FKs, **every timestamp is `<verb>_at timestamptz`** (no `_date` suffix ever), booleans without `is_` prefix, `CHECK`-constrained status strings.
- **External IDs** — provider-agnostic: `external_accounting_customer_id`, not `xero_id`. Survives vendor swaps.
- **Domain** — membership / home location come from the active licence, **not** from fields on `persons`.
- **Atomicity** — multi-step writes or trigger-coordination go into a `SECURITY DEFINER` Postgres function called via `supabase.rpc(...)`. Never sequence multi-write logic from TypeScript.
- **Services** — one file per domain; returns `{ ok: true } | { ok: false, error }`; server-only.
- **Server actions** — permission-check first, return `{ success, message }` for the Toast, `fail(400, { error })` on failure; empty strings → `null`.
- **UI** — reach for a primitive first; tight whitespace; no browser `confirm()` / `prompt()` / `alert()`; no hardcoded hex colors (use design tokens); no raw `<input>` / `<table>` in pages.
- **Per-user state** — filters/sort/size/column-widths persist to URL **and** the `user_preferences` jsonb blob.
- **Migrations** — sequential `NNN_name.sql`, one concern per file, end with `NOTIFY pgrst, 'reload schema';` when adding RPCs.

### [`BENCHMARK.md`](BENCHMARK.md) — our design vs Stripe / Chargebee / Xero / ERP
Point-in-time analysis of the billing & subscription schema against industry references. Useful to understand where we're stronger, where we match, and which gaps are intentional for POC.

### [`MIGRATION.md`](MIGRATION.md) — WSM → PG field-by-field map
Canonical record of every legacy WSM (Mongo) field we're keeping, renaming, or dropping when importing to Postgres. Keep this in sync with the schema migrations.

### [`../CHANGELOG.md`](../CHANGELOG.md) — session-by-session development log
Every shipped session with links back to the commits. Rendered at `/dev-changelog`.

## Keeping these docs alive

Any commit that changes architecture, conventions, primitives, or services must update the relevant file **in the same commit**. The in-app `/docs` page reads these files at request time, so updating the markdown is all that's needed — no rebuild, no extra step.
