import { supabase, sbForUser } from '$lib/services/permissions.service'

export type ServiceResult = { ok: true; message?: string } | { ok: false; error: string }

export async function listRolesWithCounts() {
  const { data: roles } = await supabase.from('roles').select('*').order('name')
  const { data: permissions } = await supabase
    .from('permissions')
    .select('*, roles(name)')
    .order('resource')
    .order('action')
  const { data: userRoles } = await supabase.from('user_roles').select('role_id, user_id')
  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 })

  const userById: Record<string, { id: string; email: string; name: string | null }> = {}
  authList?.users?.forEach(u => {
    userById[u.id] = {
      id: u.id,
      email: u.email ?? '',
      name: (u.user_metadata as any)?.full_name ?? null
    }
  })

  const roleCounts: Record<string, number> = {}
  const usersByRole: Record<string, { id: string; email: string; name: string | null }[]> = {}
  userRoles?.forEach((ur: any) => {
    roleCounts[ur.role_id] = (roleCounts[ur.role_id] || 0) + 1
    const u = userById[ur.user_id]
    if (u) {
      if (!usersByRole[ur.role_id]) usersByRole[ur.role_id] = []
      usersByRole[ur.role_id].push(u)
    }
  })
  Object.values(usersByRole).forEach(list => list.sort((a, b) => a.email.localeCompare(b.email)))

  return { roles: roles ?? [], permissions: permissions ?? [], roleCounts, usersByRole }
}

export async function createRole(name: string, description: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('roles').insert({ name, description })
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Role created' }
}

export async function updateRole(id: string, name: string, description: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('roles').update({ name, description }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Role updated' }
}

export async function deleteRole(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('roles').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Role deleted' }
}

export async function addPermission(roleId: string, resource: string, action: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('permissions').insert({ role_id: roleId, resource, action })
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Permission added' }
}

export async function removePermission(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('permissions').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Permission removed' }
}

export async function detachUserFromRole(userId: string, roleId: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId)
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'User detached from role' }
}
