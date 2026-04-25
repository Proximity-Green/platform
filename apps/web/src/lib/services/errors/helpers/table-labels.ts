import { supabase } from '$lib/services/permissions.service'

/**
 * DB-driven friendly noun lookup. Tier-1 tables carry a `COMMENT ON TABLE`
 * with their singular friendly form (see migration 049_table_friendly_labels.sql).
 * We bulk-load all comments once and cache for the process lifetime.
 *
 * Adding a new table to the system requires zero TypeScript change — just
 * add a `COMMENT ON TABLE <name> IS '<friendly_noun>'` in the migration that
 * creates the table.
 *
 * If a table doesn't have a comment (or we can't read pg_description), we
 * fall back to a fuzzy de-pluralised version of the table name. So nothing
 * breaks if the comment is missing, the message is just less polished.
 */

const TTL_MS = 5 * 60_000
let cache: { at: number; map: Record<string, string> } | null = null

async function load(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map
  const { data } = await supabase.rpc('public_table_labels')
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{ table_name: string; label: string | null }>) {
    if (row.label) map[row.table_name] = row.label
  }
  cache = { at: Date.now(), map }
  return map
}

export async function getFriendlyNoun(table: string): Promise<string> {
  try {
    const map = await load()
    if (map[table]) return map[table]
  } catch {
    // ignore — fall through to fuzzy fallback
  }
  return fuzzySingular(table)
}

/** Synchronous fallback for spots that can't await. Same as the async
 *  version's last-resort branch. Use the async one when possible. */
export function getFriendlyNounSync(table: string): string {
  if (cache?.map?.[table]) return cache.map[table]
  return fuzzySingular(table)
}

/** Best-effort de-pluralisation when no comment exists. */
function fuzzySingular(s: string): string {
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y'
  if (s.endsWith('ches') || s.endsWith('shes') || s.endsWith('xes')) return s.slice(0, -2)
  if (s.endsWith('s')) return s.slice(0, -1)
  return s
}

/** Force a refresh on next call (e.g. after a migration adds new comments). */
export function invalidateTableLabels() {
  cache = null
}
