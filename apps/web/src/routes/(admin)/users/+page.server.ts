import { createClient } from '@supabase/supabase-js'
import { fail } from '@sveltejs/kit'

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export const load = async () => {
  // Get all auth users via admin API
  const { data: { users }, error } = await supabase.auth.admin.listUsers()

  // Get all roles
  const { data: roles } = await supabase.from('roles').select('*')

  // Get persons with their role info
  const { data: persons } = await supabase.from('persons').select('*')

  return {
    users: users ?? [],
    roles: roles ?? [],
    persons: persons ?? []
  }
}

export const actions = {
  invite: async ({ request }) => {
    const data = await request.formData()
    const email = data.get('email') as string

    const { error } = await supabase.auth.admin.inviteUserByEmail(email)
    if (error) return fail(400, { error: error.message })
    return { success: true, message: `Invitation sent to ${email}` }
  },

  revoke: async ({ request }) => {
    const data = await request.formData()
    const userId = data.get('user_id') as string

    // Ban the user (soft disable)
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: '876600h' // ~100 years
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

  delete: async ({ request }) => {
    const data = await request.formData()
    const userId = data.get('user_id') as string

    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'User deleted' }
  }
}
