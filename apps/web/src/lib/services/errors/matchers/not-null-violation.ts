import type { Matcher } from '../types'

/**
 * Postgres `not_null_violation` (SQLSTATE 23502).
 * Detail looks like: `null value in column "name" of relation "items"
 * violates not-null constraint`. Pull the column name out so the user knows
 * exactly which field is missing — much friendlier than "unexpected problem".
 */
const PATTERN = /null value in column "([^"]+)" of relation "([^"]+)"/i

export const match: Matcher = async ({ message, pgcode }) => {
  if (pgcode !== '23502' && !PATTERN.test(message)) return null
  const m = message.match(PATTERN)
  const col = m?.[1] ?? null
  const fieldNoun = col ? humaniseColumn(col) : 'a required field'

  return {
    code: 'not_null_violation',
    title: col
      ? `${capitalise(fieldNoun)} is required.`
      : `A required field is missing.`,
    detail: 'Fill it in and try saving again.',
    raw: message
  }
}

function humaniseColumn(col: string): string {
  // first_name → first name; legal_entity_id → legal entity
  return col
    .replace(/_id$/i, '')
    .replace(/_/g, ' ')
    .toLowerCase()
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
