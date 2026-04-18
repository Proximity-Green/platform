import { createClient } from '@supabase/supabase-js'
import { fail } from '@sveltejs/kit'

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export const load = async () => {
  const { data: { users }, error } = await supabase.auth.admin.listUsers()
  const { data: roles } = await supabase.from('roles').select('*')
  const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id, roles(name)')

  return {
    users: users ?? [],
    roles: roles ?? [],
    userRoles: userRoles ?? []
  }
}

export const actions = {
  invite: async ({ request }) => {
    const data = await request.formData()
    const email = data.get('email') as string

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://poc.proximity.green/auth/confirm'
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: `Invitation sent to ${email}` }
  },

  resend: async ({ request }) => {
    const data = await request.formData()
    const email = data.get('email') as string

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://poc.proximity.green/auth/confirm'
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: `Invitation resent to ${email}` }
  },

  setRole: async ({ request }) => {
    const data = await request.formData()
    const userId = data.get('user_id') as string
    const roleId = data.get('role_id') as string

    // Remove existing roles
    await supabase.from('user_roles').delete().eq('user_id', userId)

    // Assign new role
    if (roleId) {
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role_id: roleId })
      if (error) return fail(400, { error: error.message })
    }
    return { success: true, message: 'Role updated' }
  },

  revoke: async ({ request }) => {
    const data = await request.formData()
    const userId = data.get('user_id') as string

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: '876600h'
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'User access revoked' }
  },

  restore: async ({ request }) => {
    const data = await request.formData()
    const userId = data.get('user_id') as string

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: 'none'
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'User access restored' }
  },

  resetPassword: async ({ request }) => {
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

  delete: async ({ request }) => {
    const data = await request.formData()
    const userId = data.get('user_id') as string

    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'User deleted' }
  }
}
