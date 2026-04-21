import { json } from '@sveltejs/kit'
import { getUserPermissions, supabase } from '$lib/services/permissions.service'

/**
 * Auth/session sanity probe. Hit /api/auth-debug in any browser and get a JSON
 * snapshot of the current state. Useful when login behaves weirdly — no DevTools needed.
 *
 * Returns:
 *   { session, cookies, user, role, permissions, approvedDomainMatch, userRoleRow }
 */
export const GET = async ({ locals, cookies, url }) => {
  const session = await locals.getSession()
  const cookieNames = cookies.getAll().map(c => c.name)

  const out: Record<string, any> = {
    url: url.toString(),
    hasSession: !!session,
    cookieNames,
    timestamp: new Date().toISOString()
  }

  if (!session) return json(out)

  out.user = {
    id: session.user.id,
    email: session.user.email,
    invited_at: session.user.invited_at,
    created_at: session.user.created_at
  }

  // Is the email domain whitelisted?
  const domain = session.user.email?.split('@')[1]
  if (domain) {
    const { data: ad } = await supabase
      .from('approved_domains')
      .select('id, domain')
      .eq('domain', domain)
      .maybeSingle()
    out.approvedDomainMatch = ad
  }

  // Role + permissions
  const perms = await getUserPermissions(session.user.id)
  out.role = perms.role
  out.permissions = perms.permissions

  // Raw user_roles row (for visibility)
  const { data: ur, error: urErr } = await supabase
    .from('user_roles')
    .select('user_id, role_id, roles(name)')
    .eq('user_id', session.user.id)
    .maybeSingle()
  out.userRoleRow = ur ?? null
  if (urErr) out.userRoleError = urErr.message

  return json(out)
}
