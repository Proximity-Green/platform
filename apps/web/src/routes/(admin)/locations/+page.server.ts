import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as locationsService from '$lib/services/locations.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'locations', 'read')
  const locations = await locationsService.listLocations()
  const { data: legalEntities } = await supabase.from('legal_entities').select('id, name').order('name')
  const { data: persons } = await supabase.from('persons').select('id, first_name, last_name').order('first_name')
  return {
    locations,
    legalEntities: legalEntities ?? [],
    persons: persons ?? []
  }
}

function blank(data: FormData, k: string): string | null {
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
    accounting_tracking_code: blank(data, 'accounting_tracking_code'),
    accounting_tracking_name: blank(data, 'accounting_tracking_name'),
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

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'create')

    const data = await request.formData()
    const input = readLocationInput(data)
    if (!input.name || !input.slug) {
      return fail(400, { error: 'Name and slug are required' })
    }
    const result = await locationsService.createLocation(input)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Location created' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing id' })
    const input = readLocationInput(data)
    const result = await locationsService.updateLocation(id, input)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Location updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'delete')

    const data = await request.formData()
    const result = await locationsService.deleteLocation(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Location deleted' }
  }
}
