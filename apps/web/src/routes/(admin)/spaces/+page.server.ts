import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as spacesService from '$lib/services/spaces.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'locations', 'read')
  const spaces = await spacesService.listSpaces()
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, short_name, slug, status')
    .order('name')
  return { spaces, locations: locations ?? [] }
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

function boolFromCheckbox(data: FormData, k: string, defaultValue = true): boolean {
  const v = data.get(k)
  if (v == null) return defaultValue
  return v === 'on' || v === 'true' || v === '1'
}

function readSpaceInput(data: FormData): spacesService.SpaceInput {
  return {
    location_id: (data.get('location_id') as string) ?? '',
    name: (data.get('name') as string) ?? '',
    code: blank(data, 'code'),
    description: blank(data, 'description'),
    capacity: numOrNull(data, 'capacity'),
    area_sqm: numOrNull(data, 'area_sqm'),
    floor: blank(data, 'floor'),
    active: boolFromCheckbox(data, 'active', true)
  }
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'create')

    const data = await request.formData()
    const input = readSpaceInput(data)
    if (!input.location_id) return fail(400, { error: 'Location is required' })
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
