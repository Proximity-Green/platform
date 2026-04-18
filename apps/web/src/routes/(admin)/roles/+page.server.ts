import { createClient } from '@supabase/supabase-js'
import { fail } from '@sveltejs/kit'

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export const load = async () => {
  const { data: roles } = await supabase.from('roles').select('*').order('name')
  const { data: permissions } = await supabase.from('permissions').select('*, roles(name)')
  const { data: userRoles } = await supabase.from('user_roles').select('role_id')

  // Count users per role
  const roleCounts: Record<string, number> = {}
  userRoles?.forEach((ur: any) => {
    roleCounts[ur.role_id] = (roleCounts[ur.role_id] || 0) + 1
  })

  return {
    roles: roles ?? [],
    permissions: permissions ?? [],
    roleCounts
  }
}

export const actions = {
  createRole: async ({ request }) => {
    const data = await request.formData()
    const { error } = await supabase.from('roles').insert({
      name: data.get('name'),
      description: data.get('description')
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Role created' }
  },

  updateRole: async ({ request }) => {
    const data = await request.formData()
    const { error } = await supabase.from('roles').update({
      description: data.get('description')
    }).eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Role updated' }
  },

  deleteRole: async ({ request }) => {
    const data = await request.formData()
    const { error } = await supabase.from('roles').delete().eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Role deleted' }
  },

  addPermission: async ({ request }) => {
    const data = await request.formData()
    const { error } = await supabase.from('permissions').insert({
      role_id: data.get('role_id'),
      resource: data.get('resource'),
      action: data.get('action')
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Permission added' }
  },

  removePermission: async ({ request }) => {
    const data = await request.formData()
    const { error } = await supabase.from('permissions').delete().eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Permission removed' }
  }
}
