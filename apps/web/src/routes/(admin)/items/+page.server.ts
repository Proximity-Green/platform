import { requirePermission, getUserIdFromRequest, supabase, sbForUser } from '$lib/services/permissions.service'
import * as itemsService from '$lib/services/items.service'
import * as lookups from '$lib/services/item-lookups.service'
import { logFail } from '$lib/services/action-log.service'

function blankStr(data: FormData, key: string): string | null {
  const v = data.get(key)
  return v == null || v === '' ? null : (v as string)
}

function blankNum(data: FormData, key: string): number | null {
  const v = data.get(key)
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function blankBool(data: FormData, key: string, fallback = false): boolean {
  const v = data.get(key)
  if (v == null || v === '') return fallback
  return v === 'true' || v === 'on' || v === '1'
}

function csvArray(data: FormData, key: string): string[] | null {
  const v = data.get(key)
  if (v == null || v === '') return null
  return (v as string)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function trackingCodeIds(data: FormData): string[] {
  return data.getAll('tracking_code_ids').map(v => String(v)).filter(Boolean)
}

async function replaceItemTrackingCodes(itemId: string, ids: string[], actorId: string | null = null): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = sbForUser(actorId)
  const { error: delErr } = await sb
    .from('item_tracking_codes')
    .delete()
    .eq('item_id', itemId)
  if (delErr) return { ok: false, error: delErr.message }

  if (ids.length === 0) return { ok: true }

  const rows = ids.map(tracking_code_id => ({ item_id: itemId, tracking_code_id }))
  const { error: insErr } = await sb.from('item_tracking_codes').insert(rows)
  if (insErr) return { ok: false, error: insErr.message }
  return { ok: true }
}

// ────────────────────────────────────────────────────────────────────────
// Family-based detail tables
// ────────────────────────────────────────────────────────────────────────

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

async function getFamily(itemTypeId: string): Promise<Family | null> {
  const { data } = await supabase
    .from('item_types')
    .select('family')
    .eq('id', itemTypeId)
    .single()
  const f = (data as { family: string } | null)?.family
  return (f && (f in FAMILY_TABLES)) ? (f as Family) : null
}

function coerceDetailValue(raw: FormDataEntryValue | null, type: ColType): unknown {
  if (type === 'boolean') {
    return raw === 'true' || raw === 'on' || raw === '1'
  }
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
  // text, date → pass through as string
  return s
}

async function upsertDetails(
  itemId: string,
  family: Family | null,
  data: FormData,
  actorId: string | null = null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!family) return { ok: true }
  const table = FAMILY_TABLES[family]
  const cols = FAMILY_COLUMNS[family]
  const row: Record<string, unknown> = { item_id: itemId, updated_at: new Date().toISOString() }
  for (const c of cols) {
    const value = coerceDetailValue(data.get(`detail_${c.name}`), c.type)
    if (value === null && c.type !== 'boolean') continue
    row[c.name] = value
  }
  const { error } = await sbForUser(actorId).from(table).upsert(row, { onConflict: 'item_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'items', 'read')

  // Items is the primary data — await it so the table has rows immediately.
  // Lookups come from the shared cache; item-tracking-code link map streams.
  const [items, itemTypes, locations, trackingCodes] = await Promise.all([
    itemsService.listAll(),
    lookups.listItemTypes(),
    lookups.listLocationsLite(),
    lookups.listActiveTrackingCodes()
  ])

  const linksPromise = supabase
    .from('item_tracking_codes')
    .select('item_id, tracking_code_id')
    .then(res => {
      const map: Record<string, string[]> = {}
      for (const link of (res.data ?? []) as { item_id: string; tracking_code_id: string }[]) {
        if (!map[link.item_id]) map[link.item_id] = []
        map[link.item_id].push(link.tracking_code_id)
      }
      return map
    })

  // Ids of items that have at least one currently-signed subscription line.
  // Used to drive the "On active subs" filter on the list.
  const activeSubItemIdsPromise = supabase
    .from('subscription_lines')
    .select('item_id')
    .eq('status', 'signed')
    .not('item_id', 'is', null)
    .then(res => {
      const ids = new Set<string>()
      for (const row of (res.data ?? []) as { item_id: string }[]) ids.add(row.item_id)
      return [...ids]
    })

  return {
    items,
    itemTypes,
    locations,
    trackingCodes,
    itemTrackingCodeIds: linksPromise,
    activeSubItemIds: activeSubItemIdsPromise
  }
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'create')

    const data = await request.formData()
    const item_type_id = data.get('item_type_id') as string
    const name = (data.get('name') as string ?? '').trim()
    if (!item_type_id || !name) return await logFail(userId, 'items.create', 'Item type and name are required', { item_type_id, name })

    const insert = {
      item_type_id,
      location_id: blankStr(data, 'location_id'),
      name,
      description: blankStr(data, 'description'),
      sku: blankStr(data, 'sku'),
      base_price: blankNum(data, 'base_price'),
      accounting_gl_code: blankStr(data, 'accounting_gl_code'),
      accounting_item_code: blankStr(data, 'accounting_item_code'),
      accounting_tax_code: blankStr(data, 'accounting_tax_code'),
      accounting_tax_percentage: blankNum(data, 'accounting_tax_percentage'),
      accounting_description: blankStr(data, 'accounting_description'),
      active: blankBool(data, 'active', true)
    }

    const { data: inserted, error } = await sbForUser(userId)
      .from('items')
      .insert(insert)
      .select('id')
      .single()
    if (error || !inserted) return await logFail(userId, 'items.create', error?.message ?? 'Failed to create item', { insert })

    const linkResult = await replaceItemTrackingCodes(inserted.id, trackingCodeIds(data), userId)
    if (!linkResult.ok) return await logFail(userId, 'items.create.tracking_codes', linkResult.error, { item_id: inserted.id })

    const family = await getFamily(item_type_id)
    const detailsResult = await upsertDetails(inserted.id, family, data, userId)
    if (!detailsResult.ok) return await logFail(userId, 'items.create.details', detailsResult.error, { item_id: inserted.id, family })

    return { success: true, message: 'Item created' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'delete')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return await logFail(userId, 'items.delete', 'Missing id')

    const result = await itemsService.remove(id, userId)
    if (!result.ok) return await logFail(userId, 'items.delete', result.error, { id })
    return { success: true, message: 'Item deleted' }
  }
}
