import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as subsService from '$lib/services/subscription-lines.service'
import type { SubscriptionStatus, SubscriptionFrequency } from '$lib/services/subscription-lines.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'subscriptions', 'read')

  const subs = await subsService.listAll()
  const [{ data: items }, { data: licenses }, { data: orgs }, { data: locations }, { data: persons }] =
    await Promise.all([
      supabase.from('items').select('id, name, location_id, item_types(slug, requires_license, sellable_recurring)').is('deleted_at', null).is('item_types.deleted_at', null).order('name'),
      supabase.from('licenses').select('id, item_id, location_id, items(name), organisation_id').is('deleted_at', null).is('items.deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('organisations').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('locations').select('id, name, short_name, currency').is('deleted_at', null).order('name'),
      supabase.from('persons').select('id, first_name, last_name').is('deleted_at', null).order('first_name')
    ])

  const licensesEnriched = (licenses ?? []).map((l: any) => ({
    id: l.id,
    organisation_id: l.organisation_id,
    location_id: l.location_id,
    label: l.items?.name ? `Licence: ${l.items.name}` : `Licence ${l.id.slice(0, 8)}`
  }))

  return {
    subs,
    items: items ?? [],
    licenses: licensesEnriched,
    organisations: orgs ?? [],
    locations: locations ?? [],
    persons: persons ?? []
  }
}

const blank = (data: FormData, k: string): string | null => {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}

function buildPayload(data: FormData) {
  const source = data.get('source_kind') as string // 'item' | 'license'
  const quantityRaw = data.get('quantity') as string | null
  const intervalRaw = data.get('interval_months') as string | null

  return {
    item_id: source === 'item' ? (data.get('item_id') as string) || null : null,
    license_id: source === 'license' ? (data.get('license_id') as string) || null : null,
    organisation_id: data.get('organisation_id') as string,
    location_id: data.get('location_id') as string,
    user_id: blank(data, 'user_id'),
    base_rate: Number(data.get('base_rate')),
    currency: data.get('currency') as string,
    quantity: quantityRaw ? Number(quantityRaw) : 1,
    frequency: (blank(data, 'frequency') as SubscriptionFrequency | null) ?? null,
    interval_months: intervalRaw ? Number(intervalRaw) : 1,
    status: (data.get('status') as SubscriptionStatus) || 'draft',
    started_at: data.get('started_at') as string,
    ended_at: blank(data, 'ended_at'),
    next_invoice_at: blank(data, 'next_invoice_at'),
    proposed_at: blank(data, 'proposed_at'),
    expires_at: blank(data, 'expires_at'),
    accepted_at: blank(data, 'accepted_at'),
    rejected_at: blank(data, 'rejected_at'),
    cancelled_at: blank(data, 'cancelled_at'),
    cancellation_reason: blank(data, 'cancellation_reason'),
    notes: blank(data, 'notes')
  }
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'create')

    const data = await request.formData()
    const result = await subsService.create(buildPayload(data))
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Subscription created' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'update')

    const data = await request.formData()
    const result = await subsService.update(data.get('id') as string, buildPayload(data))
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Subscription updated' }
  },

  setStatus: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'update')

    const data = await request.formData()
    const result = await subsService.setStatus(
      data.get('id') as string,
      data.get('status') as SubscriptionStatus
    )
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Status updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'delete')

    const data = await request.formData()
    const result = await subsService.remove(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Subscription deleted' }
  },

  convertToInvoice: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'create')

    const data = await request.formData()
    const id = data.get('id') as string
    const desiredStatus = data.get('status') as SubscriptionStatus | null

    // If the drawer status was changed to 'signed' but not yet saved, persist
    // it first so the convert step (which re-reads status from DB) passes.
    // Requires a signature row — expected to already exist for genuine sign flows.
    if (desiredStatus && desiredStatus === 'signed') {
      const s = await subsService.setStatus(id, 'signed', { accepted_at: new Date().toISOString() })
      if (!s.ok) return fail(400, { error: `Could not set signed: ${s.error}` })
    }

    const result = await subsService.convertToInvoice(id)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: `Invoice created (${result.invoice_id.slice(0, 8)})` }
  }
}
