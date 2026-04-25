import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as licensesService from '$lib/services/licenses.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'subscriptions', 'read')

  const licenses = await licensesService.listAll()
  const [{ data: items }, { data: orgs }, { data: locations }, { data: persons }] =
    await Promise.all([
      supabase.from('items').select('id, name').order('name'),
      supabase.from('organisations').select('id, name').order('name'),
      supabase.from('locations').select('id, name, short_name').order('name'),
      supabase.from('persons').select('id, first_name, last_name').order('first_name')
    ])

  return {
    licenses,
    items: items ?? [],
    organisations: orgs ?? [],
    locations: locations ?? [],
    persons: persons ?? []
  }
}

const blank = (data: FormData, k: string): string | null => {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'create')

    const data = await request.formData()
    const result = await licensesService.create({
      item_id: data.get('item_id') as string,
      organisation_id: data.get('organisation_id') as string,
      location_id: data.get('location_id') as string,
      user_id: blank(data, 'user_id'),
      started_at: data.get('started_at') as string,
      ended_at: blank(data, 'ended_at'),
      notes: blank(data, 'notes')
    }, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Licence created' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'update')

    const data = await request.formData()
    const result = await licensesService.update(data.get('id') as string, {
      item_id: data.get('item_id') as string,
      organisation_id: data.get('organisation_id') as string,
      location_id: data.get('location_id') as string,
      user_id: blank(data, 'user_id'),
      started_at: data.get('started_at') as string,
      ended_at: blank(data, 'ended_at'),
      notes: blank(data, 'notes')
    }, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Licence updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'delete')

    const data = await request.formData()
    const result = await licensesService.remove(data.get('id') as string, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Licence deleted' }
  }
}
