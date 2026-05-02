# Occupancy

Status: **scoping**, no code yet. Sixth design parcel. Consumer of
`docs/FREERADIUS_INTEGRATION.md` (and future signal sources).

Covers how the platform answers questions like:
- *Who is in CPT right now?*
- *How busy is Tabakhuis on Wednesday afternoons?*
- *Has Joe been here in the last 30 days?*
- *Which locations are over-/under-utilised?*
- *Did the new hot-desk membership tier shift people into the morning?*

## Two lenses, one model

"Occupancy" answers two distinct questions, and the platform must
report both:

1. **Inventory occupancy (the financial / sales lens).** What fraction
   of bookable stock has revenue against it? Offices: each office is
   one unit of stock; sold = has an active licence-backed sub.
   Memberships: floor-pressure load against a per-location capacity
   target, weighted by visit pattern (rooted = full pressure;
   occasional = fractional). Reporting this was a nightmare in WSM —
   memberships especially. **V0 lives at `/occupancy`.**
2. **Presence occupancy (the operational / experience lens).** Who is
   physically here right now? RADIUS auth + door access + manual
   check-ins fused into one presence stream. *This* is what the rest
   of this doc is about.

The two share inputs (locations, item types, members) but answer
different questions. A space at 100% inventory occupancy can be empty
on a Tuesday afternoon (presence low); a space at 60% inventory
occupancy can be over-stuffed on Wednesday morning (presence high).
Operators need both to manage product mix vs schedule pressure.

### Inventory occupancy — V0 schema gaps

The V0 report at `/occupancy` exposes the data-layer holes that proper
inventory reporting needs. Filling these is a precondition for V1:

- `locations.membership_capacity_target int` — per-location target
  headcount for floor-pressure (the "stock" memberships are sold
  against). Currently no field; the report shows `—`.
- `membership_details.space_pressure_factor numeric(5,2) default 1.0` —
  weights occasional memberships below rooted. Without it, a 4-day-
  per-month membership counts the same as a daily one and the
  weighted demand number is meaningless.

Both numbers are observable today by inspection (operators "know" what
fits at each location, "know" which memberships are casual). The point
of the schema is to make them computable + auditable instead of held
in someone's head.

### Inventory occupancy — AI-prompting requirement

The report must be queryable not just via the table view but via the
AI assistant ("how many open offices in CPT this month?", "which
location has the worst membership-to-capacity ratio?"). That means
the data layer needs:
- A typed service (`occupancy.service.ts`) that returns the same
  shape the page uses, so the AI surface and the UI share one source.
- Rolled-up snapshots cached short-term so AI questions don't re-run
  the full aggregation per prompt.

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

Occupancy isn't a single signal — it's a *derived* product made by
fusing several signals. The platform already has one signal in flight
(RADIUS auth via `docs/FREERADIUS_INTEGRATION.md`); door access,
manual check-ins, and room bookings will arrive over time. Each of
those should feed *one* occupancy model rather than each surface (dashboard,
member page, location page, reports) re-deriving from raw event tables.

A `occupancy.service.ts` consolidates the read paths (current
headcount, member history, time-series aggregates) and abstracts away
which underlying signal a given presence came from.

## Architecture

```
                  ┌───────────────────────┐
                  │ occupancy.service.ts  │
                  │  - current state      │
                  │  - history queries    │
                  │  - aggregate rollups  │
                  └───────────┬───────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌─────────▼──────────┐ ┌────────▼─────────┐
│ presence_events│  │ presence_events    │ │ presence_events  │
│ (radius)       │  │ (door access)      │ │ (manual)         │
└────────────────┘  └────────────────────┘ └──────────────────┘
        ▲                     ▲                     ▲
        │                     │                     │
┌───────┴────────┐  ┌─────────┴──────────┐ ┌────────┴─────────┐
│ FreeRADIUS     │  │ access control     │ │ operator UI /    │
│ Acct-Start/Stop│  │ door swipe webhook │ │ kiosk check-in   │
└────────────────┘  └────────────────────┘ └──────────────────┘
```

Decisions:

1. **Single canonical stream — `presence_events`.** All sources land
   in one table with a `source` column. The service reads only this
   table; downstream UI doesn't care about the source unless it's
   filtering.

2. **Append-only.** Like `audit_log` and `radius_login_events`. Never
   updated, never soft-deleted. Hard-purge by retention policy after
   N months.

3. **Active presence is a derived view, not stored state.** The
   "current presence" of a person is a query over the latest events,
   not a separate `currently_present` flag that risks drift. Cached
   in a materialised view if performance demands it (V1: regular view
   or just a query).

## Rules

> **Rule 1: A presence pair is one start event + one end event.**
> Each signal source emits a `start` (begin presence) and an `end`
> event. Pair them by `(person_id, source, source_session_id)`.
> RADIUS gives this naturally via `Acct-Session-Id`; door access uses
> a swipe-in / swipe-out pair; manual check-in / check-out is operator
> action.

> **Rule 2: A person is "present at a location" if they have an open
> presence event for that location.** "Open" = a start event with no
> matching end event yet (or end event timestamp > now()).

> **Rule 3: Multiple concurrent open presences for the same person
> collapse to one.** A member with two active RADIUS sessions
> (laptop + phone) at the same location is one presence. Across
> different locations, the *most recent start* wins — they can't be
> in two places at once. Older open events are auto-closed when a
> newer start at a different location arrives.

> **Rule 4: Stale opens auto-close after a configurable threshold.**
> Default: RADIUS sessions auto-close after 4 hours of no
> Acct-Interim update. Door-access without a matching swipe-out
> auto-closes at end-of-day. Configurable per source.

> **Rule 5: Presence carries both `space_id` and `location_id`.** A
> presence event records *which space* the member is in (e.g. "20 Kloof
> — Hot Desks") and *which location* it derives from. Space is the
> finest granularity; the location is denormalised on the row for
> fast aggregation. Movement between APs *within the same space*
> doesn't open a new presence — Rule 3 still collapses concurrent
> opens. Movement between *spaces* (even at the same location) opens
> a new presence so per-space occupancy is accurate.

> **Rule 5a: APs map to spaces; spaces belong to locations.** The
> `network_access_points` mapping (see `docs/RADIUS_INTEGRATION.md`)
> resolves a NAS address / identifier to a `space_id`; the platform
> then derives the `location_id` from `spaces.location_id`. If an AP
> isn't mapped to a space yet, presence is recorded with the
> `location_id` only (best-effort) and `space_id` left null —
> surfaces in the admin UI as "unmapped APs" so an operator can
> assign them.

> **Rule 6: Anonymous presences are dropped.** If RADIUS auth comes
> from a username we can't resolve to a `persons` row, the raw event
> goes into `radius_login_events` (audit) but no `presence_events`
> row is written. Occupancy is about *known* people. Add a separate
> "guest WiFi" tally if anonymous counts ever matter.

> **Rule 7: Retention is shorter than raw signal retention.**
> `presence_events` is the analytics product; rollups (per
> hour/day/location/member) are kept long. Raw `presence_events`
> rows can be purged once aggregated. Default retention: 90 days raw,
> indefinite aggregates. Tunable.

## Schema

### `presence_events` (new)

```sql
create type presence_event_kind as enum ('start', 'end');
create type presence_source as enum ('radius', 'door', 'manual', 'booking');

create table public.presence_events (
  id              uuid primary key default uuid_generate_v4(),
  occurred_at     timestamptz not null default now(),

  person_id       uuid not null references public.persons(id),
  space_id        uuid references public.spaces(id),         -- nullable: AP not mapped yet
  location_id     uuid not null references public.locations(id),

  kind            presence_event_kind not null,
  source          presence_source not null,
  -- per-source session correlation. e.g. RADIUS Acct-Session-Id, door swipe id.
  source_session_id text,

  -- optional metadata (which AP / door for diagnostics)
  source_meta     jsonb not null default '{}'::jsonb,

  notes           text
);

create index presence_events_person_idx
  on public.presence_events (person_id, occurred_at desc);

create index presence_events_location_idx
  on public.presence_events (location_id, occurred_at desc);

create index presence_events_space_idx
  on public.presence_events (space_id, occurred_at desc)
  where space_id is not null;

create index presence_events_open_idx
  on public.presence_events (person_id, source, source_session_id)
  where kind = 'start';
```

The "open presences" query becomes:

```sql
-- Find all currently-present pairs (start without matching end).
select distinct on (s.person_id) s.*
  from presence_events s
 where s.kind = 'start'
   and s.occurred_at > now() - interval '24 hours'
   and not exists (
     select 1 from presence_events e
      where e.kind = 'end'
        and e.person_id = s.person_id
        and e.source = s.source
        and e.source_session_id = s.source_session_id
        and e.occurred_at >= s.occurred_at
   )
 order by s.person_id, s.occurred_at desc;
```

(Wrap in a view `currently_present` once it's stable.)

### `presence_rollups_*` (future)

For long-term retention + fast historical queries:

```sql
create table public.presence_rollups_hourly (
  bucket_at       timestamptz not null,        -- truncated to the hour
  location_id     uuid not null references public.locations(id),
  unique_persons  int not null,
  total_minutes   int not null,                -- sum of dwell time in this hour
  primary key (bucket_at, location_id)
);
```

Populated by a daily aggregation job. `presence_events` rows older than
90 days can be purged once the rollup row exists.

## Queries the service exposes

```ts
// Real-time
listPresentNow({ location_id?, space_id? }): Promise<{ person_id, space_id, location_id, started_at }[]>
countPresentNow(): Promise<{ location_id, space_id, count }[]>

// Historical — per location
locationOccupancy(location_id, { from, to, granularity }): Promise<TimeSeriesRow[]>
locationUniqueVisitors(location_id, { from, to }): Promise<{ person_id, visits: number }[]>

// Historical — per space (finer-grained variant of location)
spaceOccupancy(space_id, { from, to, granularity }): Promise<TimeSeriesRow[]>
spaceUtilisation(space_id, { from, to }): Promise<{ peak: number, avg: number, total_minutes: number }>

// Historical — per member
memberVisits(person_id, { from, to }): Promise<VisitRow[]>
memberRegularLocations(person_id): Promise<{ location_id, visit_count }[]>
memberRegularSpaces(person_id): Promise<{ space_id, visit_count }[]>

// Aggregates
peakHours(location_id, { from, to }): Promise<{ hour: number, avg_count: number }[]>
dwellDistribution(location_id, { from, to }): Promise<{ bucket: string, count: number }[]>
```

All are pure-read; no writes. Caching is fine since the data is
inherently lagging (a member who walked in 5 seconds ago is acceptable
to miss for one tick).

## Hooks — where presence events come from

### V1: RADIUS

In `radius.service.ts:recordLoginEvent` (from
`docs/FREERADIUS_INTEGRATION.md`):

- On `Acct-Start` (or first Post-Auth where no Acct-Start exists yet):
  insert a `start` row into `presence_events`. `source = 'radius'`,
  `source_session_id = Acct-Session-Id`, `source_meta` carries
  ip_address + nas_identifier + station IDs.

- On `Acct-Stop`: insert an `end` row with the same
  `source_session_id`. The pairing is automatic by the open-presence
  query.

- On `Acct-Interim-Update` (FreeRADIUS sends these every N minutes
  for active sessions): no presence_events insert needed; just
  re-stamp the `occurred_at` of the open `start` row by writing a new
  `start` event with the same session id (effectively "still here at
  this time"). Or skip — the auto-close threshold handles staleness.

The FreeRADIUS doc currently mentions Acct-Start/Stop as "V1+ event
types"; this parcel promotes them to V1 since they're load-bearing for
occupancy. Updating the cross-ref.

### V2+: Door access, manual, bookings

Out of scope for this parcel's first build, but the schema supports
them today. Each source's adapter lives next to its integration's
service and emits `presence_events` rows in the same shape.

## UI surfaces

- **Dashboard widget** (`/admin` home): live headcount per location.
  Auto-refreshes every 30s.
- **Location detail page** (`/locations/[id]`):
  - "Now in this location" card listing currently-present members
    with avatar + last activity time.
  - Time-series chart: daily / weekly / monthly occupancy.
  - Peak-hours heatmap.
- **Member detail page** (`/people/[id]`):
  - "Visits" tab: chronological list of presence rows.
  - Last seen — when + where.
  - Total visits per location.
- **Reports** (`/reports/occupancy` or similar):
  - Per-location utilisation %.
  - Member visit-frequency segments (regulars / occasional / lapsed).
  - Membership tier vs actual visit pattern.

## Privacy / retention

Members' physical presence at a location is sensitive PII. POPI / GDPR
considerations:

- **Retention**: 90 days raw events; aggregates (rollups) longer (these
  don't identify a *visit pattern* unless a person's data dominates
  the bucket — which it won't at any meaningful headcount).
- **Member access**: members can see their own visit history via the
  member portal (when that exists).
- **Member opt-out** (open question): do we offer a "don't track my
  presence for analytics" flag on `persons`? Probably — raw RADIUS
  auth still happens (operationally needed) but `presence_events`
  rows are skipped.
- **Aggregates only for cross-org reporting**: never expose another
  org's specific members' presence data to us-the-platform's BI.

> **Rule 8: A `persons.presence_opt_out boolean` flag suppresses
> writing to `presence_events` for that person.** Raw RADIUS auth
> still happens (we can't deny WiFi to opted-out members). The flag
> exists so privacy-conscious members can opt out of the analytics
> product without losing service.

## Future build — what this parcel needs

### Migrations
1. `presence_events` table + enums + indexes (above).
2. `presence_rollups_hourly` table (V1+ if perf needs).
3. `persons.presence_opt_out boolean default false`.
4. New permission seeds:
   - `occupancy.read` — admin can view occupancy data.
   - `occupancy.read_own` — member can view their own visits.

### Services
1. `occupancy.service.ts`:
   - All the query functions in the section above.
   - `recordPresenceEvent({ person_id, location_id, kind, source, source_session_id, meta })`
     — single ingestion entry point, called by source adapters.
   - `closeStalePresences()` — called by daily cron; closes opens
     past their auto-close threshold.

### Source adapters
1. RADIUS adapter — extension to `radius.service.ts`:
   - `Acct-Start` handler → `recordPresenceEvent({ kind: 'start', source: 'radius', … })`
   - `Acct-Stop` handler → `recordPresenceEvent({ kind: 'end', source: 'radius', … })`
   - New endpoints in `apps/web/src/routes/api/radius/events/session-start/+server.ts`
     and `…/session-stop/+server.ts` (the FreeRADIUS doc mentions
     these as V1+ — they become V1 with this parcel).

### Cron
1. Hourly rollup aggregator (V1+ when raw queries get slow). Internal,
   transactional → pg_cron / Node, not Trigger.dev.
2. Daily stale-presence closer. Same.
3. Daily retention sweep — purge raw `presence_events` older than
   90 days where a rollup row exists.

### UI surfaces
- Dashboard widget (live counts).
- Location detail occupancy panel.
- Member detail visits panel.
- Reports section (admin only).
- Member portal "your visits" (V1+, ties to member portal parcel).

## Open questions

- **AP roaming** — RADIUS may emit a new Acct-Start when a member
  roams between APs at the same location. Rule 5 says we squash to
  one presence per location, but the implementation needs care: the
  new Acct-Start has a *different* session_id, so the pairing rule
  doesn't auto-collapse it. Probably need a "same person, same
  location, within 60 seconds → don't open a second presence" rule.
- **Wi-Fi sleep cycles** — phone sleeps, RADIUS session ends, phone
  wakes, new session begins. Counts as one visit or two? Probably
  collapse to one if the gap is < 30 minutes.
- **Default retention period** — 90 days feels right but POPI may
  dictate stricter; check before shipping.
- **Anonymous / guest count** — useful number for marketing
  ("X visitors today"). Worth a separate `guest_presence_events`
  stream or just rely on raw RADIUS counts?
- **Real-time push** — operators may want a live ticker. Push later
  via Supabase Realtime on `presence_events` INSERT, or websockets
  in the SvelteKit layer? Decide when the dashboard widget is built.
- **Cross-location members** — for a member with multiple home
  locations (rare but possible), how do per-location reports
  attribute their visits? Likely fine to count under whichever
  location they actually visited (presence_events.location_id is
  authoritative); the "home location" concept on persons becomes
  metadata only.

## Out of scope for this parcel

- Predictive occupancy / forecasting (separate analytics build,
  consumes the rollups).
- Real-time push notifications to dashboards (build the polled
  widget first; switch to push only if needed).
- Door-access integration (separate parcel; will emit into the same
  `presence_events` stream when built).
- Room-booking integration (same).
- Capacity-limit enforcement at AP / door level (out of scope; this
  parcel reports occupancy but doesn't gate access).
- Per-tier visit caps (e.g. "hot-desk users: 8 visits/month") —
  separate parcel that *consumes* this one's data.
