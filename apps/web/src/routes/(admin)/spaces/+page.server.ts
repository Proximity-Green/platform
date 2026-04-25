import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as spacesService from '$lib/services/spaces.service'
import type { SpaceFilter } from '$lib/services/spaces.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'locations', 'read')
  const spaces = await spacesService.listSpaces()
  const [{ data: itemTypes }, { data: locations }] = await Promise.all([
    supabase.from('item_types').select('id, slug, name').order('name'),
    supabase.from('locations').select('id, name, short_name').order('name')
  ])
  return { spaces, itemTypes: itemTypes ?? [], locations: locations ?? [] }
}

function blank(data: FormData, k: string): string | null {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}

function numOrUndef(data: FormData, k: string): number | undefined {
  const v = data.get(k)
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function boolFromCheckbox(data: FormData, k: string, defaultValue = true): boolean {
  const v = data.get(k)
  if (v == null) return defaultValue
  return v === 'on' || v === 'true' || v === '1'
}

function readFilter(data: FormData): SpaceFilter {
  const filter: SpaceFilter = {}
  const typeSlugs = data.getAll('filter_item_type_slugs').map(v => String(v)).filter(Boolean)
  if (typeSlugs.length) filter.item_type_slugs = typeSlugs
  const locIds = data.getAll('filter_location_ids').map(v => String(v)).filter(Boolean)
  if (locIds.length) filter.location_ids = locIds
  const capMin = numOrUndef(data, 'filter_capacity_min'); if (capMin !== undefined) filter.capacity_min = capMin
  const capMax = numOrUndef(data, 'filter_capacity_max'); if (capMax !== undefined) filter.capacity_max = capMax
  const areaMin = numOrUndef(data, 'filter_area_min'); if (areaMin !== undefined) filter.area_min = areaMin
  const areaMax = numOrUndef(data, 'filter_area_max'); if (areaMax !== undefined) filter.area_max = areaMax
  return filter
}

function readSpaceInput(data: FormData): spacesService.SpaceInput {
  const manualRaw = data.getAll('manual_item_ids').map(v => String(v)).filter(Boolean)
  return {
    name: (data.get('name') as string) ?? '',
    description: blank(data, 'description'),
    filter: readFilter(data),
    manual_item_ids: manualRaw.length ? manualRaw : null,
    active: boolFromCheckbox(data, 'active', true)
  }
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'create')

    const data = await request.formData()
    const input = readSpaceInput(data)
    if (!input.name) return fail(400, { error: 'Name is required' })

    const result = await spacesService.createSpace(input, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Space created' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing id' })
    const input = readSpaceInput(data)
    const result = await spacesService.updateSpace(id, input, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Space updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'delete')

    const data = await request.formData()
    const result = await spacesService.deleteSpace(data.get('id') as string, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Space deleted' }
  }
}
