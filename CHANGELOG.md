# Proximity Green — Development Changelog

## Session 6 — 2026-04-23

### Audit attribution — service_role writes now name the user

**Problem.** Every domain mutation in the service layer ran as `service_role`, which bypasses Supabase auth, so `auth.uid()` inside the `change_log` trigger returned null. Every change_log row was logged as `changed_by = null` → the /changelog UI showed **"system"** for every edit, even ones a logged-in admin had just performed.

**Fix.**
- Migration `039_changelog_user_header_fallback.sql` — trigger now prefers `auth.uid()`, falls back to an `x-user-id` HTTP header forwarded by PostgREST. Null only for migrations, cron jobs, or unauthenticated code paths.
- New helper `sbForUser(userId)` in `permissions.service.ts` — returns a service_role Supabase client with `x-user-id` set on every request. If `userId` is null, returns the shared client (preserves "system" for genuinely unattributed writes).
- **Every mutation path rewired** through `sbForUser(userId)`:
  - 14 service files (`persons`, `items`, `item-types`, `licenses`, `invoices`, `contracts`, `wallets`, `subscription-lines`, `locations`, `spaces`, `roles`, `messages`, `users.setUserRole`, `feature-requests`)
  - 13 route files — every `+page.server.ts` action threads `userId` through to the service
  - Inline mutations on `organisations/[id]`, `invoices/[id]/edit`, `locations/[id]` (tracking_codes), `people` (user_roles), `items` (item_tracking_codes + family detail upserts) all converted
- Locked in as the canonical pattern — see `CONVENTIONS.md` § "Audit attribution on mutations".

### Live realtime — stream new rows into list pages

**DataTable primitive.** Two new props on `DataTable`:
- `realtimeTable: string` — Supabase table to subscribe to for INSERTs
- `onRealtimeInsert(raw)` — called per event so the page can enrich (e.g. resolve user IDs to emails) and mutate its own data state

The Live toggle pill lives in the table toolbar; websocket closes on tab navigate-away. Tables must be in the `supabase_realtime` publication — migration `035_system_logs_realtime.sql` adds both `system_logs` and `change_log`.

**Consumer code went from ~50 lines per page to ~20.** `/system-logs` and `/changelog` now just pass the two props and an enrichment callback. Any future table-backed page gets Live for free.

### Record-level Live — detail pages notice foreign edits

New `$lib/components/ui/RecordLive.svelte` component. Subscribes to `change_log` INSERTs server-filtered by `record_id=eq.<id>`, ignores events with `changed_by === viewerId` (your own edits), and on a foreign update shows a floating pill top-right:

> This {label} was just updated by **mark@proximity.green** — [Refresh] [×]

Refresh calls `invalidateAll()`; the pill dismisses. Name resolution is best-effort `persons.user_id` lookup client-side with an 8-char UUID fallback.

Wired into `/people/[id]` and `/organisations/[id]` as pilots; other detail pages are one-line adds.

### System logs — richer details, non-silent writes

- `logFail` (`action-log.service.ts`) now normalises unknown errors — PostgrestError / Error / bare objects all produce readable messages with `error_code` / `error_hint` / truncated stack. No more `[object Object]` in system_logs.
- `log()` (`system-log.service.ts`) now surfaces failed INSERTs to the dev console instead of silently dropping them (RLS / schema / creds problems were previously invisible).
- Invite flow in `persons.service.ts` — added breadcrumb logs (`Invite flow started`, step-by-step error logs on `generateLink` / `persons.update` / `user_roles.insert`), `trigger_key_kind` (`dev`/`prod`/`unknown`/`missing`), `invite_url`, `duration_ms`, and `trigger_error_stack` when `tasks.trigger()` throws. Turned a silent "invite returns success but nothing happens" into a visible one-row diagnosis.

### Trigger.dev routing fix

Local dev worker ran fine but jobs never reached it. Root cause: Trigger.dev SDK reads `process.env.TRIGGER_SECRET_KEY`, but SvelteKit loads `.env` values into `$env/*` modules — not `process.env`. Fixed by exporting `TRIGGER_SECRET_KEY` / `TRIGGER_API_URL` from `lib/server/env.ts` and calling `configure({ secretKey, baseURL })` at module load in `persons.service.ts`.

### Docs & nav polish

- Added **Sage meeting prep** doc (`docs/SAGE.md`) — concepts primer (legal entity vs location vs organisation vs tracking code), SA legal-entity / location map (Refuel, BCT, Rozenhof, W17 Cradock + TBD HPC/CC/MZ), themed API questions, walkaway criteria, post-meeting checklist.
- Rearranged `/docs` sidebar with an **Integrations** heading; `SAGE_MEETING.md` renamed to `SAGE.md`, label shortened to "Sage".
- `Docs` nav item moved from the "More" dropdown to a right-aligned button next to the search (W17 theme).
- Admin dashboard (`/admin`) grew a **Docs** section with grouped cards (Reference / Integrations).

### DataTable sort tiebreaker

When sorted by any non-date column, rows with identical primary values were tie-broken arbitrarily — streamed realtime rows landed in random places inside their group. Fixed: stable secondary sort on `created_at DESC` whenever rows carry it. New rows always float to the top of their group.

### Migrations

- `035_system_logs_realtime.sql` — `system_logs` + `change_log` added to `supabase_realtime` publication
- `039_changelog_user_header_fallback.sql` — trigger reads `x-user-id` header fallback

---

## Session 5 — 2026-04-20 / 2026-04-21

### Shared UI primitives — keyboard-first everywhere
- New primitives exported from `lib/components/ui/`: `Prompt`, `Select`, `SubmitButton`
- **DataTable** overhaul — arrow-key row nav across pages, Cmd+Enter activate, type-to-jump (`h` jumps to first row starting with "h"), multi-term search ("mark seftel" now matches), drag-resize columns (saved per user), full-screen toggle that portals to `document.body` (no stacking-context clashes)
- **DataTable** expandable rows — `→` expands, `←` collapses; on pages without expand, `→` opens the Edit drawer
- **Drawer** — focus trap, autofocus first field, Tab wraps, full-screen toggle, portals to body
- **SubmitButton** — hides sibling actions while a submission is in flight

### Roles page — expandable view
- Rows click-to-expand: shows permissions + assigned users in-place
- Inline "Add Permission" form (stays open after submit)
- Hover-reveal × to detach a user from a role
- Edit role (name + description) via Drawer; system roles have read-only names
- Permissions dropdowns widened (Resource 180px / Action 140px) and alphabetised

### Change Log page — rebuilt on shared primitives
- Refactored off hand-rolled table onto `DataTable` with filter chips (All/Insert/Update/Delete/Restore), sort, adaptive pagination, multi-term search, CSV export, full-screen
- Action badges via `<Badge>` (success/info/danger/warning tones)
- Expandable row shows field-by-field diff (old → new) with a **Restore to this version** button on UPDATE rows
- **RESTORE entries render distinctly** from UPDATE (orange ↩ arrow, explanatory header, warning-tone value) — no more look-alike rows
- Timestamps always show `HH:MM:SS.mmm` (millisecond precision) — ordering and debugging now unambiguous
- Columns: `changed_by_email` (was raw UUID), sortable / searchable

### Restore single-row fix (DB)
- Migration `011_restore_rpc.sql` — new `restore_record()` RPC runs the snapshot + UPDATE + RESTORE-row insert in one transaction, with a session-local `app.suppress_audit` flag the trigger honours
- Result: one user action → one `RESTORE` row (previously got `RESTORE` + duplicate `UPDATE`)
- Locked in as the canonical pattern for any multi-step audit-aware write

### Persons — WSM-critical fields migrated
- Migration `012_persons_wsm_fields.sql` adds: `id_number`, `wsm_id`, `organisation_id`, `department`, `status` (active/inactive/offboarded), `started_at`, `onboarded_at`, `offboarded_at`, `external_accounting_customer_id`
- Edit Member drawer restructured into four sections: **Identity / Affiliation / Lifecycle / Finance** with Select dropdowns (org, status) and native date pickers
- Provider-agnostic naming: `external_accounting_customer_id` (not `xero_id`) so the column survives an accounting-tool swap
- `membership_id` / `home_location_id` intentionally **not** migrated — they come from the licence now, not from the person

### Members page polish
- Actions reordered: `Invite | Edit | Delete`
- Cmd+Enter opens Edit drawer; Tab cycles trapped inside
- Column widths configurable + saved to user preferences (jsonb blob)
- URL reflects per-user size preference (`?size=100` when set)

### Architecture docs
- New `docs/ARCHITECTURE.md` — stack, repo layout, data flow, audit pipeline, UI primitives, auth, deployment
- New `docs/CONVENTIONS.md` — naming rules (snake_case, `<verb>_at` timestamps, no `_date`, provider-agnostic external IDs, `<entity>_id` FKs), service-layer shape, UI primitive rule, migration discipline, things-to-avoid list
- In-app **Docs** page at `/docs` renders the markdown live (server reads files per request, `marked` renders); sidebar link added
- Rule: architecture/convention changes must update these docs in the **same commit** going forward

### Commits
- `a87411b` feat: changelog refactor, persons WSM fields, in-app docs
- `676f8b1` feat: full-screen toggle on Drawer and DataTable
- `62ad36e` feat: widen roles page Select dropdowns, sort permissions
- `d8460cb` feat: keyboard-first tables, expandable Roles page, column resize
- `53a0bcd` feat: shared UI primitives + keyboard-first Members page

---

## Session 4 — 2026-04-19, 14:00–15:40

### Single Welcome Email with Invite Link
- Replaced `inviteUserByEmail` with `generateLink` — no more Supabase invite email
- Invite link embedded in our branded welcome email — user gets ONE email, not two
- Welcome email reads from `message_templates` table — no hardcoded HTML in trigger task
- Email shows two sign-in options: "Sign In with Google" or "Set Password"
- Email explicitly shows which email address to use for Google sign-in
- `{{inviteUrl}}` and `{{appUrl}}` variables added to template

### Confirm Page Fix
- Parses `access_token` and `refresh_token` directly from hash fragment
- Calls `setSession()` to override any existing session
- Shows the **invited person's email**, not the admin's
- Works whether admin is signed in or not

### Force Login
- `?force_login=true` URL param — signs out current user and shows login page
- Used in welcome email "Sign In with Google" button
- Prevents auto-login as admin when clicking from email

### Trigger.dev — Fully Working
- Trigger.dev initialized and connected
- SMTP configured with Mailgun for magic link login
- `send-welcome-email` task reads template from database
- Mailgun delivery status checked after 8s delay
- Mailgun status shown as colour-coded tags (DELIVERED/ACCEPTED/FAILED) in system logs
- Mailgun log URL included in system log details (clickable)
- Admin notification emails disabled (too noisy during testing)
- Trigger.dev run ID and URL logged in system logs
- `MAILGUN_API_KEY` set as runtime env var (not in source code — GitHub push protection caught it)
- Node.js v20 installed on server for future `trigger deploy`

### Message Templates (`/messages`)
- `message_templates` table renamed from `email_templates`
- Multi-channel support: email, sms, whatsapp, push, in_app
- Template editor with preview, edit, test send
- Channel badges
- Test sends logged in system logs
- `settings` resource added to permissions dropdown

### System Logs Improvements
- Clickable URLs in expanded details
- Mailgun status tags (colour-coded)
- Trigger status tags
- Test email sends logged with template name

---

## Session 3 — 2026-04-19, 11:30–14:00

### PKCE Auth Flow (properly fixed)
- `createBrowserClient` from `@supabase/ssr` — stores PKCE verifier in cookies
- `flowType: 'pkce'` on client — Google OAuth now returns `?code=` not `#access_token=`
- Server-side sessions fully working — `locals.getSession()` returns user on every request
- `getActualUserId()` uses `locals.getSession()` instead of manual cookie parsing
- All page.server.ts files updated to pass `locals` for user identification

### Audit Attribution Fix
- PostgreSQL `set_config('app.current_user_id')` set before every database operation
- Audit trigger reads `current_setting('app.current_user_id')` as fallback when `auth.uid()` is null
- Every change made through the app now records WHO made it
- `set_user_context()` RPC function created in PostgreSQL

### Trigger.dev — Fully Operational
- Trigger.dev initialized and connected to `jobs.poc.proximity.green`
- `send-welcome-email` task: sends branded welcome email to invited person
- Admin notification: emails ALL admin and super_admin users when someone is invited
- Mailgun API integration for email delivery
- Trigger.dev run ID logged in system logs
- SMTP configured for Trigger.dev magic link login
- Node.js v20 installed on server for future `trigger deploy`

### Message Templates (`/messages`)
- `message_templates` table — multi-channel: email, sms, whatsapp, push, in_app
- Template editor with HTML body, text body, subject, variables
- Live preview with variable substitution
- Send test email directly from the UI
- Test sends logged in System Logs
- Create, edit, delete templates
- Channel badges (email/sms/whatsapp/push/in-app)
- Two seed templates: welcome-member, admin-new-member

### System Logs Improvements
- UUIDs auto-resolved to emails in log details
- `performed_by` and `impersonating` shown when action done during impersonation
- Auth actions (invite, revoke, restore, delete, role change, password reset) all logged with user attribution
- Test email sends logged

### Person → User Flow Refined
- Invite removed from Users page — Person-first flow only
- Create Person → Invite from People page → auto-links user_id + assigns member role
- Users page shows hint: "To add a new user, first create a Person"

### Debug & Dev Tools
- `/api/debug-session` endpoint — shows cookies, session, actualUserId, effectiveUserId
- Session debug link in nav bar
- Dev changelog page at `/dev-changelog`

---

## Session 2 — 2026-04-19, 06:30–09:30

### Server-Side Permission Enforcement
- `requirePermission()` on all page.server.ts load functions and actions
- Styled 403 error page showing user, current role, current permissions, required permission
- Permission-aware UI via centralized `can()` store — buttons/nav auto-hide

### Centralized Permission Store
- `$lib/stores/permissions.ts` — loads once in layout, available to all pages
- `canDo(perms, resource, action)` — reactive permission check
- No more manual `canCreate`/`canUpdate`/`canDelete` flags per page

### Change Log (`/changelog`)
- Auto audit triggers on all tables (PostgreSQL `change_log_trigger`)
- Field-level diffs with old → new display
- Restore to previous version
- Changed By column with email resolution
- Filters by table and action, pagination
- Auth actions (invite, revoke, delete) logged in change_log

### System Logs (`/system-logs`)
- Stats dashboard (total, email, auth, system, warnings, errors)
- Category and level filters
- Expandable details with JSON context
- Separate `system_logs` permission

### Notes & Tags Components
- `Notes.svelte` — polymorphic, entity_type + entity_id, time-ago display
- `Tags.svelte` — polymorphic, colour picker, create-and-assign inline
- Database tables: notes, tags, tag_assignments
- Ready to wire into any entity page

### Profile (`/profile`)
- Edit first name, last name, phone
- Saves to both auth.users metadata AND persons table
- Person ↔ User link working
- Set password for Google users
- Permissions and account info display

### Other
- Random data generator: +10 Random batch, Fill Random single
- USER badge on persons with linked auth accounts
- Invite from People page with auto member role
- Google account picker (`prompt: 'select_account'`)
- `/login` redirects to home
- Organisations "coming soon" page

---

## Session 1 — 2026-04-18, 16:00–22:50

### Infrastructure
- Hetzner CPX41 (4 vCPU, 16GB RAM) in Nuremberg — upgraded from CX33 mid-session
- Coolify managing all services with SSL via Let's Encrypt
- Supabase self-hosted at `db.poc.proximity.green`
- n8n at `auto.poc.proximity.green`
- Trigger.dev at `jobs.poc.proximity.green`
- Cloudflare DNS with wildcard `*.poc.proximity.green`
- SvelteKit app live at `poc.proximity.green` with Node adapter + Dockerfile
- GitHub repo `Proximity-Green/platform` with `main` and `develop` branches
- Mailgun SMTP via `mg.proximity.green` — sends from `noreply@proximity.green`

### Database — POC Schema
- 8 tables: roles, legal_entities, locations, organisations, persons, permissions, user_roles, approved_domains
- RLS policies defined
- Impersonation tables: impersonation_sessions, impersonation_permissions

### Authentication
- Google OAuth via Supabase Auth
- Email/password login
- Invite-only access + approved domains
- Approved domains: `proximity.green`, `workshop17.com`

### User Management (`/users`)
- List users with email, auth method, role, status, last sign in
- Invite, resend, reset password, revoke, restore, delete
- Role assignment dropdown
- Permission badges inline
- Impersonate with reason and audit

### Roles & Permissions (`/roles`)
- 4 default roles: super_admin, admin, finance, member
- Custom roles
- Permissions per role: resource + action
- Super admin bypasses all checks

### Impersonation
- Red banner with target user, role, admin identity
- Target permissions enforced
- Audit logged

### People CRUD (`/people`)
- Create, edit, delete
- List sorted by created_at desc

---

### Next Session TODO
1. **Theme engine / look and feel** — CSS custom properties from themes table, prove white-label capability
2. **Organisations CRUD** — actual page, schema exists
3. **Deploy trigger worker to server** — `trigger deploy` so it runs without laptop
4. **Mailgun webhook** — receive delivery/bounce events, replace 8s delay hack
5. **WYSIWYG email template editor** with raw HTML toggle
6. **Person detail page** — for User → Person link from Users page
7. **Wire Notes & Tags** into People page
8. **Replace browser dialogs** with proper in-app modals
9. **Copy permissions from existing role**
10. **Field-level permissions** with threshold constraints
11. **Move keys out of Dockerfile** — proper secrets management
12. **Make repo private** — needs deploy key or PAT
13. **Delete user cascade fix** — foreign key error on delete
