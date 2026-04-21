import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import * as itemTypesService from '$lib/services/item-types.service'

function blank(data: FormData, key: string): string | null {
  const v = data.get(key)
  return v == null || v === '' ? null : (v as string)
}

function bool(data: FormData, key: string): boolean {
  const v = data.get(key)
  return v === 'true' || v === 'on' || v === '1'
}

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'items', 'read')
  const itemTypes = await itemTypesService.listAll()
  return { itemTypes }
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'create')

    const data = await request.formData()
    const slug = (data.get('slug') as string ?? '').trim()
    const name = (data.get('name') as string ?? '').trim()
    if (!slug || !name) return fail(400, { error: 'Slug and name are required' })

    const result = await itemTypesService.create({
      slug,
      name,
      description: blank(data, 'description'),
      requires_license: bool(data, 'requires_license'),
      sellable_ad_hoc: bool(data, 'sellable_ad_hoc'),
      sellable_recurring: bool(data, 'sellable_recurring')
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Item type created' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'update')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing id' })

    const result = await itemTypesService.update(id, {
      slug: (data.get('slug') as string ?? '').trim(),
      name: (data.get('name') as string ?? '').trim(),
      description: blank(data, 'description'),
      requires_license: bool(data, 'requires_license'),
      sellable_ad_hoc: bool(data, 'sellable_ad_hoc'),
      sellable_recurring: bool(data, 'sellable_recurring')
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Item type updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'items', 'delete')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing id' })

    const result = await itemTypesService.remove(id)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Item type deleted' }
  }
}
