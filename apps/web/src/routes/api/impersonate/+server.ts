import { createClient } from '@supabase/supabase-js'
import { json } from '@sveltejs/kit'

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export const POST = async ({ request, cookies }) => {
  const { action, adminUserId, targetUserId, reason } = await request.json()

  if (action === 'start') {
    // Check admin has role
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', adminUserId)
      .single()

    const roleName = (adminRole as any)?.roles?.name
    if (!['super_admin', 'admin'].includes(roleName)) {
      return json({ error: 'Only admins can impersonate users' }, { status: 403 })
    }

    // Check if target user requires permission
    const { data: person } = await supabase
      .from('persons')
      .select('requires_impersonation_permission')
      .eq('user_id', targetUserId)
      .single()

    if (person?.requires_impersonation_permission) {
      const { data: permission } = await supabase
        .from('impersonation_permissions')
        .select('id')
        .eq('person_id', targetUserId)
        .is('revoked_at', null)
        .single()

      if (!permission) {
        return json({ error: 'This user requires explicit impersonation permission' }, { status: 403 })
      }
    }

    // Get target user details
    const { data: { user: targetUser } } = await supabase.auth.admin.getUserById(targetUserId)

    // Create impersonation session
    const { data: session, error } = await supabase
      .from('impersonation_sessions')
      .insert({
        admin_user_id: adminUserId,
        target_user_id: targetUserId,
        reason: reason || 'Admin impersonation'
      })
      .select()
      .single()

    if (error) return json({ error: error.message }, { status: 400 })

    // Get target user's role
    const { data: targetRole } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', targetUserId)
      .single()

    const targetRoleName = (targetRole as any)?.roles?.name ?? 'no role'

    // Set impersonation cookie
    cookies.set('impersonating', JSON.stringify({
      sessionId: session.id,
      adminUserId,
      targetUserId,
      targetEmail: targetUser?.email,
      targetName: targetUser?.user_metadata?.full_name || targetUser?.email,
      targetRole: targetRoleName
    }), { path: '/', httpOnly: false, secure: true, sameSite: 'lax', maxAge: 3600 })

    return json({ success: true, session })
  }

  if (action === 'stop') {
    const impersonating = cookies.get('impersonating')
    if (impersonating) {
      const { sessionId } = JSON.parse(impersonating)
      await supabase
        .from('impersonation_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
    }
    cookies.delete('impersonating', { path: '/' })
    return json({ success: true })
  }

  return json({ error: 'Invalid action' }, { status: 400 })
}
