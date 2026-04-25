import { fail, error, redirect } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as itemTypesService from '$lib/services/item-types.service'
import { logFail } from '$lib/services/action-log.service'

function blank(data: FormData, key: string): string | null {
  const v = data.get(key)
  return v == null || v === '' ? null : (v as string)
}
function bool(data: FormData, key: string): boolean {
  const v = data.get(key)
  return v === 'true' || v === 'on' || v === '1'
}
function jsonOrNull(raw: string | null): Record<string, any> | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export const load = async ({ params, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'items', 'read')

  const id = params.id

  const typeRes = await supabase
    .from('item_types')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (typeRes.error || !typeRes.data) throw error(404, 'Item type not found')

  const slug = (typeRes.data as { slug: string }).slug
  const TYPE_TABLES: Record<string, string> = {
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
  const detailsTable = TYPE_TABLES[slug] ?? null

  const itemsPromise = (async () => {
    const { data: itemRows } = await supabase
      .from('items')
      .select('id, name, location_id, base_rate, active, locations(name, short_name)')
      .eq('item_type_id', id)
      .is('deleted_at', null)
      .is('locations.deleted_at', null)
      .order('name')
    const list = (itemRows ?? []) as any[]
    if (!detailsTable || list.length === 0) {
      return list.map(i => ({ ...i, details: null }))
    }
    const ids = list.map(i => i.id)
    const { data: detailRows } = await supabase.from(detailsTable).select('*').in('item_id', ids)
    const byItem = new Map(((detailRows ?? []) as any[]).map(r => [r.item_id, r]))
    return list.map(i => ({ ...i, details: byItem.get(i.id) ?? null }))
  })()

  return {
    type: typeRes.data,
    items: itemsPromise
  }
}

export const actions = {
  update: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'update')

    const data = await request.formData()
    const result = await itemTypesService.update(params.id, {
      slug: (data.get('slug') as string ?? '').trim(),
      name: (data.get('name') as string ?? '').trim(),
      description: blank(data, 'description'),
      pricing_params: jsonOrNull(blank(data, 'pricing_params')),
      requires_license: bool(data, 'requires_license'),
      sellable_ad_hoc: bool(data, 'sellable_ad_hoc'),
      sellable_recurring: bool(data, 'sellable_recurring'),
      apply_pro_rata: bool(data, 'apply_pro_rata')
    }, userId)
    if (!result.ok) return await logFail(userId, 'item_types.update', result.error, { id: params.id })
    return { success: true, message: 'Item type updated' }
  },

  delete: async ({ params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'delete')
    const result = await itemTypesService.remove(params.id, userId)
    if (!result.ok) return await logFail(userId, 'item_types.delete', result.error, { id: params.id })
    throw redirect(303, '/item-types')
  }
}
