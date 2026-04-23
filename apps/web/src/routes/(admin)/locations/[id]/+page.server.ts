import { fail, error } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase, sbForUser } from '$lib/services/permissions.service'
import * as locationsService from '$lib/services/locations.service'
import { invalidateItemLookups } from '$lib/services/item-lookups.service'

const blank = (data: FormData, k: string): string | null => {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}

function numOrNull(data: FormData, k: string): number | null {
  const v = data.get(k)
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function boolFromCheckbox(data: FormData, k: string): boolean {
  const v = data.get(k)
  return v === 'on' || v === 'true' || v === '1'
}

function readLocationInput(data: FormData): locationsService.LocationInput {
  const status = (data.get('status') as string) || 'active'
  return {
    name: (data.get('name') as string) ?? '',
    slug: (data.get('slug') as string) ?? '',
    short_name: blank(data, 'short_name'),
    description: blank(data, 'description'),
    legal_entity_id: blank(data, 'legal_entity_id'),
    address_line_1: blank(data, 'address_line_1'),
    address_line_2: blank(data, 'address_line_2'),
    suburb: blank(data, 'suburb'),
    city: blank(data, 'city'),
    postal_code: blank(data, 'postal_code'),
    country_code: blank(data, 'country_code'),
    latitude: numOrNull(data, 'latitude'),
    longitude: numOrNull(data, 'longitude'),
    email: blank(data, 'email'),
    phone: blank(data, 'phone'),
    website: blank(data, 'website'),
    timezone: blank(data, 'timezone') ?? 'Africa/Johannesburg',
    currency: blank(data, 'currency') ?? 'ZAR',
    logo_url: blank(data, 'logo_url'),
    hero_image_url: blank(data, 'hero_image_url'),
    map_image_url: blank(data, 'map_image_url'),
    map_link: blank(data, 'map_link'),
    background_colour: blank(data, 'background_colour'),
    access_instructions: blank(data, 'access_instructions'),
    community_manager_person_id: blank(data, 'community_manager_person_id'),
    banking_account_number: blank(data, 'banking_account_number'),
    banking_bank_code: blank(data, 'banking_bank_code'),
    accounting_external_tenant_id: blank(data, 'accounting_external_tenant_id'),
    accounting_gl_code: blank(data, 'accounting_gl_code'),
    accounting_item_code: blank(data, 'accounting_item_code'),
    accounting_tax_code: blank(data, 'accounting_tax_code'),
    accounting_stationery_id: blank(data, 'accounting_stationery_id'),
    accounting_branding_theme: blank(data, 'accounting_branding_theme'),
    accounting_tax_type: blank(data, 'accounting_tax_type'),
    commercial_tax_percentage: numOrNull(data, 'commercial_tax_percentage'),
    commercial_app_discount_percentage: numOrNull(data, 'commercial_app_discount_percentage'),
    area_unit: blank(data, 'area_unit') ?? 'sqm',
    billing_date_pattern: blank(data, 'billing_date_pattern') ?? 'advance_dated',
    status: status as locationsService.LocationStatus,
    headquarters: boolFromCheckbox(data, 'headquarters'),
    started_at: blank(data, 'started_at'),
    closed_at: blank(data, 'closed_at')
  }
}

export const load = async ({ params, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'locations', 'read')

  const id = params.id

  const [
    locationRes,
    trackingCodesRes,
    legalEntitiesRes,
    personsRes
  ] = await Promise.all([
    supabase.from('locations').select('*').eq('id', id).single(),
    supabase
      .from('tracking_codes')
      .select('*')
      .eq('location_id', id)
      .order('category', { ascending: true, nullsFirst: false })
      .order('is_primary', { ascending: false })
      .order('code', { ascending: true }),
    supabase.from('legal_entities').select('id, name').order('name'),
    supabase.from('persons').select('id, first_name, last_name').order('first_name')
  ])

  if (locationRes.error || !locationRes.data) throw error(404, 'Location not found')

  return {
    location: locationRes.data,
    trackingCodes: trackingCodesRes.data ?? [],
    legalEntities: legalEntitiesRes.data ?? [],
    persons: personsRes.data ?? []
  }
}

export const actions = {
  update: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const input = readLocationInput(data)
    const result = await locationsService.updateLocation(params.id, input, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Location updated' }
  },

  addTrackingCode: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const code = blank(data, 'code')
    const name = blank(data, 'name')
    if (!code) return fail(400, { error: 'Code is required' })
    if (!name) return fail(400, { error: 'Name is required' })

    const isPrimary = data.get('is_primary') === 'on'

    // Promoting to primary: unset any existing primary for this location first
    // so the unique partial index doesn't reject the insert.
    const sb = sbForUser(userId)
    if (isPrimary) {
      const { error: unsetErr } = await sb
        .from('tracking_codes')
        .update({ is_primary: false })
        .eq('location_id', params.id)
        .eq('is_primary', true)
      if (unsetErr) return fail(400, { error: unsetErr.message })
    }

    const { error: insErr } = await sb.from('tracking_codes').insert({
      location_id: params.id,
      category: blank(data, 'category'),
      code,
      name,
      accounting_external_category_id: blank(data, 'accounting_external_category_id'),
      accounting_external_option_id: blank(data, 'accounting_external_option_id'),
      is_primary: isPrimary
    })
    if (insErr) return fail(400, { error: insErr.message })
    invalidateItemLookups()
    return { success: true, message: 'Tracking code added' }
  },

  setPrimary: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    if (!id) return fail(400, { error: 'Missing id' })

    // Two-step flip: the partial unique index WHERE is_primary = true rejects a
    // single UPDATE that leaves two rows true mid-statement, so demote first.
    const sb = sbForUser(userId)
    const { error: demoteErr } = await sb
      .from('tracking_codes')
      .update({ is_primary: false })
      .eq('location_id', params.id)
      .eq('is_primary', true)
    if (demoteErr) return fail(400, { error: demoteErr.message })

    const { error: promoteErr } = await sb
      .from('tracking_codes')
      .update({ is_primary: true })
      .eq('id', id)
    if (promoteErr) return fail(400, { error: promoteErr.message })

    invalidateItemLookups()
    return { success: true, message: 'Primary tracking code updated' }
  },

  toggleActive: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    const active = data.get('active') === 'true'
    if (!id) return fail(400, { error: 'Missing id' })

    const { error: upErr } = await sbForUser(userId)
      .from('tracking_codes')
      .update({ active: !active })
      .eq('id', id)
    if (upErr) return fail(400, { error: upErr.message })
    invalidateItemLookups()
    return { success: true, message: 'Tracking code updated' }
  },

  updateTrackingCode: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    const code = blank(data, 'code')
    const name = blank(data, 'name')
    if (!id) return fail(400, { error: 'Missing id' })
    if (!code) return fail(400, { error: 'Code is required' })
    if (!name) return fail(400, { error: 'Name is required' })

    const { error: upErr } = await sbForUser(userId)
      .from('tracking_codes')
      .update({
        category: blank(data, 'category'),
        code,
        name,
        accounting_external_category_id: blank(data, 'accounting_external_category_id'),
        accounting_external_option_id: blank(data, 'accounting_external_option_id'),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
    if (upErr) return fail(400, { error: upErr.message })
    invalidateItemLookups()
    return { success: true, message: 'Tracking code updated' }
  },

  deleteTrackingCode: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    if (!id) return fail(400, { error: 'Missing id' })

    const { error: delErr } = await sbForUser(userId).from('tracking_codes').delete().eq('id', id)
    if (delErr) return fail(400, { error: delErr.message })
    invalidateItemLookups()
    return { success: true, message: 'Tracking code deleted' }
  }
}
