/**
 * Smart-error contracts. Endpoints surface errors as ActionableError so the
 * UI can render a consistent banner with suggested next-steps the user can
 * take themselves before escalating.
 */

export type ErrorAction = {
  label: string
  /** Internal route or external URL the action should navigate to. */
  href?: string
  /** Open in a new tab when href is set. */
  external?: boolean
}

export type ActionableError = {
  /** Stable identifier — matchers set this so the UI can branch if needed. */
  code: string
  /** Headline ("what went wrong"). One sentence. */
  title: string
  /** Optional muted second line with extra context. */
  detail?: string
  /** Suggested next steps. Empty/undefined means no actions, just info. */
  actions?: ErrorAction[]
  /** Original error string for developer reference / log. */
  raw?: string
}

export type MatcherContext = {
  /** Combined message — `e.message` + `e.details` + `e.hint` joined for
   *  text-pattern matchers that don't care about the structured fields. */
  message: string
  /** Postgres SQLSTATE (5-char code, e.g. '23503' for FK violation).
   *  Matchers should prefer this over text matching when available. */
  pgcode?: string
  /** Postgres DETAIL line — often where Key (col)=(val) lives. */
  pgdetails?: string
  /** Postgres HINT line. */
  pghint?: string
}

/**
 * A matcher returns null if it doesn't recognise the error, or an
 * ActionableError if it does. Matchers may hit the DB to enrich the message
 * with names instead of UUIDs.
 */
export type Matcher = (ctx: MatcherContext) => Promise<ActionableError | null>
