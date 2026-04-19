import { fail } from '@sveltejs/kit'
import { supabase, requirePermission, getUserIdFromRequest } from '$lib/server/permissions'

export const load = async ({ cookies }) => {
  const userId = await getUserIdFromRequest(cookies)
  if (userId) await requirePermission(userId, 'users', 'read')

  const { data: { users }, error } = await supabase.auth.admin.listUsers()
  const { data: roles } = await supabase.from('roles').select('*')
  const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id, roles(name)')
  const { data: permissions } = await supabase.from('permissions').select('role_id, resource, action')

  return {
    users: users ?? [],
    roles: roles ?? [],
    userRoles: userRoles ?? [],
    permissions: permissions ?? []
  }
}

export const actions = {
  invite: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const email = data.get('email') as string

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://poc.proximity.green/auth/confirm'
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: `Invitation sent to ${email}` }
  },

  resend: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const email = data.get('email') as string

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://poc.proximity.green/auth/confirm'
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: `Invitation resent to ${email}` }
  },

  setRole: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const targetUserId = data.get('user_id') as string
    const roleId = data.get('role_id') as string

    await supabase.from('user_roles').delete().eq('user_id', targetUserId)
    if (roleId) {
      const { error } = await supabase.from('user_roles').insert({ user_id: targetUserId, role_id: roleId })
      if (error) return fail(400, { error: error.message })
    }
    return { success: true, message: 'Role updated' }
  },

  revoke: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const targetUserId = data.get('user_id') as string

    const { error } = await supabase.auth.admin.updateUserById(targetUserId, {
      ban_duration: '876600h'
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'User access revoked' }
  },

  restore: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const targetUserId = data.get('user_id') as string

    const { error } = await supabase.auth.admin.updateUserById(targetUserId, {
      ban_duration: 'none'
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'User access restored' }
  },

  resetPassword: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const email = data.get('email') as string

    const { error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: 'https://poc.proximity.green/auth/confirm' }
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: `Password reset sent to ${email}` }
  },

  delete: async ({ request, cookies }) => {
    const userId = await getUserIdFromRequest(cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const targetUserId = data.get('user_id') as string

    const { error } = await supabase.auth.admin.deleteUser(targetUserId)
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'User deleted' }
  }
}
