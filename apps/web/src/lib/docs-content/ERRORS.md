# Smart errors — design and conventions

**Goal**: every failure that reaches a user becomes an `ActionableError` with a clear title, optional detail, and suggested next steps. Users should be able to fix common problems themselves before escalating to development.

**Read this first** when adding a new endpoint that surfaces errors, or when extending the error vocabulary with a new pattern.

---

## Where it lives

```
apps/web/src/lib/services/errors/
  index.ts                         barrel — import from here
  types.ts                         ActionableError, ErrorAction, Matcher, MatcherContext
  translator.ts                    central translate() entry point + matcher registry
  matchers/
    cross-location-tc.ts           tracking code at wrong location (Postgres trigger)
    fk-violation.ts                FK error → detects soft-deleted refs
    unique-violation.ts            duplicate-key with friendly column names
    permission-denied.ts           requirePermission / RLS denial
  helpers/
    find-soft-deleted.ts           proactive soft-delete check + ActionableError builder

apps/web/src/lib/components/ui/
  ErrorBanner.svelte               UI renderer for ActionableError
```

---

## The two flow patterns

### 1. Reactive — translate caught errors

Wrap the operation in try/catch, run the error through `translate()`, surface the `ActionableError` to the UI.

```ts
import { translate } from '$lib/services/errors'

try {
  const { error: rpcErr } = await sb.rpc('some_rpc', {...})
  if (rpcErr) throw new Error(rpcErr.message)
} catch (e) {
  const actionable = await translate(e)
  emit({ phase: 'error', error: actionable })   // NDJSON streaming endpoint
  // or:  return fail(400, { error: actionable })   // form action
}
```

### 1b. SvelteKit form actions (the common case)

Most pages use form actions and `logFail()` to surface errors. `logFail` already runs the raw error through `translate()` and returns `fail(status, { error, actionable })`. The page renders both:

```svelte
import { ErrorBanner, Toast } from '$lib/components/ui'

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || form?.actionable}
  <ErrorBanner error={form?.actionable ?? form?.error} showRaw />
{/if}
```

Use Toast for transient *success* messages, ErrorBanner for *errors* (which need to persist + be copyable for support).

### 2. Proactive — short-circuit before the operation

When you can detect a problem from the inputs (e.g. user picked a tracking code that was soft-deleted in another tab), check for it BEFORE running the operation, and return early with an `ActionableError`. Cleaner UX.

```ts
import { findSoftDeleted, softDeletedRefError } from '$lib/services/errors'

const dead = await findSoftDeleted('tracking_codes', tcIds)
if (dead.length > 0) {
  emit({ phase: 'error', error: softDeletedRefError('tracking_codes', dead) })
  return
}
```

Use proactive checks for soft-deleted refs (cheap), and reactive translation for everything else (FK errors, unique violations, permissions, trigger raises). Both paths produce the same `ActionableError` type; the UI renders identically.

---

## Rendering

In any page, modal, or form:

```svelte
import { ErrorBanner } from '$lib/components/ui'
import type { ActionableError } from '$lib/services/errors'

let error = $state<ActionableError | string | null>(null)
```

```svelte
{#if error}
  <ErrorBanner {error} showRaw />
{/if}
```

Props:
- `error` — `ActionableError | string | null` (a string is auto-wrapped as `{ title: string }`)
- `tone` — `'danger' | 'warning' | 'info'` (default `'danger'`)
- `showRaw` — show a "Show technical detail" toggle revealing the raw error
- `onDismiss` — optional dismiss handler renders an × in the corner

Built-in features:
- **Persists**: ErrorBanner stays visible until something resets the bound state. It does not auto-dismiss like Toast — that's intentional, errors should not vanish before the user can act on them.
- **Error code chip**: every banner shows the matcher's `code` (e.g. `FK_TO_SOFT_DELETED`) as a small monospace pill. Users quote this when escalating.
- **Copy details button**: bundles `code`, `title`, `detail`, `URL`, `timestamp`, and `raw` into clipboard text — paste-ready for a support ticket.
- **Show technical detail**: when `showRaw` is set, a "Show technical detail" toggle reveals the original raw error string. Devs see the SQL constraint, regular users see the friendly title.

---

## Adding a new error pattern

Three steps:

1. **Write a matcher** under `services/errors/matchers/<name>.ts`. A matcher is `(ctx: MatcherContext) => Promise<ActionableError | null>`. Return `null` if the error doesn't match.

   ```ts
   import type { Matcher } from '../types'
   const PATTERN = /your error pattern (\w+)/i
   export const match: Matcher = async ({ message }) => {
     const m = message.match(PATTERN)
     if (!m) return null
     return {
       code: 'your_code',
       title: `Headline for the user.`,
       detail: 'One muted line of context.',
       actions: [{ label: 'Open thing', href: '/somewhere' }],
       raw: message
     }
   }
   ```

2. **Register it** in `services/errors/translator.ts`:

   ```ts
   import { match as yourMatcher } from './matchers/your-matcher'
   const matchers: Matcher[] = [
     // ...existing matchers...
     yourMatcher
   ]
   ```

3. Done. Every endpoint that already calls `translate()` picks it up automatically.

---

## Best practices

### Matcher order matters
Matchers are tried top-to-bottom; first non-null wins. Put the most specific patterns first (e.g. specific trigger messages), generic catch-alls last (e.g. permission denied, FK violation).

### Matchers may hit the DB but should be fast
`cross-location-tc.ts` and `fk-violation.ts` look up names so the user sees "Tracking code KL" instead of a UUID. That's good. But:
- Don't block on slow queries inside a matcher.
- Wrap DB calls in try/catch — if the lookup fails, return `null` so the next matcher gets a shot.

### Stable error codes
The `code` field is for the UI to branch on (e.g. show a special "Restore" button only for `fk_to_soft_deleted`). Treat codes as a stable contract — don't rename casually.

### Don't leak internal details in `title` or `detail`
The user shouldn't see UUIDs, table names, SQL constraint names without translation. The `raw` field is for developers — `showRaw` reveals it on demand.

### Server logs vs user errors
`ActionableError` is for the user. Keep server-side logging of the raw error (via `logFail` or similar) — the smart sub-system doesn't replace your audit log.

### Actions should be concrete
Bad action: `"Try again"` (gives no info).
Good action: `"Open Change Log"` with `href: '/changelog?filter=delete'` (the user can follow it).

If there's no good action, omit the `actions` array entirely. An info-only message is fine.

### One error at a time
The banner shows one `ActionableError`. If multiple things went wrong (e.g. 3 tracking codes were deleted, 2 permission errors), bundle them into one `ActionableError` with a count in the title and a list in the detail. Don't render multiple banners stacked.

### Soft-deleted refs deserve their own treatment
The `softDeletedRefError(...)` helper builds a consistent message for "thing you referenced was deleted." Use it whenever you detect this case proactively — don't hand-roll variants. If the standard message doesn't fit, extend the helper, not the caller.

### Test new matchers against real error strings
Postgres error format is brittle. When adding a new matcher, paste an actual production error message into the regex tester first. Trigger messages also vary by Postgres version.

---

## Anti-patterns to avoid

**Don't sprinkle one-off error humanizers across endpoints.** The whole point of the sub-system is centralisation. If you find yourself writing per-endpoint regex, extract it to a matcher.

**Don't return raw Supabase error objects to the UI.** They have inconsistent shapes (sometimes `{ message }`, sometimes `{ details, hint, code }`). Always run them through `translate()`.

**Don't catch and re-throw with a string.** Lossy. Keep the original error all the way to `translate()` so matchers can see the full message.

**Don't use ErrorBanner for success/info messages.** It has a danger-tone default and an alert role. Use Notice or Toast for non-error UX.

**Don't add matchers that match everything.** A matcher that returns non-null for every input breaks the chain. The fallback in `translator.ts` handles unrecognised errors.

---

## Roadmap (when there's appetite)

- **Pgcode-aware matching**: extend `MatcherContext` to include Postgres `pgcode`, `details`, `hint`. Matchers can pattern on structured fields instead of just text.
- **Localisation**: `ActionableError.title` / `detail` become message keys; UI resolves them via i18n. Out of scope until you have multiple locales.
- **Inline action handlers**: today actions are just hrefs. Add an `action: 'restore-id'` variant that wires to a registered handler in the UI.
- **Telemetry**: log the matched `code` to a counter so we know which error patterns hit users most often.
