import { fail } from '@sveltejs/kit'
import { supabase, requirePermission, getUserIdFromRequest, getActualUserId, logAuthAction } from '$lib/server/permissions'
import { log } from '$lib/server/systemLog'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
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
  invite: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const email = data.get('email') as string

    const { data: result, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://poc.proximity.green/auth/confirm'
    })
    if (error) return fail(400, { error: error.message })

    await logAuthAction('INSERT', result.user.id, userId, {
      email, action_type: 'invite', invited_by: userId
    })
    await log('email', 'success', `Invitation email sent to ${email}`, { to: email, type: 'invite' }, userId)
    await log('auth', 'info', `User invited: ${email}`, { email, invited_by: userId }, userId)

    return { success: true, message: `Invitation sent to ${email}` }
  },

  resend: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const email = data.get('email') as string

    const { data: result, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://poc.proximity.green/auth/confirm'
    })
    if (error) return fail(400, { error: error.message })

    await logAuthAction('UPDATE', result.user.id, userId, {
      email, action_type: 'resend_invite', resent_by: userId
    })

    return { success: true, message: `Invitation resent to ${email}` }
  },

  setRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const targetUserId = data.get('user_id') as string
    const roleId = data.get('role_id') as string

    // Get old role for logging
    const { data: oldRole } = await supabase.from('user_roles').select('roles(name)').eq('user_id', targetUserId).single()
    const oldRoleName = (oldRole as any)?.roles?.name ?? 'none'

    await supabase.from('user_roles').delete().eq('user_id', targetUserId)

    let newRoleName = 'none'
    if (roleId) {
      const { error } = await supabase.from('user_roles').insert({ user_id: targetUserId, role_id: roleId })
      if (error) return fail(400, { error: error.message })
      const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single()
      newRoleName = role?.name ?? roleId
    }

    await logAuthAction('UPDATE', targetUserId, userId, {
      action_type: 'role_change', old_role: oldRoleName, new_role: newRoleName, changed_by: userId
    })

    return { success: true, message: 'Role updated' }
  },

  revoke: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')
    const actualUserId = await getActualUserId(locals)

    const data = await request.formData()
    const targetUserId = data.get('user_id') as string

    const { data: { user } } = await supabase.auth.admin.getUserById(targetUserId)

    const { error } = await supabase.auth.admin.updateUserById(targetUserId, {
      ban_duration: '876600h'
    })
    if (error) return fail(400, { error: error.message })

    await logAuthAction('UPDATE', targetUserId, actualUserId, {
      email: user?.email, action_type: 'revoke', revoked_by: actualUserId
    })
    await log('auth', 'warning', `User access revoked: ${user?.email}`, { email: user?.email }, actualUserId, userId !== actualUserId ? userId : null)

    return { success: true, message: 'User access revoked' }
  },

  restore: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const targetUserId = data.get('user_id') as string

    const { data: { user } } = await supabase.auth.admin.getUserById(targetUserId)

    const { error } = await supabase.auth.admin.updateUserById(targetUserId, {
      ban_duration: 'none'
    })
    if (error) return fail(400, { error: error.message })

    await logAuthAction('RESTORE', targetUserId, userId, {
      email: user?.email, action_type: 'restore_access', restored_by: userId
    })
    await log('auth', 'info', `User access restored: ${user?.email}`, { email: user?.email, restored_by: userId }, userId)

    return { success: true, message: 'User access restored' }
  },

  resetPassword: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const email = data.get('email') as string

    const { data: link, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: 'https://poc.proximity.green/auth/confirm' }
    })
    if (error) return fail(400, { error: error.message })

    await logAuthAction('UPDATE', link.user.id, userId, {
      email, action_type: 'password_reset', initiated_by: userId
    })

    await log('email', 'success', `Password reset email sent to ${email}`, { to: email, type: 'password_reset' }, userId)
    return { success: true, message: `Password reset sent to ${email}` }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const targetUserId = data.get('user_id') as string

    const { data: { user } } = await supabase.auth.admin.getUserById(targetUserId)

    const { error } = await supabase.auth.admin.deleteUser(targetUserId)
    if (error) return fail(400, { error: error.message })

    await logAuthAction('DELETE', targetUserId, userId, {
      email: user?.email, action_type: 'delete_user', deleted_by: userId
    })

    await log('auth', 'error', `User permanently deleted: ${user?.email}`, { email: user?.email, deleted_by: userId }, userId)
    return { success: true, message: 'User deleted' }
  }
}
