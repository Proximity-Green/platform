# RADIUS integration

Status: **scoping**, no code yet. Companion parcel to
`docs/ONBOARDING.md` and `docs/OCCUPANCY.md`.

Covers the bidirectional integration with the RADIUS server(s) that
authenticate member WiFi:

- **Outbound (platform → RADIUS)**: provision users, suspend, change
  password. Called from onboarding/offboarding and from operator UI.
- **Inbound (RADIUS → platform)**: webhook on Post-Auth (and
  Accounting-Start/Stop) carrying user, IP, NAS, station IDs, session
  id. Feeds first-login signal (onboarding) and presence events
  (occupancy).
- **AP↔space mapping**: how the platform knows which physical *space*
  (and by extension, which location) a given access point serves.
- **Multi-deployment**: W17 already runs a RADIUS server we integrate
  with. KOFISI and future deployments may need their own. The platform
  uses an **adapter pattern** so the deployment swaps in a different
  RADIUS backend without touching the rest of the codebase.

## How to use this doc

Same convention as the other parcel docs:

- **Pre-build (now)** — the design contract.
- **Post-build** — living reference.

**When to update:** rule changes during a design conversation; code drifts
from a rule during build; new requirement surfaces post-ship (append, don't
rewrite — old rules marked `~~superseded YYYY-MM~~`, not deleted).

**Rule numbering is stable.**

**Audit trail = git history.**

**Audience:** solo dev + AI pair, *not* admins/operators.

## Why a service?

Two reasons the platform needs an abstraction layer over RADIUS:

1. **W17 already runs a RADIUS server.** We don't build or manage it —
   the platform consumes its provisioning interface and receives its
   accounting webhooks. Hard-coding the W17 specifics across the
   codebase would entangle every onboarding/offboarding/auth path with
   one deployment's idiosyncrasies.

2. **Future deployments may run their own RADIUS.** KOFISI is the
   obvious case: a separate physical estate, separate auth domain,
   maybe a separate vendor. The platform code shouldn't care which
   one's behind the curtain.

A `radius.service.ts` consolidates the platform-side calls behind one
entry point. Underneath, an **adapter** implements the actual mechanics
for the current deployment.

## Architecture — adapter pattern

```
┌─────────────────────────────────────────────────────────┐
│ apps/web                                                │
│                                                         │
│  ┌────────────────────────┐   ┌─────────────────────┐   │
│  │ onboarding orchestrator│   │ operator UI         │   │
│  └─────────┬──────────────┘   └─────────┬───────────┘   │
│            │                            │               │
│            └─────────────┬──────────────┘               │
│                          │                              │
│              ┌───────────▼───────────┐                  │
│              │ radius.service.ts     │                  │
│              │ (deployment-agnostic) │                  │
│              └───────────┬───────────┘                  │
│                          │                              │
│              ┌───────────▼───────────┐                  │
│              │ RadiusAdapter         │                  │
│              │ (interface)           │                  │
│              └─┬─────────────────┬───┘                  │
│                │                 │                      │
│      ┌─────────▼────┐   ┌────────▼─────────┐            │
│      │ W17Adapter   │   │ LocalFreeRadius  │            │
│      │ (V1)         │   │ Adapter (future) │            │
│      └──────┬───────┘   └────────┬─────────┘            │
└─────────────┼────────────────────┼──────────────────────┘
              │                    │
              ▼                    ▼
       W17 RADIUS server    KOFISI's own RADIUS
       (existing)           (if/when built)
```

The deployment chooses its adapter at boot via `RADIUS_ADAPTER` env
var (`'w17'`, `'local-freeradius'`, …). The rest of the codebase calls
`radius.service.ts` and never knows.

```ts
export interface RadiusAdapter {
  addUser(input: AddUserInput): Promise<RadiusUserRef>
  suspendUser(username: string): Promise<void>
  unsuspendUser(username: string): Promise<void>
  changePassword(username: string, newPassword: string): Promise<void>
  removeUser(username: string): Promise<void>
}
```

Inbound webhooks are deployment-specific in their *delivery* (each
RADIUS server is configured to call `/api/radius/events/...`) but the
**payload shape is normalised** at the endpoint — the adapter's
inbound side parses whatever its RADIUS sends and emits a canonical
`RadiusLoginEvent` to the rest of the platform. Same shape regardless
of deployment.

## V1: the W17 adapter

W17 already runs a FreeRADIUS server. The adapter talks to whatever
interface that server exposes. Concrete details TBD pending a W17 ops
sit-down — the integration could be:

- **Direct DB writes** to the W17 RADIUS Postgres if we get tunnel
  access + grants on its `radcheck` / `radusergroup` / `radacct`
  tables.
- **A REST API** in front of the W17 RADIUS (if W17 ops have built
  one, or are willing to).
- **A management script** invoked over SSH (least preferred —
  fragile, hard to retry).

The adapter abstracts the choice. Whatever it ends up being, it
implements the interface above.

> **Rule 1: The W17 adapter is owned by W17 ops jointly with the
> platform team.** The interface is platform-defined; the
> implementation is whatever W17's RADIUS allows. Document the W17
> ops contact + handover when the adapter is built. Don't fork
> FreeRADIUS upstream.

## V2+: KOFISI / new deployment

If a deployment needs its own RADIUS (e.g. KOFISI doesn't have access
to the W17 server), build a **`LocalFreeRadiusAdapter`** that:

1. Stands up a FreeRADIUS instance pointed at our Postgres (separate
   `freeradius` schema in the platform DB so it doesn't collide).
2. Writes to that schema directly via Postgres for provisioning
   (internal, no flake surface — bullet-proof).
3. Configures FreeRADIUS' `mods-available/rest` to call back to the
   platform's `/api/radius/events/login` endpoint on Post-Auth.

The recipe for the FreeRADIUS-side config (mods, sites, clients) lives
in this doc, but only kicks in if the deployment chooses
`LocalFreeRadiusAdapter`. W17 doesn't run our config because W17's
RADIUS pre-existed.

(See appendix at the bottom for the local-FreeRADIUS config recipe —
kept here so it's not lost when KOFISI or any other deployment needs it.)

## Provisioning rules

> **Rule 2: RADIUS username = `persons.email`.** Stable, unique, what
> members already know. Lowercased on insert + on auth comparison.

> **Rule 3: Passwords are bcrypt.** Platform never stores cleartext.
> Initial password generated at provisioning; one-time link emailed
> for the member to set their own. Same flow for rotation.

> **Rule 4: Suspension is reversible; removal is hard.** Suspending
> moves the user to a denied group; the row stays for audit. Removal
> only happens during full offboarding completion (some retention
> period after the licence ends — operator-tunable).

> **Rule 5: Every provisioning call is audited.** Per-call rows in
> `change_log` (`entity_type = 'radius_user'`) so we can answer "who
> reset Joe's password and when?" months later. Cross-deployment —
> the audit lives on our side regardless of which RADIUS server is
> behind the adapter.

## Inbound — events from RADIUS

### Endpoint

`POST /api/radius/events/login` — called by RADIUS Post-Auth. HMAC
header for auth, shared secret per deployment.

Canonical payload (the adapter parses RADIUS-server-specific shapes
into this):

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

### Other event types (V1+)

- `POST /api/radius/events/session-start` — Acct-Start. Feeds
  occupancy presence_events (Rule from `OCCUPANCY.md`).
- `POST /api/radius/events/session-stop` — Acct-Stop. Feeds occupancy
  + session bytes-used reporting.
- `POST /api/radius/events/auth-reject` — failed auth. Surfaces in
  security alerts ("47 rejects in 5 minutes for one user").

### What the platform does on each event

1. Resolve `nas_address` (or `nas_identifier`) to `space_id` and
   `location_id` via the AP map (Rule 6 below).
2. Resolve `username` to `persons.id` via email match.
3. Insert a row into `radius_login_events` (audit/diagnostic).
4. Side effects:
   - **Login event + first-ever auth** → fire onboarding's WiFi-step
     done signal (per `ONBOARDING.md`).
   - **Acct-Start** → write `presence_events` `start` row (per
     `OCCUPANCY.md`).
   - **Acct-Stop** → write `presence_events` `end` row.

## AP ↔ space mapping

> **Rule 6: APs map to spaces; the platform derives location from
> `spaces.location_id`.** Auth data drives space-level occupancy
> (per `OCCUPANCY.md` Rule 5), so the AP-to-space relationship is
> first-class. Spaces belong to locations; the AP→space resolution
> implicitly answers AP→location.

### Where the mapping lives — pick now

Two options; the choice depends on how much metadata we want per AP.

**Option A: JSON on `spaces`** (lightweight)

```sql
alter table public.spaces
  add column network_config jsonb not null default '{}'::jsonb;
```

```ts
type SpaceNetworkConfig = {
  nas_addresses?: string[]
  nas_identifiers?: string[]
  vendor?: string
  notes?: string
}
```

Same precedent as `organisations.default_sub_rules`. Cheap to evolve.

**Option B: Dedicated `network_access_points` table** (recommended)

Given that occupancy is now a first-class consumer (not just
diagnostic), each AP has commercial weight — uptime, last-seen,
firmware, owner — and we'll query "which AP for this NAS address?"
on every auth packet. A real table earns its keep.

```sql
create table public.network_access_points (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  space_id        uuid not null references public.spaces(id),
  -- denormalised for fast lookup; trigger keeps in sync with spaces.location_id
  location_id     uuid not null references public.locations(id),

  nas_address     inet,
  nas_identifier  text,
  label           text,                       -- "AP-CPT-04 (lounge)"
  vendor          text,                       -- 'unifi' | 'mikrotik' | 'aruba'
  hardware_id     text,                       -- vendor-specific

  active          boolean not null default true,
  last_seen_at    timestamptz,                -- updated on each auth packet
  notes           text,

  -- one of nas_address or nas_identifier must be set
  check (nas_address is not null or nas_identifier is not null)
);

create unique index naps_nas_address_key
  on public.network_access_points (nas_address)
  where nas_address is not null and active is true;

create unique index naps_nas_identifier_key
  on public.network_access_points (nas_identifier)
  where nas_identifier is not null and active is true;

create index naps_space_idx on public.network_access_points (space_id);
create index naps_location_idx on public.network_access_points (location_id);
```

> **Rule 7: APs live in `network_access_points`, FK to `spaces`.**
> Each row identifies an AP by `nas_address` and/or `nas_identifier`;
> partial unique indexes guarantee one active row per identifier. The
> `location_id` is denormalised onto the row for fast joins (kept in
> sync via trigger or app-layer write).

### Lookup at event-receive time

```sql
select space_id, location_id
  from public.network_access_points
 where (nas_address = $1 or nas_identifier = $2)
   and active = true
 limit 1;
```

If no row matches, the auth event is recorded with `space_id = null`
and the location resolved from the operator's best-guess (or null).
Surfaces in the admin UI as "unmapped APs" so an operator can assign
them.

## Schema additions

### `public.network_access_points`

See Rule 7 above. New table.

### `public.radius_login_events`

Audit/diagnostic record per login event. Append-only.

```sql
create table public.radius_login_events (
  id              uuid primary key default uuid_generate_v4(),
  occurred_at     timestamptz not null default now(),

  person_id       uuid references public.persons(id),
  username        text not null,
  space_id        uuid references public.spaces(id),
  location_id     uuid references public.locations(id),
  ap_id           uuid references public.network_access_points(id),

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

## Hooks into onboarding/offboarding

(Reference; full flow in `docs/ONBOARDING.md`.)

- **Onboarding** → `addUser(...)` via the adapter → onboarding row's
  WiFi step `started_at = now()`. The step's `done_at` is stamped
  only when the first RADIUS login event arrives.
- **Offboarding** → `suspendUser(...)` → WiFi reversal step done as
  soon as the suspension is confirmed by the adapter (the user is
  locked out on the next auth attempt).
- **Password change** → `changePassword(...)`. Operator-triggered or
  member-self-service.

## Future build — what this parcel needs

### Migrations
1. `network_access_points` table + indexes (Rule 7).
2. `radius_login_events` table + indexes.
3. Trigger or app-layer rule to keep `network_access_points.location_id`
   in sync with `spaces.location_id`.
4. New permission seeds:
   - `radius.read` (admin can view login events / user list)
   - `radius.manage` (admin can suspend / reset password)

### Services
1. `lib/services/radius/index.ts` — the platform-facing service
   (deployment-agnostic).
2. `lib/services/radius/adapter.ts` — the `RadiusAdapter` interface +
   the loader that picks the right implementation from
   `RADIUS_ADAPTER` env var.
3. `lib/services/radius/w17-adapter.ts` — V1 adapter for the W17
   RADIUS. Implementation TBD pending W17 ops audit.
4. `lib/services/radius/local-freeradius-adapter.ts` — V2+ adapter
   for deployments running our own FreeRADIUS (KOFISI candidate).

### Endpoints
1. `POST /api/radius/events/login` — Post-Auth webhook, HMAC-validated.
2. `POST /api/radius/events/session-start` — Acct-Start.
3. `POST /api/radius/events/session-stop` — Acct-Stop.
4. (V1+) `POST /api/radius/events/auth-reject`.

### UI
- **Member detail page**: RADIUS card (username, status, last login,
  recent login history, manage buttons).
- **Space detail page** (new — likely doesn't exist yet under
  `/spaces/[id]`): network config — list of APs serving this space,
  add/edit/remove. Recent logins for this space.
- **Location detail page**: aggregated AP list + recent-logins
  summary.
- **Admin RADIUS overview**: platform-wide login history, active
  sessions, failed-auth alerts, unmapped-AP queue.

### Cron
- (V1+) Daily summary email to operators.
- (V1+) Periodic AP last-seen sweep (mark inactive if no auth in
  N days).

## Open questions

- **W17 RADIUS interface** — needs an audit before the adapter can be
  built. What does W17's RADIUS expose? Direct DB? REST? Script?
- **W17 ops contact** — single point of contact for the integration
  hand-over.
- **VLAN assignment** — does the platform need to drive per-tier VLAN
  tags? If yes, `radreply` / equivalent attributes per user.
- **Captive portal** — exists at W17? Owns the auth UI? Affects how
  flow looks for guest users.
- **Self-service password reset** — magic-link via email today, or
  member-portal form?
- **NAS auto-discovery** — when a new AP comes online, does it
  surface in the unmapped-AP queue automatically (because the auth
  packet arrives with an unrecognised NAS), or does an operator
  pre-register it?
- **Concurrent-session limits** — needed? RADIUS supports it via
  `Simultaneous-Use`; needs adapter feature flag.
- **Retention** — how long do we keep `radius_login_events`? POPI /
  GDPR considerations for IP + MAC retention.

## Out of scope for this parcel

- Captive portal UI (separate concern if W17 has one or we build one).
- Guest WiFi vouchers / time-limited access (different auth path).
- Wired access (802.1X via switches) — same RADIUS, separate config.
- VPN / remote access via RADIUS — same auth, separate client.
- Per-member bandwidth shaping policies (defer).

---

## Appendix — local FreeRADIUS config recipe (V2+)

This kicks in only when a deployment runs `LocalFreeRadiusAdapter`
(KOFISI candidate). W17 doesn't use it.

### `mods-available/sql`

```
sql {
  driver = "rlm_sql_postgresql"
  dialect = "postgresql"
  server = "<platform-db-host>"
  port   = 5432
  login  = "freeradius"
  password = "<from secrets>"
  radius_db = "<platform-db-name>"

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

```
rest {
  connect_uri = "https://<this-deployment>.proximity.green"
  post-auth {
    uri = "${..connect_uri}/api/radius/events/login"
    method = "post"
    body = "json"
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

Plus an HMAC token in a request header from a secrets file.

### `sites-available/default`

```
authorize { sql }
authenticate { Auth-Type SQL { sql } }
post-auth {
  sql
  rest
}
accounting {
  sql
  # rest    # enable session-start/stop hooks here when ready
}
```

Apply FreeRADIUS' upstream SQL schema into a `freeradius` schema in
Postgres (one-time install, not an app migration).
