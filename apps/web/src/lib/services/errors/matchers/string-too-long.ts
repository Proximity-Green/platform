import type { Matcher } from '../types'

/**
 * Postgres `string_data_right_truncation` (SQLSTATE 22001) —
 * `value too long for type character varying(N)`. We rarely know which
 * column it was without parsing schema, but surfacing the limit gives the
 * user a concrete fix ("trim to N characters").
 */
const PATTERN = /value too long for type [^()]*\((\d+)\)/i

export const match: Matcher = async ({ message, pgcode }) => {
  if (pgcode !== '22001' && !PATTERN.test(message)) return null
  const m = message.match(PATTERN)
  const limit = m?.[1] ?? null

  return {
    code: 'string_too_long',
    title: limit
      ? `One of your values is too long (max ${limit} characters).`
      : `One of your values is too long.`,
    detail: 'Shorten the affected field and try saving again. Common culprits: long names, slugs, or accounting codes copied from another system.',
    raw: message
  }
}
