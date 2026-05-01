# FreeRADIUS integration

Status: **scoping**, no code yet. Fifth design parcel — the first concrete
sub-system integration to plug into the onboarding orchestrator from
`docs/ONBOARDING.md`.

Covers the bidirectional integration with FreeRADIUS:
- **Outbound (platform → RADIUS)**: provisioning API to add users, suspend
  users, and rotate passwords. Called from the onboarding/offboarding
  flows.
- **Inbound (RADIUS → platform)**: webhook that fires on each user's
  first auth of a session, carrying the user, the source IP, and the NAS
  address (AP ID).
- **Configuration**: a working `freeradius` setup that points at this
  platform.
- **NAS ↔ location mapping**: how the platform knows which physical
  location a given AP belongs to.

## How to use this doc

Same convention as the other parcel docs:

- **Pre-build (now)** — the design contract. Read it, edit it. Rules get
  locked in here before any code is written.
- **Post-build** — the living reference for *why* the code is shaped the
  way it is.

**When to update:** rule changes during a design conversation; code drifts
from a rule during build; new requirement surfaces post-ship (append, don't
rewrite — old rules marked `~~superseded YYYY-MM~~`, not deleted).

**Rule numbering is stable.** Don't renumber when a rule is dropped.

**Audit trail = git history.** Every rule change is a commit with a clear
message.

**Audience:** solo dev + AI pair, *not* admins/operators. V1 ships from
these rules.

## Why a service?

FreeRADIUS is the auth server for member WiFi. The platform owns the
control plane (who exists, who's allowed, when they were onboarded);
FreeRADIUS owns the data plane (every auth packet on every AP). They
need to stay in sync without coupling — RADIUS auth must be fast even if
the platform API is slow or temporarily down, and a member added on the
platform must reach the AP within seconds, not after an hourly batch.

A `radius.service.ts` (working name) consolidates both directions behind
one entry point and keeps the FreeRADIUS-specific concerns (password
hashing, NAS/AP semantics) out of the rest of the codebase.

## Architecture

```
┌──────────────────┐  provisioning   ┌──────────────────┐
│ platform (this)  │  ────────────►  │ FreeRADIUS DB    │
│ apps/web         │   (SQL writes)  │ radcheck/radusergroup
│                  │                 │ + clients table  │
│ /api/radius/*    │  ◄────────────  │                  │
└──────────────────┘   webhooks      └──────────────────┘
        ▲                                    ▲
        │ inbound events                     │ auth/acct packets
        │ (Post-Auth)                        │
        │                                    │
        └────────────────┬───────────────────┘
                         │
                  ┌──────┴──────┐
                  │ access points
                  │ (NAS clients)
                  └─────────────┘
```

Two key decisions:

1. **FreeRADIUS uses its own SQL backend (the standard `rlm_sql` module
   against its own schema), pointing at Postgres.** Same Postgres
   *server* as the platform DB but a different *schema* (e.g.
   `freeradius`) so we don't pollute the platform schema with FreeRADIUS
   internals. Auth checks stay fast (local SQL, no HTTP hop).

2. **The platform writes to the FreeRADIUS schema directly** via the
   Postgres connection it already has. No HTTP API call to FreeRADIUS;
   FreeRADIUS picks up changes on its next auth (which polls the SQL
   table). Cleaner than running a separate FreeRADIUS REST listener.

3. **FreeRADIUS posts back to the platform** on Post-Auth (and optionally
   Accounting-Start) events via `rlm_rest`, hitting platform HTTP
   endpoints under `/api/radius/events/*`.

This means the **provisioning direction is internal Postgres writes**
(no flake surface — pg_cron-style runtime is fine), and the **event
direction is HTTP inbound** (the platform receives, FreeRADIUS retries
on its end if the platform is briefly down — FreeRADIUS already has
its own retry semantics for accounting packets).

## Outbound — provisioning API

### Operations

The platform exposes three internal service functions (called by the
onboarding orchestrator + admin UI), each writing to the FreeRADIUS
schema:

- `addRadiusUser({ username, password, location_id, member_id })`
  — Inserts into `freeradius.radcheck` (the user record) and
  `freeradius.radusergroup` (assigning to a location-scoped group).
  Returns the row id.

- `suspendRadiusUser({ username })`
  — Sets the user to a `suspended` group; FreeRADIUS' rejection rule
  on that group denies auth. Doesn't delete the row — preserves audit.
  Reversible via `unsuspendRadiusUser`.

- `changeRadiusUserPassword({ username, new_password })`
  — Updates the `Cleartext-Password` (or `Crypt-Password` — see hash
  decision below) attribute on the user.

- `removeRadiusUser({ username })` — Hard-delete from
  `freeradius.radcheck` + `radusergroup`. Used during full offboarding
  after suspension period.

### Username convention

> **Rule 1: RADIUS username = `persons.email`.** Stable, unique, what
> members already know. No internal IDs as usernames — they have to
> type it on a phone keyboard. Email is canonical.

Lowercased on insert and on auth comparison (FreeRADIUS handles the
auth-side case-insensitivity via `Stripped-User-Name`).

### Password storage

> **Rule 2: Passwords are stored as bcrypt in the FreeRADIUS schema.**
> Use FreeRADIUS' `Crypt-Password` attribute with bcrypt. The platform
> never stores or sees the cleartext after creation.
>
> Initial password is generated by the platform when the user is
> created; a one-time link is emailed to the member to set their own.
> Rotation goes through the same path (email a one-time link, member
> sets a new one).

Why bcrypt over MD5/cleartext: industry standard, well-supported in
FreeRADIUS, no migration path needed later.

### Per-call audit

Every provisioning call writes a row to `change_log` with
`entity_type = 'radius_user'` and the operator/system that triggered
it. The FreeRADIUS schema is not in the platform's `change_log` trigger
list (it's a separate schema) — the service writes the audit row
explicitly.

## Inbound — events from FreeRADIUS

### Endpoint

`POST /api/radius/events/login` — called by FreeRADIUS' `rlm_rest`
module from the Post-Auth section of `sites-available/default`.

Authentication: a shared HMAC secret in the request header. Every
RADIUS server we run shares the same secret (rotated annually). Bearer
auth in the header; reject if missing or stale.

Payload:

```json
{
  "username": "ravi.okonkwo@example.com",
  "auth_result": "accept",
  "ip_address": "10.20.30.40",
  "nas_address": "192.168.42.1",
  "nas_identifier": "AP-CPT-04",
  "called_station_id": "aa:bb:cc:dd:ee:ff",
  "calling_station_id": "11:22:33:44:55:66",
  "session_id": "5f3a-...",
  "timestamp": "2026-05-01T08:15:00Z"
}
```

### What the platform does on login

1. Resolve `nas_address` (or `nas_identifier`, whichever is more stable)
   to a `location_id` via the JSON map (Rule 3 below).
2. Resolve `username` to a `persons.id` via email match.
3. Insert a row into `radius_login_events` (new table, see schema below).
4. If this is the member's first-ever login (no prior row in
   `radius_login_events` for this person_id), fire a "first-login" event
   so the onboarding orchestrator can mark the WiFi step done.

### First-login signal feeds the onboarding flow

> **Rule 3: First successful RADIUS auth completes the WiFi step on
> the member's onboarding row.** From `docs/ONBOARDING.md`: each
> external integration has its own step in `onboarding_tasks.steps`.
> The WiFi step is marked `started` when the platform provisions the
> RADIUS user; it's marked `done` only when the platform sees the
> first auth packet for that user. Until then, the onboarding row
> stays open at the WiFi step — even though the user is technically
> ready to connect.

This makes "did the member actually connect?" visible to operators,
not just "did the platform try to provision them?".

### Which other events to capture

- **Accounting-Start** — same payload, useful for "active session"
  reporting. Same endpoint or `/api/radius/events/session-start`.
- **Accounting-Stop** — bytes in/out per session; powers "data used"
  reports. `/api/radius/events/session-stop`.
- **Auth-Reject** — rare, useful for security ("this member tried to
  log in 47 times in 5 minutes"). `/api/radius/events/auth-reject`.

V1 ships only the Post-Auth (login) hook. The rest are easy adds once
the wiring is in place.

## NAS ↔ location mapping

> **Rule 4: NAS-to-location mapping lives in
> `locations.network_config jsonb`.** Same precedent as
> `organisations.default_sub_rules` (see `PRICING_AND_FORECAST.md`).
> Read-mostly, evolves freely, queryable enough via JSONB path
> operators.

Shape:

```ts
type LocationNetworkConfig = {
  // List of network access points serving this location.
  // Match RADIUS' nas_address (preferred) OR nas_identifier.
  nas_addresses?: string[]      // e.g. ["192.168.42.1", "192.168.42.2"]
  nas_identifiers?: string[]    // e.g. ["AP-CPT-04", "AP-CPT-05"]
  // Optional: shared secret used by FreeRADIUS' clients.conf for these
  // NAS devices. NOT secret-of-record — kept here so the operator can
  // see which secret applies; rotate via the radius admin UI.
  shared_secret_hint?: string
  // Optional metadata for future reports.
  vendor?: string               // 'unifi' | 'mikrotik' | 'aruba' | …
  notes?: string
}
```

Migration:

```sql
alter table public.locations
  add column network_config jsonb not null default '{}'::jsonb;
```

### Lookup at event-receive time

```ts
async function locationForNas(nasAddress: string): Promise<string | null> {
  const { data } = await supabase
    .from('locations')
    .select('id')
    .or(`network_config->nas_addresses ? '${nasAddress}',network_config->nas_identifiers ? '${nasAddress}'`)
    .is('deleted_at', null)
    .maybeSingle()
  return data?.id ?? null
}
```

(Cleaner with a `?` jsonb-key-exists query in raw SQL — wrap in an RPC
if PostgREST's syntax gets clunky.)

### When to promote to a table

If we ever need:
- Per-AP metadata that's heavier than a string (uptime, last-seen,
  firmware version, hardware id).
- Reporting on AP-level usage in hot paths.
- Ownership: which operator manages which AP.

…then we promote to `network_access_points` (FK to locations) as a
follow-up. Not now.

## Schema additions

### `freeradius.*` (FreeRADIUS schema, separate from public)

Standard FreeRADIUS SQL schema — bundled with the upstream package.
Tables: `radcheck`, `radreply`, `radusergroup`, `radgroupcheck`,
`radgroupreply`, `radacct`, `nas`. The platform writes to `radcheck`,
`radusergroup` (and reads `radacct` for diagnostic purposes); leaves
the rest to FreeRADIUS' own machinery.

The migration that introduces this parcel applies the upstream SQL
schema into a new `freeradius` schema so it doesn't collide with our
own table names.

### `public.radius_login_events` (platform schema)

Records every login event the platform learns about. Used for the
first-login signal, "active right now" status, and historical
reporting.

```sql
create table public.radius_login_events (
  id              uuid primary key default uuid_generate_v4(),
  occurred_at     timestamptz not null default now(),

  person_id       uuid references public.persons(id),  -- nullable: unknown user
  username        text not null,                        -- raw, in case persons match fails
  location_id     uuid references public.locations(id), -- resolved from nas_address
  auth_result     text not null check (auth_result in ('accept', 'reject')),

  ip_address      inet,
  nas_address     inet,
  nas_identifier  text,
  called_station_id  text,
  calling_station_id text,
  session_id      text
);

create index radius_login_events_person_idx on public.radius_login_events (person_id, occurred_at desc);
create index radius_login_events_location_idx on public.radius_login_events (location_id, occurred_at desc);
create index radius_login_events_session_idx on public.radius_login_events (session_id) where session_id is not null;
```

This is **append-only**, like `audit_log` — never updated, never
soft-deleted. Retention policy can hard-delete old rows after N months
(out of scope here; tie to existing `purge_*` patterns).

## FreeRADIUS configuration recipe

What goes into `freeradius` itself to make this all work:

### `mods-available/sql`

Point at Postgres, the `freeradius` schema:

```
sql {
  driver = "rlm_sql_postgresql"
  dialect = "postgresql"
  server = "<platform-db-host>"
  port   = 5432
  login  = "freeradius"
  password = "<from secrets>"
  radius_db = "<platform-db-name>"

  # Pin to the dedicated schema:
  read_clients = yes
  client_table = "freeradius.nas"
  authcheck_table = "freeradius.radcheck"
  authreply_table = "freeradius.radreply"
  groupcheck_table = "freeradius.radgroupcheck"
  groupreply_table = "freeradius.radgroupreply"
  usergroup_table  = "freeradius.radusergroup"
  acct_table1 = "freeradius.radacct"
  acct_table2 = "freeradius.radacct"
  postauth_table = "freeradius.radpostauth"
}
```

### `mods-available/rest`

For the post-auth webhook back to the platform:

```
rest {
  connect_uri = "https://poc.proximity.green"
  authorize {}                        # not used for auth
  authenticate {}                     # not used for auth
  post-auth {
    uri = "${..connect_uri}/api/radius/events/login"
    method = "post"
    body = "json"
    tls = { ca_file = ... }
    data = '{ \
      "username": "%{User-Name}", \
      "auth_result": "accept", \
      "ip_address": "%{Framed-IP-Address}", \
      "nas_address": "%{NAS-IP-Address}", \
      "nas_identifier": "%{NAS-Identifier}", \
      "called_station_id": "%{Called-Station-Id}", \
      "calling_station_id": "%{Calling-Station-Id}", \
      "session_id": "%{Acct-Session-Id}", \
      "timestamp": "%{l}" \
    }'
  }
}
```

Plus a header on the same module setting a Bearer token from a secret
file (the HMAC the platform validates).

### `sites-available/default`

Enable both modules:

```
authorize {
  ...
  sql
}

authenticate {
  Auth-Type SQL {
    sql
  }
}

post-auth {
  sql
  rest                # fires the webhook
  Post-Auth-Type REJECT {
    rest              # optional: also notify on rejects
  }
}

accounting {
  sql
  # rest             # enable Accounting-Start/Stop hooks when ready
}
```

### `clients.conf`

NAS clients (the APs). Populated either by hand initially OR by reading
from `freeradius.nas` (set `read_clients = yes` above). When set up via
the platform admin UI, the platform writes to `freeradius.nas` so
FreeRADIUS picks them up on reload.

```
client ap-cpt-04 {
  ipaddr = 192.168.42.1
  secret = <shared secret from secrets store>
  shortname = AP-CPT-04
  nastype = other
}
```

### Reload after config change

`freeradius -X` on first run for verbose logs. After config edits,
`systemctl reload freeradius` or send `SIGHUP`. The platform doesn't
need to do this — FreeRADIUS picks up DB-row changes on next auth
without a reload (since `radcheck` etc. are queried per-auth).

## Hooks into onboarding/offboarding

Reference, full flow lives in `docs/ONBOARDING.md`:

- **Onboarding** → calls `addRadiusUser(...)` → marks the WiFi step
  `started_at = now()`. Step `done_at` is stamped only when the first
  RADIUS login event arrives (Rule 3).
- **Offboarding** → calls `suspendRadiusUser(...)` → marks the WiFi
  reversal step done immediately (no need to wait for an event; the
  user is locked out as soon as FreeRADIUS picks up the group change).
- **Password change** → operator-triggered or member-self-service;
  goes through `changeRadiusUserPassword(...)`.

## Future build — what this parcel needs

### Migrations
1. Apply FreeRADIUS' upstream SQL schema into a new `freeradius`
   schema (one-time install script, not a regular migration).
2. `locations.network_config jsonb` (Rule 4).
3. `public.radius_login_events` table + indexes (above).
4. New permission seeds:
   - `radius.read` (admin can view login events / user list)
   - `radius.manage` (admin can suspend / reset password)
5. Optionally a `freeradius` Postgres role with limited grants on the
   `freeradius` schema only (no access to `public`).

### Services
1. `radius.service.ts`:
   - `addRadiusUser(...)`, `suspendRadiusUser(...)`,
     `unsuspendRadiusUser(...)`, `changeRadiusUserPassword(...)`,
     `removeRadiusUser(...)`.
   - `recordLoginEvent({ ...payload })` — called by the inbound endpoint.
     Resolves NAS → location, username → person, inserts row, fires
     first-login signal if applicable.
   - `locationForNas(nasAddress)` — utility used at event-receive.

### Endpoints
1. `POST /api/radius/events/login` — receives Post-Auth from FreeRADIUS,
   HMAC-validated. Calls `recordLoginEvent`.
2. (V1+) `POST /api/radius/events/session-start`, `…/session-stop`,
   `…/auth-reject` — same shape, additional event types.

### UI
- **Member detail page** (`/people/[id]`): RADIUS card showing
  username, status (active/suspended), last login (location + when),
  recent login history, "Reset password" / "Suspend" / "Unsuspend"
  buttons.
- **Location detail page** (`/locations/[id]`): network config editor
  for the JSON shape (NAS list, vendor, notes). "Recent logins" table
  for this location.
- **Admin RADIUS overview page** (`/radius` or under
  `/admin/radius`): platform-wide login history, active sessions,
  failed-auth alerts.

### Trigger.dev tasks
None for V1. Provisioning is internal Postgres writes (synchronous,
fast, no flake surface). Inbound events are HTTP — FreeRADIUS retries
on its side if the platform is briefly down. If we later add outbound
notifications (e.g. "alert security on suspicious auth pattern"),
those go through Trigger.dev per the runtime convention.

### Cron
- (V1+) Daily summary email to operators: "X new logins, Y failed
  auths, Z first-time members onboarded onto WiFi." Internal,
  bullet-proof — pg_cron / Node, not Trigger.dev.

## Open questions

- **Multi-RADIUS deployment** — do we run one FreeRADIUS instance
  for all locations, or one per location? Affects shared-secret
  rotation and DB connection pool sizing. Default assumption: one
  shared instance, scales fine for early stage.
- **VLAN assignment** — does the platform need to drive per-member
  VLAN tagging (e.g. members on VLAN 100, prospects on VLAN 200)? If
  so, `radreply` rows carry `Tunnel-Type` / `Tunnel-Private-Group-Id`
  attributes. Needs a per-licence-tier mapping.
- **Captive portal** — is there one? If yes, who owns the auth UI?
  RADIUS handles 802.1X transparently but a guest portal is its own
  stack.
- **Self-service password reset** — magic-link flow today, or
  member-portal "change password" form?
- **NAS auto-discovery** — when a new AP comes online, does an
  operator manually add it to `locations.network_config`, or does
  FreeRADIUS log unknown-NAS events that surface in the admin UI?
- **Session limits** — concurrent-session caps per member (one device
  vs unlimited)? Needs RADIUS' `Simultaneous-Use` attribute.
- **Accounting retention** — how long do we keep `radius_login_events`
  rows? POPI / GDPR considerations for IP + MAC retention.

## Out of scope for this parcel

- The captive portal UI (separate concern if we run one).
- Guest WiFi (vouchers, time-limited access) — different auth path.
- Wired access (802.1X via switches) — same RADIUS but different
  config; once wireless is working, wired is a config addition.
- VPN / remote access via RADIUS — same auth backend, separate
  client config.
- Per-member bandwidth shaping policies (could be driven by RADIUS
  attributes but design space is wide; defer).
