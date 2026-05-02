import { fail, error } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase, sbForUser } from '$lib/services/permissions.service'
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

async function replaceItemTrackingCodes(itemId: string, ids: string[], actorId: string | null = null): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = sbForUser(actorId)
  const { error: delErr } = await sb.from('item_tracking_codes').delete().eq('item_id', itemId)
  if (delErr) return { ok: false, error: delErr.message }
  if (ids.length === 0) return { ok: true }
  const rows = ids.map(tracking_code_id => ({ item_id: itemId, tracking_code_id }))
  const { error: insErr } = await sb.from('item_tracking_codes').insert(rows)
  if (insErr) return { ok: false, error: insErr.message }
  return { ok: true }
}

type TypeSlug =
  | 'office'
  | 'meeting_room'
  | 'hotel_room'
  | 'membership'
  | 'product'
  | 'service'
  | 'art'
  | 'asset'
  | 'vehicle'
  | 'equipment'
type ColType = 'text' | 'number' | 'integer' | 'boolean' | 'date'

const TYPE_TABLES: Partial<Record<TypeSlug, string>> = {
  office: 'office_details',
  meeting_room: 'meeting_room_details',
  hotel_room: 'hotel_room_details',
  membership: 'membership_details',
  product: 'product_details',
  service: 'service_details',
  art: 'art_details',
  asset: 'asset_details',
  vehicle: 'asset_details',
  equipment: 'asset_details'
}

async function getTypeSlug(itemTypeId: string): Promise<TypeSlug | null> {
  const { data } = await supabase.from('item_types').select('slug').eq('id', itemTypeId).is('deleted_at', null).single()
  const s = (data as { slug: string } | null)?.slug
  return (s && (s in TYPE_TABLES)) ? (s as TypeSlug) : null
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

const TYPE_COLUMNS: Partial<Record<TypeSlug, { name: string; type: ColType }[]>> = {
  office: [
    { name: 'area_sqm', type: 'number' },
    { name: 'capacity', type: 'integer' },
    { name: 'aesthetic', type: 'text' },
    { name: 'aesthetic_impact', type: 'number' },
    { name: 'safety_margin', type: 'number' },
    { name: 'start_price_per_m2', type: 'number' },
    { name: 'layout', type: 'text' }
  ],
  meeting_room: [
    { name: 'capacity', type: 'integer' },
    { name: 'price_per_user_per_day', type: 'number' },
    { name: 'off_peak_factor', type: 'number' },
    { name: 'layout', type: 'text' },
    { name: 'slots_per_day', type: 'integer' }
  ],
  hotel_room: [
    { name: 'capacity', type: 'integer' },
    { name: 'price_per_day', type: 'number' },
    { name: 'layout', type: 'text' }
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

async function upsertDetails(itemId: string, slug: TypeSlug | null, data: FormData, actorId: string | null = null) {
  if (!slug) return { ok: true as const }
  const table = TYPE_TABLES[slug]
  const cols = TYPE_COLUMNS[slug]
  if (!table || !cols) return { ok: true as const }
  const row: Record<string, unknown> = { item_id: itemId, updated_at: new Date().toISOString() }
  for (const c of cols) {
    const value = coerceDetailValue(data.get(`detail_${c.name}`), c.type)
    if (value === null && c.type !== 'boolean') continue
    row[c.name] = value
  }
  const { error } = await sbForUser(actorId).from(table).upsert(row, { onConflict: 'item_id' })
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
    .select('*, item_types(slug, name, pricing_params), locations(name, short_name)')
    .eq('id', id)
    .is('deleted_at', null)
    .is('item_types.deleted_at', null)
    .is('locations.deleted_at', null)
    .single()
  if (itemRes.error || !itemRes.data) throw error(404, 'Item not found')

  const item = itemRes.data as any
  const slug = (item.item_types?.slug ?? null) as TypeSlug | null
  const detailsTable = slug ? TYPE_TABLES[slug] : null

  const detailsPromise: Promise<Record<string, unknown> | null> =
    detailsTable
      ? supabase.from(detailsTable).select('*').eq('item_id', id).maybeSingle()
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
    .is('deleted_at', null)
    .is('organisations.deleted_at', null)
    .order('started_at', { ascending: false })
    .then(r => r.data ?? [])

  return {
    item,
    slug,
    // Detail table for the item's family (e.g. meeting_room_details).
    // Surfaced so the client can pair its history with the item's own
    // history — *_details rows use item_id as their PK, so record_id
    // in change_log lines up with the item's id.
    detailsTable,
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
      base_rate_override: blankBool(data, 'base_rate_override', false),
      location_id: blankStr(data, 'location_id'),
      name: (data.get('name') as string ?? '').trim(),
      description: blankStr(data, 'description'),
      sku: blankStr(data, 'sku'),
      base_rate: blankNum(data, 'base_rate'),
      accounting_gl_code: blankStr(data, 'accounting_gl_code'),
      accounting_item_code: blankStr(data, 'accounting_item_code'),
      accounting_tax_code: blankStr(data, 'accounting_tax_code'),
      accounting_tax_percentage: blankNum(data, 'accounting_tax_percentage'),
      accounting_description: blankStr(data, 'accounting_description'),
      active: blankBool(data, 'active', true)
    }, userId)
    if (!result.ok) return await logFail(userId, 'items.update', result.error, { id: params.id })

    const linkResult = await replaceItemTrackingCodes(params.id, trackingCodeIds(data), userId)
    if (!linkResult.ok) return await logFail(userId, 'items.update.tracking_codes', linkResult.error, { id: params.id })

    const slug = await getTypeSlug(newItemTypeId)
    const detailsResult = await upsertDetails(params.id, slug, data, userId)
    if (!detailsResult.ok) return await logFail(userId, 'items.update.details', detailsResult.error, { id: params.id, slug })

    return { success: true, message: 'Item updated' }
  },

  delete: async ({ params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'delete')
    const result = await itemsService.remove(params.id, userId)
    if (!result.ok) return await logFail(userId, 'items.delete', result.error, { id: params.id })
    return { success: true, message: 'Item deleted' }
  }
}
