# Proximity Green — Development Changelog

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
1. WYSIWYG email template editor with raw HTML toggle
2. Wire trigger task to read templates from database
3. Deploy trigger worker to server (`trigger deploy`)
4. Organisations CRUD
5. Person detail page
6. Replace browser dialogs with proper modals
7. Wire Notes & Tags into People page
8. Copy permissions from existing role
9. Theme engine / look and feel
10. Move keys out of Dockerfile
11. Make repo private
