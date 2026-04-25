import type { Matcher } from '../types'

/**
 * `duplicate key value violates unique constraint "<name>"` — Postgres'
 * standard message. We surface the constraint name so the user knows which
 * field clashed, plus the value when Postgres includes it (DETAIL: Key (col)=(val)).
 */
const CONSTRAINT_PATTERN = /duplicate key value violates unique constraint "([^"]+)"/
const KEY_DETAIL_PATTERN = /Key \(([^)]+)\)=\(([^)]+)\) already exists/

const FRIENDLY_NAMES: Record<string, { col: string, hint?: string }> = {
  persons_email_key: { col: 'email' },
  organisations_slug_key: { col: 'slug' },
  locations_slug_key: { col: 'slug' },
  message_templates_slug_key: { col: 'slug' },
  item_types_slug_key: { col: 'slug' },
  tags_name_key: { col: 'name' },
  tracking_codes_code_key: { col: 'code', hint: 'Codes are unique per location.' },
  tracking_codes_primary_key: { col: 'primary code', hint: 'Only one primary tracking code per location.' },
  wallets_organisation_id_currency_key: { col: 'currency', hint: 'One wallet per organisation per currency.' }
}

export const match: Matcher = async ({ message }) => {
  const cm = message.match(CONSTRAINT_PATTERN)
  if (!cm) return null
  const constraint = cm[1]
  const friendly = FRIENDLY_NAMES[constraint]
  const km = message.match(KEY_DETAIL_PATTERN)
  const value = km?.[2]

  const colLabel = friendly?.col ?? constraint
  const title = value
    ? `A record with ${colLabel} "${value}" already exists.`
    : `A record with that ${colLabel} already exists.`

  return {
    code: 'duplicate_key',
    title,
    detail: friendly?.hint ?? 'Use a different value, or open the existing record to edit it.',
    raw: message
  }
}
