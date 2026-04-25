/**
 * Central error translator. One entry-point: translate(rawError) →
 * ActionableError. Every endpoint that surfaces errors to the UI should
 * route through this, so all errors get the same actionable treatment and
 * new patterns plug in via the matcher registry below.
 */

import type { ActionableError, Matcher, MatcherContext } from './types'
import { match as crossLocationTc } from './matchers/cross-location-tc'
import { match as fkViolation } from './matchers/fk-violation'
import { match as uniqueViolation } from './matchers/unique-violation'
import { match as permissionDenied } from './matchers/permission-denied'

/**
 * Order matters — the first matcher that returns a non-null result wins.
 * Put the most specific matchers first; generic fall-throughs at the end.
 *
 * To add a new pattern: write a matcher file under ./matchers/, import it
 * here, and append it to this array. No other code needs to change.
 */
const matchers: Matcher[] = [
  crossLocationTc,    // very specific trigger message
  permissionDenied,   // requirePermission / RLS
  uniqueViolation,    // Postgres unique constraint
  fkViolation         // Postgres FK (also detects soft-deleted refs)
]

export async function translate(raw: unknown): Promise<ActionableError> {
  const ctx = extractContext(raw)
  for (const m of matchers) {
    try {
      const result = await m(ctx)
      if (result) return result
    } catch {
      // Matcher itself errored (e.g. DB lookup failed). Fall through to the
      // next matcher rather than letting the error swallow a useful message.
    }
  }
  return fallback(ctx.message)
}

function extractContext(raw: unknown): MatcherContext {
  if (raw == null) return { message: 'Unknown error' }
  if (typeof raw === 'string') return { message: raw }
  if (raw instanceof Error) return { message: raw.message }
  const e = raw as any
  // Supabase / PostgrestError splits the readable bits across `message`
  // (headline), `details` (e.g. "Key (col)=(uuid) is not present in table
  // 'X'"), and `hint`. Concatenate for text matchers; expose the structured
  // fields separately for SQLSTATE-aware matchers.
  const parts = [e?.message, e?.details, e?.hint].filter(Boolean)
  const message = parts.length > 0 ? parts.join(' — ') : (e?.error ?? String(raw))
  return {
    message,
    pgcode: typeof e?.code === 'string' ? e.code : undefined,
    pgdetails: typeof e?.details === 'string' ? e.details : undefined,
    pghint: typeof e?.hint === 'string' ? e.hint : undefined
  }
}

function fallback(message: string): ActionableError {
  return {
    code: 'unclassified',
    title: 'We hit an unexpected problem saving your changes.',
    detail: 'Try again. If this keeps happening, copy the details and share them with support so we can fix it.',
    raw: message
  }
}

/**
 * Convenience: translate and return as JSON-serialisable for streaming
 * NDJSON or returning from an action.
 */
export async function translateToJson(raw: unknown): Promise<ActionableError> {
  return translate(raw)
}
