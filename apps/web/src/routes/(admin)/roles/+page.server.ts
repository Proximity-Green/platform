import { fail } from '@sveltejs/kit'
import { supabase, requirePermission, getUserIdFromRequest } from '$lib/server/permissions'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'roles', 'read')

  const { data: roles } = await supabase.from('roles').select('*').order('name')
  const { data: permissions } = await supabase.from('permissions').select('*, roles(name)')
  const { data: userRoles } = await supabase.from('user_roles').select('role_id')

  const roleCounts: Record<string, number> = {}
  userRoles?.forEach((ur: any) => {
    roleCounts[ur.role_id] = (roleCounts[ur.role_id] || 0) + 1
  })

  return { roles: roles ?? [], permissions: permissions ?? [], roleCounts }
}

export const actions = {
  createRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const { error } = await supabase.from('roles').insert({
      name: data.get('name'),
      description: data.get('description')
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Role created' }
  },

  deleteRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const { error } = await supabase.from('roles').delete().eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Role deleted' }
  },

  addPermission: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const { error } = await supabase.from('permissions').insert({
      role_id: data.get('role_id'),
      resource: data.get('resource'),
      action: data.get('action')
    })
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Permission added' }
  },

  removePermission: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'roles', 'manage')

    const data = await request.formData()
    const { error } = await supabase.from('permissions').delete().eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Permission removed' }
  }
}
