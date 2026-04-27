import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import * as rolesService from '$lib/services/roles.service'
import { logFail } from '$lib/services/action-log.service'

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
      data.get('description') as string,
      userId
    )
    if (!result.ok) return await logFail(userId, 'roles.createRole', result.error)
    return { success: true, message: result.message }
  },

  updateRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.updateRole(
      data.get('id') as string,
      data.get('name') as string,
      data.get('description') as string,
      userId
    )
    if (!result.ok) return await logFail(userId, 'roles.updateRole', result.error)
    return { success: true, message: result.message }
  },

  deleteRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.deleteRole(data.get('id') as string, userId)
    if (!result.ok) return await logFail(userId, 'roles.deleteRole', result.error)
    return { success: true, message: result.message }
  },

  addPermission: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.addPermission(
      data.get('role_id') as string,
      data.get('resource') as string,
      data.get('action') as string,
      userId
    )
    if (!result.ok) return await logFail(userId, 'roles.addPermission', result.error)
    return { success: true, message: result.message }
  },

  detachUser: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.detachUserFromRole(
      data.get('user_id') as string,
      data.get('role_id') as string,
      userId
    )
    if (!result.ok) return await logFail(userId, 'roles.detachUser', result.error)
    return { success: true, message: result.message }
  },

  removePermission: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const result = await rolesService.removePermission(data.get('id') as string, userId)
    if (!result.ok) return await logFail(userId, 'roles.removePermission', result.error)
    return { success: true, message: result.message }
  }
}
