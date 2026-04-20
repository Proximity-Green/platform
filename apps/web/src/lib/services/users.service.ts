import { supabase, logAuthAction } from '$lib/services/permissions.service'
import { log } from '$lib/services/system-log.service'

const APP_URL = process.env.PUBLIC_APP_URL || 'https://poc.proximity.green'
const AUTH_CONFIRM_URL = `${APP_URL}/auth/confirm`

export type ServiceResult = { ok: true; message?: string } | { ok: false; error: string }

export async function listUsersWithRolesAndPermissions() {
  const { data: { users } } = await supabase.auth.admin.listUsers()
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

export async function inviteUser(email: string, invitedByUserId: string | null): Promise<ServiceResult> {
  const { data: result, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: AUTH_CONFIRM_URL
  })
  if (error) return { ok: false, error: error.message }

  await logAuthAction('INSERT', result.user.id, invitedByUserId, {
    email, action_type: 'invite', invited_by: invitedByUserId
  })
  await log('email', 'success', `Invitation email sent to ${email}`, { to: email, type: 'invite' }, invitedByUserId)
  await log('auth', 'info', `User invited: ${email}`, { email, invited_by: invitedByUserId }, invitedByUserId)

  return { ok: true, message: `Invitation sent to ${email}` }
}

export async function resendInvite(email: string, invitedByUserId: string | null): Promise<ServiceResult> {
  const { data: result, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: AUTH_CONFIRM_URL
  })
  if (error) return { ok: false, error: error.message }

  await logAuthAction('UPDATE', result.user.id, invitedByUserId, {
    email, action_type: 'resend_invite', resent_by: invitedByUserId
  })

  return { ok: true, message: `Invitation resent to ${email}` }
}

export async function setUserRole(
  targetUserId: string,
  roleId: string,
  changedByUserId: string | null
): Promise<ServiceResult> {
  const { data: oldRole } = await supabase.from('user_roles').select('roles(name)').eq('user_id', targetUserId).single()
  const oldRoleName = (oldRole as any)?.roles?.name ?? 'none'

  await supabase.from('user_roles').delete().eq('user_id', targetUserId)

  let newRoleName = 'none'
  if (roleId) {
    const { error } = await supabase.from('user_roles').insert({ user_id: targetUserId, role_id: roleId })
    if (error) return { ok: false, error: error.message }
    const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single()
    newRoleName = role?.name ?? roleId
  }

  await logAuthAction('UPDATE', targetUserId, changedByUserId, {
    action_type: 'role_change', old_role: oldRoleName, new_role: newRoleName, changed_by: changedByUserId
  })

  return { ok: true, message: 'Role updated' }
}

export async function revokeUser(
  targetUserId: string,
  actualUserId: string | null,
  effectiveUserId: string | null
): Promise<ServiceResult> {
  const { data: { user } } = await supabase.auth.admin.getUserById(targetUserId)

  const { error } = await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: '876600h' })
  if (error) return { ok: false, error: error.message }

  await logAuthAction('UPDATE', targetUserId, actualUserId, {
    email: user?.email, action_type: 'revoke', revoked_by: actualUserId
  })
  await log('auth', 'warning', `User access revoked: ${user?.email}`, { email: user?.email }, actualUserId, effectiveUserId !== actualUserId ? effectiveUserId : null)

  return { ok: true, message: 'User access revoked' }
}

export async function restoreUser(targetUserId: string, restoredByUserId: string | null): Promise<ServiceResult> {
  const { data: { user } } = await supabase.auth.admin.getUserById(targetUserId)

  const { error } = await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' })
  if (error) return { ok: false, error: error.message }

  await logAuthAction('RESTORE', targetUserId, restoredByUserId, {
    email: user?.email, action_type: 'restore_access', restored_by: restoredByUserId
  })
  await log('auth', 'info', `User access restored: ${user?.email}`, { email: user?.email, restored_by: restoredByUserId }, restoredByUserId)

  return { ok: true, message: 'User access restored' }
}

export async function sendPasswordReset(email: string, initiatedByUserId: string | null): Promise<ServiceResult> {
  const { data: link, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: AUTH_CONFIRM_URL }
  })
  if (error) return { ok: false, error: error.message }

  await logAuthAction('UPDATE', link.user.id, initiatedByUserId, {
    email, action_type: 'password_reset', initiated_by: initiatedByUserId
  })
  await log('email', 'success', `Password reset email sent to ${email}`, { to: email, type: 'password_reset' }, initiatedByUserId)

  return { ok: true, message: `Password reset sent to ${email}` }
}

export async function deleteUser(targetUserId: string, deletedByUserId: string | null): Promise<ServiceResult> {
  const { data: { user } } = await supabase.auth.admin.getUserById(targetUserId)

  const { error } = await supabase.auth.admin.deleteUser(targetUserId)
  if (error) return { ok: false, error: error.message }

  await logAuthAction('DELETE', targetUserId, deletedByUserId, {
    email: user?.email, action_type: 'delete_user', deleted_by: deletedByUserId
  })
  await log('auth', 'error', `User permanently deleted: ${user?.email}`, { email: user?.email, deleted_by: deletedByUserId }, deletedByUserId)

  return { ok: true, message: 'User deleted' }
}
