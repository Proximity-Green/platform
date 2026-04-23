import { createClient } from '@supabase/supabase-js'
import { error } from '@sveltejs/kit'
import { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/env'

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export { supabase }

// Returns a service_role supabase client that includes an x-user-id header
// on every request. The change_log trigger reads that header when auth.uid()
// is null (which is always, for service_role writes) and attributes the
// audit row to the acting user instead of logging "system".
//
// Usage in services that mutate domain tables:
//   const sb = sbForUser(userId)   // userId comes from the server action
//   await sb.from('persons').update({...}).eq('id', id)
//
// If userId is null (e.g. truly systemic writes like migrations/cron),
// returns the shared client and audit rows correctly show "system".
export function sbForUser(userId: string | null) {
  if (!userId) return supabase
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-user-id': userId } }
  })
}

// Set the current user ID in PostgreSQL session for audit triggers
export async function setUserContext(userId: string | null) {
  if (userId) {
    await supabase.rpc('set_user_context', { user_id: userId })
  }
}

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

// Gets the REAL user ID (not impersonated) - for audit logging
export async function getActualUserId(locals: any): Promise<string | null> {
  const session = await locals.getSession()
  return session?.user?.id ?? null
}

// Gets effective user ID (impersonated if active) - for permission checks
// Also sets PostgreSQL session variable for audit trigger attribution
export async function getUserIdFromRequest(locals: any, cookies: any): Promise<string | null> {
  // Always set the ACTUAL user context for audit (not impersonated)
  const actualId = await getActualUserId(locals)
  if (actualId) {
    await setUserContext(actualId)
  }

  // Check impersonation for permission checks
  const impersonating = cookies.get('impersonating')
  if (impersonating) {
    try {
      const { targetUserId } = JSON.parse(impersonating)
      return targetUserId
    } catch {}
  }

  return actualId
}
