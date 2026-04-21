import { supabase } from '$lib/services/permissions.service'

export type LocationStatus = 'active' | 'paused' | 'closed' | 'planned' | 'inactive'

export type LocationInput = {
  // Identity
  name: string
  slug: string
  short_name?: string | null
  description?: string | null

  legal_entity_id?: string | null

  // Address
  address_line_1?: string | null
  address_line_2?: string | null
  suburb?: string | null
  city?: string | null
  postal_code?: string | null
  country_code?: string | null

  // Geo
  latitude?: number | null
  longitude?: number | null

  // Contact
  email?: string | null
  phone?: string | null
  website?: string | null

  timezone?: string | null
  currency?: string | null

  // Branding
  logo_url?: string | null
  hero_image_url?: string | null
  map_image_url?: string | null
  map_link?: string | null
  background_colour?: string | null

  // Ops
  access_instructions?: string | null
  community_manager_person_id?: string | null
  banking_account_number?: string | null
  banking_bank_code?: string | null

  // Accounting
  accounting_external_tenant_id?: string | null
  accounting_gl_code?: string | null
  accounting_item_code?: string | null
  accounting_tax_code?: string | null
  accounting_tracking_code?: string | null
  accounting_tracking_name?: string | null
  accounting_stationery_id?: string | null
  accounting_branding_theme?: string | null
  accounting_tax_type?: string | null

  // Commercial
  commercial_tax_percentage?: number | null
  commercial_app_discount_percentage?: number | null

  area_unit?: string | null
  billing_date_pattern?: string | null

  // Lifecycle
  status?: LocationStatus
  headquarters?: boolean
  started_at?: string | null
  closed_at?: string | null
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export async function listLocations() {
  const { data } = await supabase
    .from('locations')
    .select(`
      *,
      legal_entity:legal_entities(id, name),
      community_manager:persons!locations_community_manager_person_id_fkey(id, first_name, last_name)
    `)
    .order('name', { ascending: true })
  return data ?? []
}

export async function createLocation(input: LocationInput): Promise<ServiceResult> {
  const { error } = await supabase.from('locations').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateLocation(id: string, input: Partial<LocationInput>): Promise<ServiceResult> {
  const { error } = await supabase.from('locations').update(input).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteLocation(id: string): Promise<ServiceResult> {
  const { error } = await supabase.from('locations').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
