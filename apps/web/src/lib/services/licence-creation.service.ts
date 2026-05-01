/**
 * Licence creation — V1 service.
 *
 * Owns the rules from docs/SUBSCRIPTION_LIFECYCLE.md (1–7 enforced here;
 * 8–10 delegated to the add_licence_with_sub RPC). Single entry point for
 * every place in the codebase that creates a licence — see the doc for
 * the call sites that route through it.
 *
 * Returns ActionableError on rule violations so the UI's existing
 * <ErrorBanner> renders a clean message + suggested actions; never throws
 * for expected validation failures.
 */
import { supabase, sbForUser } from '$lib/services/permissions.service'
import type { ActionableError } from '$lib/services/errors/types'

export type CreateLicenceInput = {
  organisation_id: string
  item_id: string
  /** Optional — auto-fills from `item.location_id` when omitted (Rule 5). */
  location_id?: string | null
  /** Required per Rule 1 — a licence needs a Member. */
  user_id: string
  started_at: string                       // ISO date or timestamptz
  ended_at?: string | null
  /** Optional — reporting only (Rule 1). */
  space_id?: string | null
  notes?: string | null
}

export type CreateLicenceResult =
  | { ok: true; licence_id: string; subscription_line_id: string; base_rate: number; currency: string }
  | { ok: false; error: ActionableError }

const RULE_VIOLATION = 'licence_creation_rule_violation'

function fail(title: string, detail: string, code = RULE_VIOLATION): CreateLicenceResult {
  return { ok: false, error: { code, title, detail } }
}

/**
 * Create a licence + paired subscription_line atomically. Routes through
 * the existing add_licence_with_sub RPC after rule checks pass.
 */
export async function createLicence(
  input: CreateLicenceInput,
  actorId: string | null
): Promise<CreateLicenceResult> {
  // ─── Rule 1: required inputs ───────────────────────────────────────
  if (!input.organisation_id) return fail('Organisation required', 'A licence must belong to an organisation.')
  if (!input.user_id) return fail('Member required', 'Pick a member who will hold this licence.')
  if (!input.item_id) return fail('Membership required', 'Pick a membership / item for this licence.')
  if (!input.started_at) return fail('Start date required', 'Pick a start date for this licence.')

  // ─── Rules 2 + 3: item must require licence, active, not deleted ──
  const { data: item, error: itemErr } = await supabase
    .from('items')
    .select('id, location_id, active, base_rate, item_types(slug, name, requires_license)')
    .eq('id', input.item_id)
    .is('deleted_at', null)
    .is('item_types.deleted_at', null)
    .maybeSingle()

  if (itemErr) return fail('Could not validate item', itemErr.message, 'lookup_failed')
  if (!item) return fail('Item not found', 'The selected item does not exist or has been deleted.', 'item_not_found')
  if (!item.active) return fail('Item inactive', 'This item is not active and cannot be assigned.', 'item_inactive')

  const itemType = (item as any).item_types
  if (!itemType?.requires_license) {
    return fail(
      'Wrong item type',
      `"${itemType?.name ?? itemType?.slug ?? 'This item'}" doesn't require a licence — use a regular subscription line for it instead.`,
      'item_type_mismatch'
    )
  }

  // ─── Rule 4: member belongs to org ─────────────────────────────────
  const { data: person, error: personErr } = await supabase
    .from('persons')
    .select('id, organisation_id, first_name, last_name')
    .eq('id', input.user_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (personErr) return fail('Could not validate member', personErr.message, 'lookup_failed')
  if (!person) return fail('Member not found', 'The selected member does not exist or has been deleted.', 'member_not_found')
  if (person.organisation_id !== input.organisation_id) {
    return fail(
      'Member is not in this organisation',
      `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim()
        ? `${person.first_name} ${person.last_name} belongs to a different organisation. Move the member first, or pick a member who already belongs here.`
        : 'The selected member belongs to a different organisation.',
      'member_wrong_org'
    )
  }

  // ─── Rule 5: location consistency ─────────────────────────────────
  // Auto-fill from the item if caller didn't pass one. If the caller
  // passed one and it disagrees with the item's location, reject — keeps
  // the row internally consistent.
  const location_id = input.location_id || item.location_id
  if (!location_id) return fail('Location required', 'Pick a location for this licence.')
  if (input.location_id && item.location_id && input.location_id !== item.location_id) {
    return fail(
      'Location mismatch',
      'This item is registered at a different location than the one you selected. Either pick the correct item, or update the item to this location first.',
      'location_mismatch'
    )
  }

  // ─── Rule 6: date sanity ──────────────────────────────────────────
  if (input.ended_at && input.ended_at < input.started_at) {
    return fail(
      'End before start',
      'The end date must be on or after the start date.',
      'date_range_invalid'
    )
  }

  // ─── Rule 7: no overlap with another active licence ───────────────
  // Pull any non-deleted licences for this (user, item, org) and check
  // overlap in JS — small set, cleaner than complex SQL with OR-NULL.
  const { data: existing, error: overlapErr } = await supabase
    .from('licenses')
    .select('id, started_at, ended_at')
    .eq('user_id', input.user_id)
    .eq('item_id', input.item_id)
    .eq('organisation_id', input.organisation_id)
    .is('deleted_at', null)

  if (overlapErr) return fail('Could not check for overlap', overlapErr.message, 'lookup_failed')

  const newStart = input.started_at
  const newEnd = input.ended_at ?? null
  const overlap = (existing ?? []).find((l: any) => rangesOverlap(l.started_at, l.ended_at, newStart, newEnd))
  if (overlap) {
    return fail(
      'Overlapping licence',
      `${person.first_name ?? 'This member'} already has a licence for this item ${overlap.ended_at ? `between ${fmt(overlap.started_at)} and ${fmt(overlap.ended_at)}` : `from ${fmt(overlap.started_at)} with no end date set`}. End the existing one first, or pick a future start date once it ends.`,
      'overlap'
    )
  }

  // ─── Rules 8–10: atomic insert via RPC ────────────────────────────
  // Currency comes from location.currency, rate from item.base_rate;
  // the RPC handles both lookups and the snapshot.
  const { data: result, error: rpcErr } = await sbForUser(actorId).rpc('add_licence_with_sub', {
    p_org_id: input.organisation_id,
    p_item_id: input.item_id,
    p_location_id: location_id,
    p_user_id: input.user_id,
    p_started_at: input.started_at,
    p_ended_at: input.ended_at ?? null,
    p_notes: input.notes ?? null,
    p_performed_by: actorId
  })

  if (rpcErr) {
    return fail('Could not create licence', rpcErr.message, 'rpc_failed')
  }

  const r = result as { licence_id: string; subscription_line_id: string; base_rate: number; currency: string }
  return {
    ok: true,
    licence_id: r.licence_id,
    subscription_line_id: r.subscription_line_id,
    base_rate: r.base_rate,
    currency: r.currency
  }
}

// ─── helpers ────────────────────────────────────────────────────────

function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null
): boolean {
  // Two ranges overlap if a.start <= b.end AND b.start <= a.end. With null
  // ends meaning open-ended, fall back to "+infinity" via a high date.
  const aE = aEnd ?? '9999-12-31'
  const bE = bEnd ?? '9999-12-31'
  return aStart <= bE && bStart <= aE
}

function fmt(ts: string): string {
  return ts.slice(0, 10)
}
