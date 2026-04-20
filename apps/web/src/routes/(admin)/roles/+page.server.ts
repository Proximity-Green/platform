import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import * as rolesService from '$lib/services/roles.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'roles', 'read')
  return await rolesService.listRolesWithCounts()
}

export const actions = {
  createRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.createRole(
      data.get('name') as string,
      data.get('description') as string
    )
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  },

  deleteRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.deleteRole(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  },

  addPermission: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.addPermission(
      data.get('role_id') as string,
      data.get('resource') as string,
      data.get('action') as string
    )
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  },

  removePermission: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.removePermission(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  }
}
