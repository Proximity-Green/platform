import type { Matcher } from '../types'

/**
 * Postgres `undefined_column` (SQLSTATE 42703) — schema/code drift. The
 * caller (an SQL function, a trigger, an RPC, a select list) referenced a
 * column that doesn't exist on the target table. Three common shapes:
 *
 *   1. A column was renamed/dropped and a caller still references the old
 *      name. Fix: update the caller, or revert the rename.
 *   2. A generic SQL function (e.g. restore_record) hardcoded a column
 *      that isn't universal (e.g. `id` — but junction tables have composite
 *      PKs and no `id`). Fix: introspect pg_index instead of hardcoding.
 *   3. A migration that adds the column hasn't been applied yet. Fix: run
 *      pending migrations and restart.
 *
 * The detail copy targets both audiences (end-user → report it; developer
 * → here's where to look) since this app blends both in admin contexts.
 */
const PATTERN = /column "([^"]+)" does not exist/i

export const match: Matcher = async ({ message, pgcode }) => {
  if (pgcode !== '42703' && !PATTERN.test(message)) return null
  const m = message.match(PATTERN)
  const col = m?.[1] ?? null

  return {
    code: 'undefined_column',
    title: col
      ? `Couldn't save — code expected a column "${col}" that doesn't exist.`
      : `Couldn't save — code expected a column that doesn't exist.`,
    detail:
      `Schema/code drift. Usual causes (in order): an SQL function or trigger that hardcodes a column the target table doesn't have; a column that got renamed without updating callers; or a database migration that hasn't been applied yet. ` +
      `If you can run migrations: \`packages/database/migrations\` lists what's available — applying any pending ones often fixes this. Otherwise copy the details and share them so the schema/code mismatch can be reconciled.`,
    actions: [
      { label: 'Open System Logs', href: '/system-logs' }
    ],
    raw: message
  }
}
