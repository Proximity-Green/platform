import { fail, error } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as itemsService from '$lib/services/items.service'
import * as lookups from '$lib/services/item-lookups.service'
import { logFail } from '$lib/services/action-log.service'

function blankStr(data: FormData, k: string): string | null {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}

function blankNum(data: FormData, k: string): number | null {
  const v = data.get(k)
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function blankBool(data: FormData, k: string, fallback = false): boolean {
  const v = data.get(k)
  if (v == null || v === '') return fallback
  return v === 'true' || v === 'on' || v === '1'
}

function trackingCodeIds(data: FormData): string[] {
  return data.getAll('tracking_code_ids').map(v => String(v)).filter(Boolean)
}

async function replaceItemTrackingCodes(itemId: string, ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: delErr } = await supabase.from('item_tracking_codes').delete().eq('item_id', itemId)
  if (delErr) return { ok: false, error: delErr.message }
  if (ids.length === 0) return { ok: true }
  const rows = ids.map(tracking_code_id => ({ item_id: itemId, tracking_code_id }))
  const { error: insErr } = await supabase.from('item_tracking_codes').insert(rows)
  if (insErr) return { ok: false, error: insErr.message }
  return { ok: true }
}

type Family = 'space' | 'membership' | 'product' | 'service' | 'art' | 'asset'
type ColType = 'text' | 'number' | 'integer' | 'boolean' | 'date'

const FAMILY_TABLES: Record<Family, string> = {
  space: 'space_details',
  membership: 'membership_details',
  product: 'product_details',
  service: 'service_details',
  art: 'art_details',
  asset: 'asset_details'
}

async function getFamily(itemTypeId: string): Promise<Family | null> {
  const { data } = await supabase.from('item_types').select('family').eq('id', itemTypeId).single()
  const f = (data as { family: string } | null)?.family
  return (f && (f in FAMILY_TABLES)) ? (f as Family) : null
}

function coerceDetailValue(raw: FormDataEntryValue | null, type: ColType): unknown {
  if (type === 'boolean') return raw === 'true' || raw === 'on' || raw === '1'
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (s === '') return null
  if (type === 'number') {
    const n = Number(s.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  if (type === 'integer') {
    const n = parseInt(s.replace(/,/g, ''), 10)
    return Number.isFinite(n) ? n : null
  }
  return s
}

const FAMILY_COLUMNS: Record<Family, { name: string; type: ColType }[]> = {
  space: [
    { name: 'meters_squared', type: 'number' },
    { name: 'capacity', type: 'integer' },
    { name: 'aesthetic', type: 'text' },
    { name: 'aesthetic_impact', type: 'number' },
    { name: 'safety_margin', type: 'number' },
    { name: 'start_price_per_square_meter', type: 'number' },
    { name: 'number_available', type: 'integer' },
    { name: 'private', type: 'boolean' },
    { name: 'business_case', type: 'text' },
    { name: 'layout', type: 'text' },
    { name: 'price_per_day', type: 'number' },
    { name: 'price_per_user_per_day', type: 'number' },
    { name: 'half_day_discount', type: 'number' },
    { name: 'full_day_discount', type: 'number' },
    { name: 'off_peak_cost', type: 'number' },
    { name: 'external_ical', type: 'text' }
  ],
  membership: [
    { name: 'occupancy_type', type: 'text' },
    { name: 'max_members', type: 'integer' },
    { name: 'cost_extra_member', type: 'number' },
    { name: 'cost_period', type: 'text' },
    { name: 'space_credits_per_month', type: 'integer' },
    { name: 'space_credits_cost_full_day', type: 'number' },
    { name: 'space_credits_cost_half_day', type: 'number' },
    { name: 'stuff_credits_per_month', type: 'integer' },
    { name: 'print_credits_per_month', type: 'integer' },
    { name: 'marketing_description', type: 'text' }
  ],
  product: [
    { name: 'volume', type: 'integer' },
    { name: 'member_discount', type: 'integer' },
    { name: 'price_customisable', type: 'boolean' },
    { name: 'pro_rata', type: 'boolean' },
    { name: 'self_service', type: 'boolean' },
    { name: 'payment_options', type: 'text' },
    { name: 'supplier_name', type: 'text' },
    { name: 'supplier_sku', type: 'text' },
    { name: 'price_updated_at', type: 'date' }
  ],
  service: [
    { name: 'duration_minutes', type: 'integer' },
    { name: 'billable_unit', type: 'text' },
    { name: 'requires_booking', type: 'boolean' },
    { name: 'capacity', type: 'integer' }
  ],
  art: [
    { name: 'artist_name', type: 'text' },
    { name: 'medium', type: 'text' },
    { name: 'dimensions_height_cm', type: 'number' },
    { name: 'dimensions_width_cm', type: 'number' },
    { name: 'dimensions_depth_cm', type: 'number' },
    { name: 'year_created', type: 'integer' },
    { name: 'edition_number', type: 'integer' },
    { name: 'edition_size', type: 'integer' },
    { name: 'framed', type: 'boolean' },
    { name: 'provenance', type: 'text' },
    { name: 'condition_notes', type: 'text' },
    { name: 'insurance_value', type: 'number' },
    { name: 'acquisition_cost', type: 'number' },
    { name: 'acquired_at', type: 'date' },
    { name: 'consignment', type: 'boolean' },
    { name: 'consignment_commission_percent', type: 'number' },
    { name: 'list_price', type: 'number' },
    { name: 'status', type: 'text' },
    { name: 'sold_at', type: 'date' },
    { name: 'sold_price', type: 'number' }
  ],
  asset: [
    { name: 'kind', type: 'text' },
    { name: 'make', type: 'text' },
    { name: 'model', type: 'text' },
    { name: 'serial_number', type: 'text' },
    { name: 'registration', type: 'text' },
    { name: 'acquired_at', type: 'date' },
    { name: 'acquisition_cost', type: 'number' },
    { name: 'insurance_value', type: 'number' },
    { name: 'last_service_at', type: 'date' },
    { name: 'odometer_km', type: 'number' },
    { name: 'status', type: 'text' },
    { name: 'rate_per_hour', type: 'number' },
    { name: 'rate_per_day', type: 'number' },
    { name: 'rate_per_week', type: 'number' },
    { name: 'notes', type: 'text' }
  ]
}

async function upsertDetails(itemId: string, family: Family | null, data: FormData) {
  if (!family) return { ok: true as const }
  const table = FAMILY_TABLES[family]
  const cols = FAMILY_COLUMNS[family]
  const row: Record<string, unknown> = { item_id: itemId, updated_at: new Date().toISOString() }
  for (const c of cols) {
    const value = coerceDetailValue(data.get(`detail_${c.name}`), c.type)
    if (value === null && c.type !== 'boolean') continue
    row[c.name] = value
  }
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'item_id' })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export const load = async ({ params, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'items', 'read')

  const id = params.id

  // Await only the item itself — this drives the page header and the form
  // identity. Everything else streams in as unawaited promises so the shell
  // paints immediately.
  const itemRes = await supabase
    .from('items')
    .select('*, item_types(slug, name, family), locations(name, short_name)')
    .eq('id', id)
    .single()
  if (itemRes.error || !itemRes.data) throw error(404, 'Item not found')

  const item = itemRes.data as any
  const family = (item.item_types?.family ?? null) as Family | null

  // Family details depend on the item's family, but we can also stream them.
  const detailsPromise: Promise<Record<string, unknown> | null> =
    family && FAMILY_TABLES[family]
      ? supabase.from(FAMILY_TABLES[family]).select('*').eq('item_id', id).maybeSingle()
          .then(r => (r.data ?? null) as Record<string, unknown> | null)
      : Promise.resolve(null)

  const linksPromise = supabase
    .from('item_tracking_codes')
    .select('tracking_code_id')
    .eq('item_id', id)
    .then(r => (r.data ?? []).map((l: any) => l.tracking_code_id as string))

  const subscriptionsPromise = supabase
    .from('subscription_lines')
    .select('id, status, base_rate, currency, quantity, started_at, ended_at, organisation_id, organisations(name)')
    .eq('item_id', id)
    .order('started_at', { ascending: false })
    .then(r => r.data ?? [])

  return {
    item,
    family,
    // Streamed — awaited on the client inside {#await}
    itemTypes: lookups.listItemTypes(),
    locations: lookups.listLocationsLite(),
    trackingCodes: lookups.listActiveTrackingCodes(),
    itemTrackingCodeIds: linksPromise,
    itemDetails: detailsPromise,
    subscriptions: subscriptionsPromise
  }
}

export const actions = {
  update: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'update')

    const data = await request.formData()
    const newItemTypeId = data.get('item_type_id') as string

    const result = await itemsService.update(params.id, {
      item_type_id: newItemTypeId,
      location_id: blankStr(data, 'location_id'),
      name: (data.get('name') as string ?? '').trim(),
      description: blankStr(data, 'description'),
      sku: blankStr(data, 'sku'),
      base_price: blankNum(data, 'base_price'),
      accounting_gl_code: blankStr(data, 'accounting_gl_code'),
      accounting_item_code: blankStr(data, 'accounting_item_code'),
      accounting_tax_code: blankStr(data, 'accounting_tax_code'),
      accounting_tax_percentage: blankNum(data, 'accounting_tax_percentage'),
      accounting_description: blankStr(data, 'accounting_description'),
      active: blankBool(data, 'active', true)
    })
    if (!result.ok) return await logFail(userId, 'items.update', result.error, { id: params.id })

    const linkResult = await replaceItemTrackingCodes(params.id, trackingCodeIds(data))
    if (!linkResult.ok) return await logFail(userId, 'items.update.tracking_codes', linkResult.error, { id: params.id })

    const family = await getFamily(newItemTypeId)
    const detailsResult = await upsertDetails(params.id, family, data)
    if (!detailsResult.ok) return await logFail(userId, 'items.update.details', detailsResult.error, { id: params.id, family })

    return { success: true, message: 'Item updated' }
  },

  delete: async ({ params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'delete')
    const result = await itemsService.remove(params.id)
    if (!result.ok) return await logFail(userId, 'items.delete', result.error, { id: params.id })
    return { success: true, message: 'Item deleted' }
  }
}
