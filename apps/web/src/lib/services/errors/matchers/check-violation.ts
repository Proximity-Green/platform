import type { Matcher } from '../types'

/**
 * Postgres `check_violation` (SQLSTATE 23514) — a CHECK constraint failed.
 * Detail looks like: `new row for relation "items" violates check
 * constraint "items_status_check"`. The constraint name usually hints at
 * the rule (e.g. `<table>_<col>_check`), so we surface that even though we
 * can't always know the exact rule.
 */
const PATTERN = /violates check constraint "([^"]+)"/i

export const match: Matcher = async ({ message, pgcode }) => {
  if (pgcode !== '23514' && !PATTERN.test(message)) return null
  const m = message.match(PATTERN)
  const constraint = m?.[1] ?? null
  const field = constraint ? guessField(constraint) : null

  return {
    code: 'check_violation',
    title: field
      ? `Value for "${field}" isn't allowed.`
      : `One of the values you entered isn't allowed.`,
    detail: 'A safety rule on the database rejected this value. Double-check the field — common reasons are status/enum mismatches, percentages out of range, or empty strings where a real value is required.',
    raw: message
  }
}

// `items_status_check` → "status";  `items_aesthetic_impact_check` → "aesthetic impact"
function guessField(constraint: string): string | null {
  const trimmed = constraint.replace(/_check$/i, '')
  const parts = trimmed.split('_')
  if (parts.length < 2) return null
  return parts.slice(1).join(' ')
}
