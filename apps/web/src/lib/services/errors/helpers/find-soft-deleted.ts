import { supabase } from '$lib/services/permissions.service'
import type { ActionableError } from '../types'

const TIER1 = new Set([
  'items','item_types','tracking_codes','tags',
  'locations','spaces',
  'persons','organisations','legal_entities',
  'contracts','subscription_lines','subscription_option_groups','licenses',
  'notes','feature_requests','message_templates','approved_domains','wallets'
])

export type SoftDeletedRef = { id: string; name?: string | null; deleted_at: string }

/**
 * Proactive check: given a table + ids the caller is about to act on, return
 * the subset that are soft-deleted. Endpoints use this to short-circuit with
 * a helpful message instead of letting the operation fail (or, worse,
 * silently filter the rows out of a join).
 *
 * Returns [] if the table isn't tier-1 (no `deleted_at` column there).
 */
export async function findSoftDeleted(
  table: string,
  ids: string[]
): Promise<SoftDeletedRef[]> {
  if (!TIER1.has(table) || ids.length === 0) return []

  // Try to grab a 'name' field if the table has one — most tier-1 tables do.
  // Fall back to id-only if 'name' doesn't exist (catch the column error).
  const { data, error } = await supabase
    .from(table)
    .select('id, name, deleted_at')
    .in('id', ids)
    .not('deleted_at', 'is', null)

  if (error) {
    // 'name' column missing — retry without it.
    const fallback = await supabase
      .from(table)
      .select('id, deleted_at')
      .in('id', ids)
      .not('deleted_at', 'is', null)
    return (fallback.data ?? []).map((r: any) => ({
      id: r.id, name: null, deleted_at: r.deleted_at
    }))
  }

  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name ?? null, deleted_at: r.deleted_at
  }))
}

/**
 * Build an ActionableError describing a list of soft-deleted refs.
 * Endpoints call findSoftDeleted, and if non-empty, hand the result to this
 * to get a ready-to-emit ActionableError.
 */
export function softDeletedRefError(
  table: string,
  refs: SoftDeletedRef[]
): ActionableError {
  const labels = refs
    .slice(0, 5)
    .map(r => r.name ? `"${r.name}"` : r.id.slice(0, 8))
    .join(', ')
  const more = refs.length > 5 ? ` (+${refs.length - 5} more)` : ''
  const noun = refs.length === 1 ? singularise(table) : table

  return {
    code: 'ref_soft_deleted',
    title: refs.length === 1
      ? `${capitalise(noun)} ${labels} was deleted.`
      : `${refs.length} ${noun} you selected are deleted${more}.`,
    detail: refs.length === 1
      ? 'Restore it from the change log, or pick a different one and try again.'
      : `Affected: ${labels}${more}. Restore them from the change log, or remove them from your selection.`,
    actions: [
      { label: 'Open Change Log', href: '/changelog?filter=delete' }
    ],
    raw: `soft-deleted refs in ${table}: ${refs.map(r => r.id).join(',')}`
  }
}

function singularise(table: string): string {
  // Quick-n-dirty — falls back to the table name if not a known plural form.
  if (table.endsWith('ies')) return table.slice(0, -3) + 'y'
  if (table.endsWith('s'))   return table.slice(0, -1)
  return table
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
