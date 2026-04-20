import { supabase } from '$lib/services/permissions.service'

export type ServiceResult = { ok: true; message?: string } | { ok: false; error: string }

export async function listRolesWithCounts() {
  const { data: roles } = await supabase.from('roles').select('*').order('name')
  const { data: permissions } = await supabase.from('permissions').select('*, roles(name)')
  const { data: userRoles } = await supabase.from('user_roles').select('role_id')

  const roleCounts: Record<string, number> = {}
  userRoles?.forEach((ur: any) => {
    roleCounts[ur.role_id] = (roleCounts[ur.role_id] || 0) + 1
  })

  return { roles: roles ?? [], permissions: permissions ?? [], roleCounts }
}

export async function createRole(name: string, description: string): Promise<ServiceResult> {
  const { error } = await supabase.from('roles').insert({ name, description })
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Role created' }
}

export async function deleteRole(id: string): Promise<ServiceResult> {
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Role deleted' }
}

export async function addPermission(roleId: string, resource: string, action: string): Promise<ServiceResult> {
  const { error } = await supabase.from('permissions').insert({ role_id: roleId, resource, action })
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Permission added' }
}

export async function removePermission(id: string): Promise<ServiceResult> {
  const { error } = await supabase.from('permissions').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Permission removed' }
}
