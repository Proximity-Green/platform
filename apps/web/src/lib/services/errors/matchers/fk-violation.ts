import { supabase } from '$lib/services/permissions.service'
import type { Matcher } from '../types'

/**
 * Foreign-key violation — `Key (col)=(uuid) is not present in table "X"`.
 * If the missing UUID is actually a tier-1 row that was soft-deleted, surface
 * that as a recoverable problem ("restore from /changelog") rather than a
 * mysterious "not found".
 *
 * Postgres FK only fires when the row is *physically* missing, so a vanilla
 * FK error here means either: (a) the row was hard-deleted (rare; only via
 * pg_cron purge or admin escape hatch), or (b) the id is genuinely wrong
 * (typo, stale UI). We try to detect both.
 */
const PATTERN = /Key \(([^)]+)\)=\(([^)]+)\) is not present in table "([^"]+)"/i
const HEADLINE_PATTERN = /insert or update on table "([^"]+)" violates foreign key constraint "([^"]+)"/i

const TIER1 = new Set([
  'items','item_types','tracking_codes','tags',
  'locations','spaces',
  'persons','organisations','legal_entities',
  'contracts','subscription_lines','subscription_option_groups','licenses',
  'notes','feature_requests','message_templates','approved_domains','wallets'
])

export const match: Matcher = async ({ message }) => {
  const m = message.match(PATTERN)
  if (!m) {
    // Fallback: headline-only match (no detail line). We don't know the
    // missing id but we can still say the FK constraint failed, naming the
    // child table and constraint so users know what relationship broke.
    const h = message.match(HEADLINE_PATTERN)
    if (h) {
      const [, childTable, constraint] = h
      // Try to figure out the parent table from the constraint name.
      // Convention: `<child>_<col>_fkey` where col is `<parent_singular>_id`.
      // e.g. `item_tracking_codes_tracking_code_id_fkey` → tracking_code → tracking_codes
      const parent = inferParentTable(childTable, constraint)
      const recoverable = parent && TIER1.has(parent)
      const parentNoun = parent ? friendlyNoun(parent) : 'item'
      return {
        code: recoverable ? 'fk_to_possibly_deleted' : 'fk_violation',
        title: recoverable
          ? `A ${parentNoun} you selected has been deleted.`
          : `Couldn't save — one of the linked records is missing.`,
        detail: recoverable
          ? `We couldn't save because a ${parentNoun} you've linked here no longer exists. Either restore it from the Change Log, or remove it from this record and try again.`
          : `One of the linked records is missing. If you deleted something recently, you can restore it from the Change Log.`,
        actions: [{ label: 'Open Change Log', href: '/changelog?filter=delete' }],
        raw: message
      }
    }
    return null
  }
  const [, col, missingId, table] = m

  const noun = friendlyNoun(table)

  if (!TIER1.has(table)) {
    return {
      code: 'fk_violation',
      title: `Couldn't save — a linked ${noun} is missing.`,
      detail: `The ${noun} this record was linked to no longer exists. Pick a different one and try again.`,
      raw: message
    }
  }

  // Tier-1: see if the row exists in soft-deleted form.
  const { data } = await supabase
    .from(table)
    .select('id, deleted_at')
    .eq('id', missingId)
    .maybeSingle()

  if (data?.deleted_at) {
    return {
      code: 'fk_to_soft_deleted',
      title: `The ${noun} you selected has been deleted.`,
      detail: `Restore it from the Change Log, or pick a different ${noun} and try again.`,
      actions: [
        { label: 'Open Change Log', href: '/changelog?filter=delete' }
      ],
      raw: message
    }
  }

  return {
    code: 'fk_violation',
    title: `Couldn't save — the linked ${noun} no longer exists.`,
    detail: `It's not in the Change Log either, so it can't be restored. Pick a different ${noun} and try again.`,
    raw: message
  }
}

/**
 * Parse a Postgres FK constraint name into the parent table it references.
 * Naming convention: `<child_table>_<column>_fkey` where the column is
 * `<parent_singular>_id`. Returns null if it can't be inferred.
 *
 * Example: `item_tracking_codes_tracking_code_id_fkey` →
 *   strip `_fkey`     → item_tracking_codes_tracking_code_id
 *   strip child       → tracking_code_id
 *   strip `_id`       → tracking_code
 *   pluralise         → tracking_codes
 */
function inferParentTable(childTable: string, constraint: string): string | null {
  if (!constraint.endsWith('_fkey')) return null
  let middle = constraint.slice(0, -'_fkey'.length)
  if (middle.startsWith(childTable + '_')) {
    middle = middle.slice(childTable.length + 1)
  }
  if (!middle.endsWith('_id')) return null
  const parentSingular = middle.slice(0, -'_id'.length)
  return pluralise(parentSingular)
}

function pluralise(s: string): string {
  if (s.endsWith('y') && !/[aeiou]y$/.test(s)) return s.slice(0, -1) + 'ies'
  if (s.endsWith('s') || s.endsWith('x') || s.endsWith('ch') || s.endsWith('sh')) return s + 'es'
  return s + 's'
}

function friendlyNoun(table: string): string {
  // Hand-tweak common tables to read naturally in a sentence.
  const map: Record<string, string> = {
    items: 'item',
    item_types: 'item type',
    tracking_codes: 'tracking code',
    tags: 'tag',
    locations: 'location',
    spaces: 'space',
    persons: 'person',
    organisations: 'organisation',
    legal_entities: 'legal entity',
    contracts: 'contract',
    subscription_lines: 'subscription line',
    subscription_option_groups: 'subscription option group',
    licenses: 'licence',
    notes: 'note',
    feature_requests: 'feature request',
    message_templates: 'message template',
    approved_domains: 'approved domain',
    wallets: 'wallet'
  }
  return map[table] ?? singularise(table)
}

function singularise(s: string): string {
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y'
  if (s.endsWith('ches') || s.endsWith('shes') || s.endsWith('xes')) return s.slice(0, -2)
  if (s.endsWith('s')) return s.slice(0, -1)
  return s
}
