# Test procedure — Session 6

**Scope:** the changes shipped in [Session 6](../CHANGELOG.md#session-6--2026-04-23) — audit attribution, DataTable Live, RecordLive, system-log diagnostics, Trigger.dev routing fix, nav/docs polish.

**Environment:** everything runs on `localhost:5173` pointing at the production Supabase (`db.poc.proximity.green`). No deploy step is part of this procedure.

**Duration:** ~15 minutes end-to-end with one tester. Steps 6.1 and 6.3 (the two-user scenarios) need a second browser/incognito with a different logged-in user — skip them if only one test user is available and use the "single-user fallback" note at the end of each.

---

## 0. Pre-conditions

| #   | Check                                                                | Expected                                                                                 |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0.1 | Migration `035_system_logs_realtime.sql` applied                     | Query `select tablename from pg_publication_tables where pubname = 'supabase_realtime';` returns **both** `system_logs` and `change_log`. |
| 0.2 | Migration `036_changelog_user_header_fallback.sql` applied           | The `change_log_trigger` function source contains `current_setting('request.headers', true)`. |
| 0.3 | SvelteKit dev server restarted after the Session 6 code landed      | Start: `cd /Users/mark/Documents/claude/pg/platform/apps/web && npm run dev` — confirm it's listening on `:5173`. |
| 0.4 | Trigger.dev local worker running (needed for tests 4.x only)        | In a second terminal: `cd /Users/mark/Documents/claude/pg/platform/apps/web && npx trigger.dev@latest dev` — worker says `Local worker ready [node]`. |
| 0.5 | `.env` contains `TRIGGER_SECRET_KEY=tr_dev_…` (not prod)            | `grep -E '^TRIGGER_SECRET_KEY=tr_' /Users/mark/Documents/claude/pg/platform/apps/web/.env` prefix is `tr_dev_`. |
| 0.6 | Browser dev tools open on the **Console** + **Network → WS** tabs   | Ready to monitor realtime websocket traffic and dev-server errors. |

Stop and fix any failing pre-condition before proceeding — later steps depend on all of these.

---

## 1. Audit attribution — service_role writes name the user

**Purpose:** verify every mutation attributes to the signed-in user, not "system".

### TC-1.1 Person update

1. Visit `http://localhost:5173/people` and click any row to open the detail page.
2. Change the `phone` field to a new value.
3. Click **Save Changes**. Wait for the success toast.
4. Visit `http://localhost:5173/changelog`.
5. Top row should be `UPDATE / persons / <that person's name>`.

**Pass:** the **Changed By** column shows your email (e.g. `mark@proximity.green`).
**Fail:** shows `system` — the migration 036 trigger isn't running, or the dev server didn't pick up the code change.

### TC-1.2 Organisation update

Repeat TC-1.1 with any organisation from `/organisations`. Same pass criterion.

### TC-1.3 Tracking-code add (inline mutation path)

1. Visit `http://localhost:5173/locations/<any-id>`.
2. Add a new tracking code (category / code / name).
3. Visit `/changelog`. Top row: `INSERT / tracking_codes / <your code>`.

**Pass:** **Changed By** shows your email.
**Fail:** shows `system` — the inline `supabase.from('tracking_codes').insert(...)` wasn't converted to `sbForUser(userId)`.

### TC-1.4 Item family detail upsert

1. Visit `/items/<any-membership-family-item-id>`.
2. Edit any Detail field (e.g. `max_members`), Save.
3. Check `/changelog`: `INSERT` or `UPDATE` on `membership_details`.

**Pass:** attributes to your email.

---

## 2. DataTable Live feed

**Purpose:** verify list pages stream new rows without refresh.

### TC-2.1 Changelog Live

1. Open `/changelog` — Tab A.
2. Click the **Live** pill in the table toolbar.
3. Verify: pill turns green, dot pulses, toolbar tooltip says "Streaming new rows".
4. In Tab B, open `/people`, edit any person, save.
5. Within ~1 second, Tab A should prepend a new row.

**Pass:** row appears at the top of Tab A's table automatically. Pill stays green throughout.
**Fail** scenarios:
- Pill goes green but no row arrives → check Network → WS tab in Tab A for a `ws://…/realtime/v1/websocket` connection staying open.
- Pill goes red / shows "Realtime: closed" → websocket dropped; often an auth issue.

### TC-2.2 Changelog sort tiebreaker

1. With Live ON, click the **Category** column header to sort by category.
2. Trigger 2-3 more edits from Tab B.
3. New rows should land **at the top of their category group**, not arbitrarily interleaved.

**Pass:** within a category group (e.g. all `UPDATE` rows), your latest edit is at the top.

### TC-2.3 System-logs Live

Same as TC-2.1 on `/system-logs`. Trigger activity by doing an invite (see section 4) or any edit. Expect `auth` / `email` rows streaming in.

### TC-2.4 Live toggle is session-scoped

1. With Live ON, navigate to another page (`/people`) and back to `/system-logs`.
2. Pill should be **OFF** — this is intentional (state doesn't persist across navigations).

---

## 3. Record-level Live toast (RecordLive)

**Purpose:** verify detail pages notice foreign edits.

### TC-3.1 Person detail — foreign edit

*Requires two logged-in users.*

1. Tab A: log in as User 1, open `/people/<person-id>`.
2. Tab B (incognito or second browser): log in as User 2, open the same URL.
3. In Tab B, edit the phone, Save.
4. Tab A should display a floating pill top-right: *"This member was just updated by <User 2's name> — [Refresh] [×]"*.
5. Click **Refresh** in Tab A.

**Pass:** pill appears within ~2 seconds, shows User 2's name (or UUID-8 prefix if RLS blocks person lookup), Refresh reloads the form with the new phone value.

**Single-user fallback:** In step 3 edit as the *same* user as Tab A. The pill should **not** appear — your own edits are filtered out by `viewerId === changed_by`. That is still a valid pass for the filter logic.

### TC-3.2 Organisation detail

Same pattern on `/organisations/<id>`. Pill label should read "organisation" not "member".

### TC-3.3 Pill dismiss

1. Trigger TC-3.1 again.
2. Click the **×** button instead of Refresh.

**Pass:** pill disappears. Data in the form is *not* reloaded.

---

## 4. Invite flow — diagnostic logs

**Purpose:** verify invite logs are actionable whether it succeeds or fails.

Requires step 0.4 (Trigger.dev worker running).

### TC-4.1 Happy path

1. Visit `/people`. Click **Invite as user** on any person with an `@gmail.com` (or other real-domain) email.
2. Wait for the success toast.
3. Visit `/system-logs` with **Live ON**.

**Pass:** three rows appear within ~2 seconds, in this order:

- `auth / info — Invite flow started for <email>`
- `email / success — Invitation sent to <email> from People page`
- `auth / info — Person invited as user: <email> (role: member)`

Expand the `email` row (click `>`). Details payload contains **all** of:
- `trigger_key_kind: dev`
- `invite_url`: `https://db.poc.proximity.green/auth/v1/verify?...`
- `duration_ms`: <a positive integer>
- `trigger_run_id`: `run_<…>`
- `trigger_url`: `https://jobs.poc.proximity.green/…/runs/<id>`

### TC-4.2 Trigger.dev worker sees the job

After TC-4.1, switch to the Trigger.dev terminal.

**Pass:** worker log shows the `send-welcome-email` task firing for the invited email.
**Fail:** terminal stays quiet → `trigger_key_kind` is wrong in step 0.5, or the worker isn't connected to the same project.

### TC-4.3 Unreachable email (Mailgun rejection)

1. Invite a person with an `@example.com` address.
2. Watch `/system-logs` with Live ON.

**Pass:** You'll see the three rows from TC-4.1, followed a few seconds later by `email / error — Welcome email failed: <email>`. This is **correct behaviour** — `example.com` is a reserved test domain, Mailgun rejects it. The fact that the failure shows up in the log with full detail is the point.

---

## 5. Error normalisation

**Purpose:** verify `logFail` produces readable error messages instead of `[object Object]`.

### TC-5.1 Trigger a PostgrestError

1. Visit `/organisations/<id>` for an organisation that has related rows (licences, subs, wallets — anything that's FK-dependent on the org).
2. Click **Delete**. Confirm.
3. Expect a failure toast (FK constraint).
4. Visit `/system-logs` → top `system / error` row.

**Pass:** message reads something like `organisations.delete failed: update or delete on table "organisations" violates foreign key constraint …`. Expand: `error_code` (e.g. `23503`), `error_hint`, `error_details` are populated.
**Fail:** message reads `organisations.delete failed: [object Object]` — the `stringifyError` helper isn't in the path.

---

## 6. Navigation + dashboard + docs

**Purpose:** verify the UI polish landed.

### TC-6.1 Docs in W17 top nav

1. Ensure theme is **W17** (avatar → Theme → W17).
2. Top bar should show: `WORKSHOP17 | Admin | Organisations | Members | <globe>` on the left, and on the right — **Docs button → Search → Avatar**.

**Pass:** Docs button is right-aligned next to the search, not hidden in the globe dropdown.

### TC-6.2 Admin dashboard docs cards

1. Visit `/admin`. Scroll past the "Ask the platform" chat.
2. Find the **Docs** section with grouped cards.

**Pass:** two groups — **Reference** (Architecture, Conventions, Catalog & Tracking, Migration, Benchmark, Platform School) and **Integrations** (Sage). Each card is a clickable link.

### TC-6.3 Docs sidebar grouping

1. Visit `/docs`.
2. Scan the left sidebar.

**Pass:** sidebar shows `Architecture`, `Conventions`, `Catalog & Tracking`, `Migration`, `Benchmark`, `Platform School`, then a heading **Integrations**, then `Sage`. "Sage Meeting" is **not** a label anywhere (was renamed).

### TC-6.4 Sage doc renders

Click **Sage** in the sidebar. The Sage meeting prep doc loads with the legal-entity map, concepts primer, and 10 question sections.

### TC-6.5 This doc renders

Click **Testing** in the sidebar (added this session).

**Pass:** this very document renders.

---

## 7. Silent-failure monitoring

Keep the `npm run dev` terminal visible for the whole test run. Any of these lines is a failure signal worth capturing:

| Line | Meaning |
| ---- | ------- |
| `[system-log] insert failed for [<cat>/<level>] "..." { code, details, hint, message }` | A `log()` call's INSERT was rejected (RLS, schema, or creds). Before Session 6 these were silent. |
| `[env] SUPABASE_SERVICE_ROLE_KEY contained N whitespace chars — stripped` | Coolify paste corruption; key works but investigate. |
| Any unhandled stack trace | Capture and share. |

---

## Post-test sign-off

| Section               | Pass? |
| --------------------- | :---: |
| 0. Pre-conditions     |       |
| 1. Audit attribution  |       |
| 2. DataTable Live     |       |
| 3. RecordLive         |       |
| 4. Invite flow        |       |
| 5. Error normalisation|       |
| 6. Nav + dashboard    |       |
| 7. No silent failures |       |

If every row is green, Session 6 is ready to commit + deploy.
