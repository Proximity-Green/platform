import type { Matcher } from '../types'

/**
 * Postgres `invalid_text_representation` (SQLSTATE 22P02) — Postgres
 * couldn't cast a string to the target type. Most common form is a bad
 * UUID (`invalid input syntax for type uuid: "..."`), usually from a
 * dropdown returning an empty string the form layer didn't blank out.
 */
const PATTERN = /invalid input syntax for type (\w+)(?::\s*"([^"]*)")?/i

export const match: Matcher = async ({ message, pgcode }) => {
  if (pgcode !== '22P02' && !PATTERN.test(message)) return null
  const m = message.match(PATTERN)
  const type = m?.[1] ?? null
  const value = m?.[2] ?? null

  const friendly = (() => {
    if (type === 'uuid') return value === '' ? 'a required selection is empty' : 'a selection is invalid'
    if (type === 'integer' || type === 'bigint' || type === 'smallint') return 'a whole-number field has an invalid value'
    if (type === 'numeric' || type === 'double precision' || type === 'real') return 'a number field has an invalid value'
    if (type === 'date' || type === 'timestamp' || type === 'timestamptz') return 'a date field has an invalid value'
    if (type === 'boolean') return 'a yes/no field has an invalid value'
    return type ? `a ${type} field has an invalid value` : 'one of your values is in the wrong format'
  })()

  return {
    code: 'invalid_text_representation',
    title: `Couldn't save — ${friendly}.`,
    detail: type === 'uuid'
      ? 'Pick a valid option from the dropdown (or leave it blank if optional) and try again.'
      : 'Check the affected field, fix the value, and try saving again.',
    raw: message
  }
}
