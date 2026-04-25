# Architecture

High-level shape of the Proximity Green platform. Read this first; read `CONVENTIONS.md` for the rules that follow from it.

## Stack

- **Web app** — SvelteKit 2 + Svelte 5 (runes), TypeScript. Adapter: `@sveltejs/adapter-node`. Lives in `apps/web/`.
- **Database & auth** — Self-hosted Supabase (Postgres + GoTrue + PostgREST + Storage). Migrations in `packages/database/migrations/` (`NNN_name.sql`, sequential).
- **Background jobs** — Trigger.dev v3 (`apps/web/src/trigger/`). Hosted at `jobs.poc.proximity.green`.
- **Email** — Mailgun (transactional + invite emails).
- **Hosting** — Hetzner VPS managed by Coolify. Production app: `poc.proximity.green`. Background jobs container alongside.
- **Repo layout**
  ```
  apps/web/                  SvelteKit app (UI + server actions + trigger tasks)
  apps/mobile/               (placeholder)
  packages/database/         SQL migrations
  packages/api/              (placeholder)
  packages/adapters/         (placeholder)
  docs/                      this folder
  scripts/                   one-off ops scripts
  ```

## Layering inside `apps/web`

```
src/
  routes/(admin)/...         Admin pages (members, organisations, users, roles, change-log, system-logs, messages)
  routes/(app)/...           End-user app surface (placeholder)
  routes/api/...              JSON endpoints (impersonation, etc.)
  routes/auth/...             Sign-in / OAuth callback / invite-confirm flows

  lib/components/ui/          Shared UI primitives (Button, DataTable, Drawer, Field, Select, Badge, Toast, FormCard, …)
  lib/services/*.service.ts   Per-domain server-only data access (Supabase calls + business logic)
  lib/server/                 Server-only helpers (env, etc.)
  lib/stores/                 Reactive client stores (permissions, prefs, ui)
  lib/utils/                  Pure helpers (csv, tableState, …)
  lib/styles/                 Global CSS / design tokens
  trigger/                    Trigger.dev task definitions
```

**Rule:** server-only code (Supabase service-role, env secrets) goes in `lib/services/` or `lib/server/`. Pages reach it via `+page.server.ts` `load` and `actions`. The browser never imports from `lib/services/`.

## Data flow

```
Browser  →  +page.server.ts  →  *.service.ts  →  Supabase / Trigger / Mailgun
                ↑
            permissions.service guards every action
```

1. SvelteKit `load` runs server-side, calls a service, returns plain data.
2. Form submits hit a SvelteKit `action`; the action checks permission, calls a service, returns `{ success, message }` or `{ error }`.
3. The page reads the action's return via `form` and shows a `<Toast>`.

**Permissions** are enforced at the action boundary by `requirePermission(userId, resource, action)` from `permissions.service.ts`. The DB also has RLS, but the action check is the primary gate (super_admin role bypasses via `permissions = 'all'`).

## Audit & change tracking

- Every domain table has an `AFTER INSERT/UPDATE/DELETE` trigger → writes to `change_log` with `old_values` / `new_values` jsonb.
- **Attribution.** The trigger resolves `changed_by` in order: `auth.uid()` → `x-user-id` request header → `null`. The service layer runs on `service_role` (bypasses `auth.uid()`), so it uses the header — every mutation must be wrapped in `sbForUser(userId)` which sets the header on each request. `changed_by = null` is reserved for migrations, cron, and unauthenticated code paths; the UI renders that as "system". See `CONVENTIONS.md` § "Audit attribution on mutations".
- The trigger honours a per-transaction flag `app.suppress_audit`. The `restore_record(p_table_name, p_record_id, p_new_values, p_changed_by)` RPC sets the flag, performs the UPDATE (which the trigger skips), then writes a single explicit `RESTORE` row. This is the canonical pattern — see `CONVENTIONS.md` § "Multi-step writes go in Postgres".
- The `/changelog` page surfaces this via the shared DataTable with expandable rows showing the field-level diff.

## Realtime — streaming updates to the browser

Supabase Realtime delivers row-level INSERT / UPDATE / DELETE events to subscribed browsers over a websocket. Tables must be in the `supabase_realtime` publication; RLS still governs who sees what.

Two built-in primitives use this:

- **`DataTable` Live feed** — pass `realtimeTable="<name>"` and `onRealtimeInsert(raw)`. The component renders a Live toggle in the toolbar, opens/closes the websocket, and hands each event to the page for enrichment and state mutation. Used on `/system-logs` (streams `system_logs`) and `/changelog` (streams `change_log`). Consumer cost: two props plus an enrichment callback.
- **`RecordLive`** — drop on any detail page: `<RecordLive tableName recordId viewerId label />`. Subscribes to `change_log` server-filtered by `record_id`, ignores events where `changed_by === viewerId`, and shows a floating "Updated by X — Refresh?" pill on foreign edits. Used on `/people/[id]` and `/organisations/[id]`; other detail pages are one-line adds.

To enable a new table for Live, add it to the publication in a migration:

```sql
alter publication supabase_realtime add table public.<table>;
```

## UI primitives — change once, applies everywhere

The whole admin surface is built on a small set of shared components in `lib/components/ui/`:

- **`DataTable`** — search (multi-term), filter chips, sort, adaptive pagination (URL + per-user prefs), keyboard nav (arrows, type-ahead, Cmd+Enter, ←/→ to expand/activate), drag-resize columns (saved per user), expandable rows, full-screen toggle (portals to body), CSV export.
- **`Drawer`** — right-side editing surface; portals to body, focus-traps, autofocuses first field, Cmd+Enter submits, Esc closes, full-screen toggle.
- **`Field` / `FieldGrid` / `FormCard` / `Select`** — form building blocks.
- **`SubmitButton`** — form-bound action button with confirm modal, pending state, sibling-hide-while-busy.
- **`PageHead`, `Toast`, `Badge`, `Card`, `Pager`, `Confirm`, `Prompt`, `Copyable`, `KpiCard`** — supporting primitives.

Pages compose these and pass column definitions / snippet content. They never reinvent table/drawer/form chrome.

## Auth

- Supabase Auth (GoTrue) with PKCE flow. `GOTRUE_EXTERNAL_FLOW_STATE_ENABLED=true` is mandatory for self-hosted.
- Email invites flow through `/auth/confirm` — handles hash tokens, `setSession`, and `force_login` to clear stale sessions.
- Impersonation is a server-issued cookie via `/api/impersonate`; the layout banner is shown while active. Permission scope is rebound to the target user.

## External system IDs

Provider-agnostic columns: `external_accounting_customer_id`, `external_payment_customer_id`, etc. Never `xero_id` or `stripe_id`. See `CONVENTIONS.md`.

## Membership & licensing

A person's billing membership and home location come from their **active licence**, not from fields on `persons`. Don't add `membership_id` or `home_location_id` to `persons`. (The old WSM system did and the fields drifted.)

## Deployment

```
ssh root@178.104.205.85 \
  "cd /tmp && rm -rf platform && \
   git clone --depth 1 --branch develop https://github.com/Proximity-Green/platform.git && \
   cd platform/apps/web && \
   docker build --no-cache -t pg-web . && \
   docker stop pg-web && docker rm pg-web && \
   docker run -d --name pg-web --network coolify -e MAILGUN_API_KEY=... \
     -l 'traefik...' pg-web && \
   rm -rf /tmp/platform"
```

`--no-cache` is required — the Docker layer cache has bitten us serving stale code.
