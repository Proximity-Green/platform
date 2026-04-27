import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, getActualUserId } from '$lib/services/permissions.service'
import * as usersService from '$lib/services/users.service'
import { logFail } from '$lib/services/action-log.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'users', 'read')
  return await usersService.listUsersWithRolesAndPermissions()
}

export const actions = {
  invite: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const result = await usersService.inviteUser(data.get('email') as string, userId)
    if (!result.ok) return await logFail(userId, 'users.invite', result.error)
    return { success: true, message: result.message }
  },

  resend: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const result = await usersService.resendInvite(data.get('email') as string, userId)
    if (!result.ok) return await logFail(userId, 'users.resend', result.error)
    return { success: true, message: result.message }
  },

  setRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const result = await usersService.setUserRole(
      data.get('user_id') as string,
      data.get('role_id') as string,
      userId
    )
    if (!result.ok) return await logFail(userId, 'users.setRole', result.error)
    return { success: true, message: result.message }
  },

  revoke: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')
    const actualUserId = await getActualUserId(locals)

    const data = await request.formData()
    const result = await usersService.revokeUser(data.get('user_id') as string, actualUserId, userId)
    if (!result.ok) return await logFail(userId, 'users.revoke', result.error)
    return { success: true, message: result.message }
  },

  restore: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const result = await usersService.restoreUser(data.get('user_id') as string, userId)
    if (!result.ok) return await logFail(userId, 'users.restore', result.error)
    return { success: true, message: result.message }
  },

  resetPassword: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const result = await usersService.sendPasswordReset(data.get('email') as string, userId)
    if (!result.ok) return await logFail(userId, 'users.resetPassword', result.error)
    return { success: true, message: result.message }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const result = await usersService.deleteUser(data.get('user_id') as string, userId)
    if (!result.ok) return await logFail(userId, 'users.delete', result.error)
    return { success: true, message: result.message }
  }
}
