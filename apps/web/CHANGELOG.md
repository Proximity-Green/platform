# Proximity Green — Development Changelog

## Weekend Sprint 1 — 2026-04-18/19

### Infrastructure
- Hetzner CPX41 (4 vCPU, 16GB RAM) in Nuremberg — upgraded from CX33 mid-session
- Coolify managing all services with SSL via Let's Encrypt
- Supabase self-hosted at `db.poc.proximity.green`
- n8n at `auto.poc.proximity.green`
- Trigger.dev deployed (stopped to save RAM)
- Cloudflare DNS with wildcard `*.poc.proximity.green`
- SvelteKit app live at `poc.proximity.green` with Node adapter + Dockerfile
- GitHub repo `Proximity-Green/platform` with `main` and `develop` branches
- Mailgun SMTP via `mg.proximity.green` — sends from `noreply@proximity.green`

### Database — 12 Tables
- **POC schema**: roles, legal_entities, locations, organisations, persons, permissions
- **Auth**: user_roles, approved_domains, impersonation_sessions, impersonation_permissions
- **Platform**: change_log, notes, tags, tag_assignments, system_logs
- Auto-audit triggers on all tables — every INSERT/UPDATE/DELETE captured with old/new JSONB

### Authentication
- Google OAuth via Supabase Auth with PKCE flow (proper server-side sessions)
- Email/password login alongside Google
- Account picker forces Google to show chooser
- Invite-only access — uninvited users from non-approved domains blocked and deleted
- Approved domains: `proximity.green`, `workshop17.com`
- Invite flow: admin invites → Mailgun sends email → user clicks link → sets password

### User Management (`/users`)
- List all users with email, auth method, role, status, last sign in with method
- Invite, resend invite, reset password, revoke, restore, delete
- Role assignment via dropdown
- Permission badges shown inline
- Impersonate button with reason and audit logging

### Roles & Permissions (`/roles`)
- 4 default roles: super_admin, admin, finance, member
- Custom roles with name/description
- Permissions per role: resource + action (read/create/update/delete/manage)
- 11 resources: persons, organisations, locations, subscriptions, invoices, wallets, users, roles, audit_log, system_logs, settings
- Centralized `can()` store — UI auto-hides based on role
- Server-side `requirePermission()` on every page
- Styled 403 page showing current vs required permissions
- Super admin bypasses all checks

### Impersonation
- Start from Users page with mandatory reason
- Red banner showing target user, their role, admin identity
- Target user's permissions enforced during impersonation
- Exit returns to Users page
- Audit logged with timestamps

### People CRUD (`/people`)
- List sorted by created_at desc
- Create, edit inline, delete with confirmation
- Batch generate (+10 Random) and single fill (Fill Random)
- USER badge on persons with linked auth accounts
- Invite button to create user from person record, auto-links user_id

### Profile (`/profile`)
- Edit name and phone — saves to auth.users metadata AND persons table
- Person/User link — proves Blueprint's separation
- Set password for Google users (dual auth method)
- Account info, permissions display

### Change Log (`/changelog`)
- PostgreSQL triggers capture every change automatically
- Field-level diffs: old → new per field
- Restore to previous version (logged as RESTORE action)
- Filters by table and action, pagination
- Changed By column resolving user IDs to emails

### System Logs (`/system-logs`)
- Stats dashboard: total, email, auth, system, warnings, errors
- Category and level filters
- Expandable details
- Auto-logging on invites, revocations, password resets, deletions

### Dev Tools
- DEV panel toggle showing permissions, impersonation state
- Organisations "coming soon" page with feature cards

### Architecture
- Centralized permission store with `can(resource, action)`
- Server-side permission enforcement on all routes
- Polymorphic Notes and Tags components (ready, not yet wired to pages)
- Deploy via CLI: git clone + docker build + Traefik labels

---

### Known Issues for Next Session
1. `revoked_by` empty in system logs — getUserIdFromRequest needs PKCE cookie update
2. Browser dialogs (prompt/confirm) need proper in-app modals
3. Organisations CRUD — schema exists, needs actual page
4. Person detail page needed for User → Person link
5. Copy permissions from existing role
6. Theme engine / look and feel
7. Wire Notes & Tags into People page
8. Move keys out of Dockerfile
9. Make repo private (deploy key blocked by org policy)
