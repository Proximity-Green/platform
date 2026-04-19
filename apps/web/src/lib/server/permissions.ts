import { createClient } from '@supabase/supabase-js'
import { error } from '@sveltejs/kit'

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export { supabase }

export async function getUserPermissions(userId: string) {
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role_id, roles(name)')
    .eq('user_id', userId)
    .single()

  if (!userRole) return { role: null, permissions: [] }

  const roleName = (userRole as any).roles?.name

  if (roleName === 'super_admin') {
    return { role: roleName, permissions: 'all' as const }
  }

  const { data: permissions } = await supabase
    .from('permissions')
    .select('resource, action')
    .eq('role_id', userRole.role_id)

  return {
    role: roleName,
    permissions: permissions ?? []
  }
}

export function hasPermission(
  perms: { role: string | null; permissions: 'all' | Array<{ resource: string; action: string }> },
  resource: string,
  action: string
): boolean {
  if (!perms.role) return false
  if (perms.permissions === 'all') return true
  return perms.permissions.some(
    p => p.resource === resource && (p.action === action || p.action === 'manage')
  )
}

export async function requirePermission(userId: string, resource: string, action: string) {
  const perms = await getUserPermissions(userId)
  if (!hasPermission(perms, resource, action)) {
    throw error(403, `You do not have permission to ${action} ${resource}`)
  }
  return perms
}

export async function logAuthAction(
  action: string,
  targetUserId: string,
  changedBy: string | null,
  details: Record<string, any>
) {
  await supabase.from('change_log').insert({
    table_name: 'auth.users',
    record_id: targetUserId,
    action,
    changed_by: changedBy,
    new_values: details
  })
}

export async function getUserIdFromRequest(cookies: any): Promise<string | null> {
  // Check impersonation first
  const impersonating = cookies.get('impersonating')
  if (impersonating) {
    try {
      const { targetUserId } = JSON.parse(impersonating)
      return targetUserId
    } catch {}
  }

  // Get all auth sessions and find the current one
  // For server-side, we read the sb-* cookies
  const allCookies = cookies.getAll()
  const accessToken = allCookies.find((c: any) => c.name.includes('auth-token'))?.value
  if (!accessToken) return null

  try {
    const parsed = JSON.parse(accessToken)
    const token = Array.isArray(parsed) ? parsed[0] : parsed
    const { data: { user } } = await supabase.auth.getUser(token)
    return user?.id ?? null
  } catch {
    return null
  }
}
