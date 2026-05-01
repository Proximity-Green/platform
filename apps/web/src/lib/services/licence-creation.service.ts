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

// ─── apply licence change (V7 upgrade/downgrade composition) ─────────

export type ApplyLicenceChangeInput = {
  old_licence_id: string
  new_item_id: string
  effective_at: string                    // ISO date or timestamptz
}

export type ApplyLicenceChangeResult =
  | { ok: true
      old_licence_id: string
      old_subscription_line_id: string | null
      new_licence_id: string
      new_subscription_line_id: string
      effective_at: string
      base_rate: number
      currency: string }
  | { ok: false; error: ActionableError }

const CHANGE_FAIL = 'licence_change_failed'
function changeFail(title: string, detail: string, code = CHANGE_FAIL): ApplyLicenceChangeResult {
  return { ok: false, error: { code, title, detail } }
}

/**
 * V7 composition: end the old licence + sub at effective_at - 1 day, open
 * a new licence + sub at effective_at with the new item's catalog rate.
 * Same person, same location, different item. Atomic via the
 * apply_licence_change RPC — 1:1 invariant maintained throughout.
 */
export async function applyLicenceChange(
  input: ApplyLicenceChangeInput,
  actorId: string | null
): Promise<ApplyLicenceChangeResult> {
  if (!input.old_licence_id) return changeFail('Missing licence', 'No licence selected to change.')
  if (!input.new_item_id) return changeFail('Missing new item', 'Pick a new membership / item to change to.')
  if (!input.effective_at) return changeFail('Missing effective date', 'Pick when the change should take effect.')

  const { data, error } = await sbForUser(actorId).rpc('apply_licence_change', {
    p_old_licence_id: input.old_licence_id,
    p_new_item_id: input.new_item_id,
    p_effective_at: input.effective_at,
    p_performed_by: actorId
  })

  if (error) {
    // Translate the RPC's raise messages into friendly ActionableErrors.
    const msg = error.message ?? ''
    if (msg.includes('same location')) {
      return changeFail(
        'Different location',
        'The new item must be at the same location as the current licence. Pick an item at this location, or end the licence and add a new one elsewhere.',
        'change_cross_location'
      )
    }
    if (msg.includes('different from')) {
      return changeFail('Same item', 'The new item is the same as the current one — pick a different one to change to.', 'change_same_item')
    }
    if (msg.includes('after the old licence start')) {
      return changeFail('Bad effective date', 'The effective date must be after the current licence started.', 'change_bad_date')
    }
    if (msg.includes('not licence-requiring')) {
      return changeFail('Not a membership', 'The selected item does not require a licence — pick a membership-style item.', 'change_wrong_item_type')
    }
    return changeFail('Could not apply change', msg, 'rpc_failed')
  }

  const r = data as ApplyLicenceChangeResult & { ok?: never }
  return {
    ok: true,
    old_licence_id: (r as any).old_licence_id,
    old_subscription_line_id: (r as any).old_subscription_line_id,
    new_licence_id: (r as any).new_licence_id,
    new_subscription_line_id: (r as any).new_subscription_line_id,
    effective_at: (r as any).effective_at,
    base_rate: (r as any).base_rate,
    currency: (r as any).currency
  }
}

// ─── L2: propose / approve / reject licence change ───────────────────

export type ProposeLicenceChangeInput = {
  source_licence_id: string
  new_item_id: string
  effective_at: string
  notes?: string | null
}

export type ProposeLicenceChangeResult =
  | { ok: true; proposal_id: string }
  | { ok: false; error: ActionableError }

const PROPOSE_FAIL = 'licence_proposal_failed'
function proposeFail(title: string, detail: string, code = PROPOSE_FAIL): ProposeLicenceChangeResult {
  return { ok: false, error: { code, title, detail } }
}

/**
 * Stage a licence change for approval. Doesn't touch the live licence/sub —
 * just records the intent. Once approved via approveLicenceProposal, the
 * standard apply_licence_change RPC fires.
 *
 * Validates the same shape rules as applyLicenceChange (different item,
 * same location, effective_at after start) up-front so the operator
 * doesn't get a surprise when the approver clicks Approve.
 */
export async function proposeLicenceChange(
  input: ProposeLicenceChangeInput,
  actorId: string | null
): Promise<ProposeLicenceChangeResult> {
  if (!input.source_licence_id) return proposeFail('Missing licence', 'No licence selected.')
  if (!input.new_item_id) return proposeFail('Missing new item', 'Pick a new membership / item.')
  if (!input.effective_at) return proposeFail('Missing effective date', 'Pick when the change should take effect.')

  // Validate same-shape constraints as the apply path so the proposal
  // has a chance of succeeding when an approver lands.
  const { data: lic } = await supabase
    .from('licenses')
    .select('id, started_at, item_id, location_id, organisation_id')
    .eq('id', input.source_licence_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!lic) return proposeFail('Licence not found', 'The licence you tried to change no longer exists.', 'source_missing')
  if (input.new_item_id === lic.item_id) {
    return proposeFail('Same item', 'The new item is the same as the current one — pick a different one.', 'change_same_item')
  }
  if (new Date(input.effective_at) <= new Date(lic.started_at)) {
    return proposeFail('Bad effective date', 'The effective date must be after the current licence started.', 'change_bad_date')
  }

  const { data: newItem } = await supabase
    .from('items')
    .select('id, location_id, active, item_types(requires_license)')
    .eq('id', input.new_item_id)
    .is('deleted_at', null)
    .is('item_types.deleted_at', null)
    .maybeSingle()
  if (!newItem) return proposeFail('Item not found', 'The chosen item does not exist or has been deleted.', 'item_not_found')
  if (!newItem.active) return proposeFail('Item inactive', 'The chosen item is not active.', 'item_inactive')
  if (!(newItem as any).item_types?.requires_license) {
    return proposeFail('Not a membership', 'The chosen item does not require a licence.', 'change_wrong_item_type')
  }
  if (newItem.location_id !== lic.location_id) {
    return proposeFail(
      'Different location',
      'The new item must be at the same location as the current licence.',
      'change_cross_location'
    )
  }

  const { data: row, error: insErr } = await sbForUser(actorId)
    .from('licence_change_proposals')
    .insert({
      source_licence_id: input.source_licence_id,
      new_item_id: input.new_item_id,
      effective_at: input.effective_at,
      proposed_by: actorId,
      proposed_notes: input.notes ?? null
    })
    .select('id')
    .single()

  if (insErr) {
    // Unique partial index → only one pending proposal per licence.
    if (insErr.code === '23505') {
      return proposeFail(
        'Already a pending proposal',
        'There is already a pending proposal for this licence. Approve or reject it first, then create a new one if needed.',
        'proposal_exists'
      )
    }
    return proposeFail('Could not save proposal', insErr.message, 'insert_failed')
  }

  return { ok: true, proposal_id: row!.id }
}

export type DecideLicenceProposalResult =
  | { ok: true; proposal_id: string; applied?: { licence_id: string; subscription_line_id: string } }
  | { ok: false; error: ActionableError }

/**
 * Approve a pending proposal — records the decision, then fires
 * apply_licence_change with the proposal's params and stamps the new
 * ids back onto the proposal row so the audit closes.
 */
export async function approveLicenceProposal(
  proposalId: string,
  actorId: string | null,
  notes: string | null = null
): Promise<DecideLicenceProposalResult> {
  if (!proposalId) return { ok: false, error: { code: PROPOSE_FAIL, title: 'Missing proposal id', detail: '' } }

  const sb = sbForUser(actorId)
  const { data: prop, error: loadErr } = await sb
    .from('licence_change_proposals')
    .select('id, source_licence_id, new_item_id, effective_at, status')
    .eq('id', proposalId)
    .maybeSingle()
  if (loadErr || !prop) return { ok: false, error: { code: 'proposal_not_found', title: 'Proposal not found', detail: 'It may have been deleted or already decided.' } }
  if (prop.status !== 'pending') {
    return { ok: false, error: { code: 'proposal_not_pending', title: 'Already decided', detail: `This proposal is already ${prop.status}.` } }
  }

  // Apply the change first; if it succeeds, mark the proposal approved.
  const apply = await applyLicenceChange({
    old_licence_id: prop.source_licence_id,
    new_item_id: prop.new_item_id,
    effective_at: prop.effective_at
  }, actorId)
  if (!apply.ok) return { ok: false, error: apply.error }

  // Stamp the proposal row — applied_at + the new licence/sub ids close
  // the audit loop. status = approved (final state).
  await sb.from('licence_change_proposals').update({
    status: 'approved',
    decided_by: actorId,
    decided_at: new Date().toISOString(),
    decided_notes: notes,
    applied_at: new Date().toISOString(),
    applied_licence_id: apply.new_licence_id,
    applied_subscription_line_id: apply.new_subscription_line_id,
    updated_at: new Date().toISOString()
  }).eq('id', proposalId)

  return {
    ok: true,
    proposal_id: proposalId,
    applied: { licence_id: apply.new_licence_id, subscription_line_id: apply.new_subscription_line_id }
  }
}

/**
 * Reject a pending proposal — records the decision, makes no changes
 * to the underlying licence/sub.
 */
export async function rejectLicenceProposal(
  proposalId: string,
  actorId: string | null,
  notes: string | null = null
): Promise<DecideLicenceProposalResult> {
  if (!proposalId) return { ok: false, error: { code: PROPOSE_FAIL, title: 'Missing proposal id', detail: '' } }

  const { data: prop, error: loadErr } = await sbForUser(actorId)
    .from('licence_change_proposals')
    .select('id, status')
    .eq('id', proposalId)
    .maybeSingle()
  if (loadErr || !prop) return { ok: false, error: { code: 'proposal_not_found', title: 'Proposal not found', detail: '' } }
  if (prop.status !== 'pending') {
    return { ok: false, error: { code: 'proposal_not_pending', title: 'Already decided', detail: `This proposal is already ${prop.status}.` } }
  }

  await sbForUser(actorId).from('licence_change_proposals').update({
    status: 'rejected',
    decided_by: actorId,
    decided_at: new Date().toISOString(),
    decided_notes: notes,
    updated_at: new Date().toISOString()
  }).eq('id', proposalId)

  return { ok: true, proposal_id: proposalId }
}
