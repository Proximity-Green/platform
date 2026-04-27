import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase, sbForUser } from '$lib/services/permissions.service'
import { logFail } from '$lib/services/action-log.service'

const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'wont_fix'])

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'reported_errors', 'read')

  // Fetch all reports + enrich with reporter / resolver email. Service-role
  // client used here so RLS doesn't filter the list down to the current
  // admin's own reports — gating is handled by requirePermission above.
  const { data: rows } = await supabase
    .from('reported_errors')
    .select('*')
    .order('reported_at', { ascending: false })
    .limit(2000)

  const ids = new Set<string>()
  for (const r of rows ?? []) {
    if ((r as any).reported_by) ids.add((r as any).reported_by)
    if ((r as any).resolved_by) ids.add((r as any).resolved_by)
  }
  const emailMap: Record<string, string> = {}
  if (ids.size > 0) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    users?.forEach(u => { emailMap[u.id] = u.email ?? u.id })
  }

  const reports = (rows ?? []).map((r: any) => ({
    ...r,
    reported_by_email: r.reported_by ? emailMap[r.reported_by] ?? r.reported_by : null,
    resolved_by_email: r.resolved_by ? emailMap[r.resolved_by] ?? r.resolved_by : null
  }))

  return { reports }
}

export const actions = {
  // Update one report's status. resolution_note is optional but encouraged
  // for resolved/wont_fix transitions.
  setStatus: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'reported_errors', 'manage')

    const data = await request.formData()
    const id = (data.get('id') as string) ?? ''
    const status = (data.get('status') as string) ?? ''
    const note = (data.get('resolution_note') as string) ?? ''
    if (!id) return fail(400, { error: 'Missing id' })
    if (!VALID_STATUSES.has(status)) return fail(400, { error: 'Invalid status' })

    const patch: Record<string, unknown> = { status, resolution_note: note || null }
    if (status === 'resolved' || status === 'wont_fix') {
      patch.resolved_by = userId
      patch.resolved_at = new Date().toISOString()
    } else {
      // Re-opening or moving to in_progress clears the resolver fields so
      // they reflect the *latest* resolution, not a stale one.
      patch.resolved_by = null
      patch.resolved_at = null
    }

    const { error: upErr } = await sbForUser(userId)
      .from('reported_errors')
      .update(patch)
      .eq('id', id)
    if (upErr) return await logFail(userId, 'reported-errors.setStatus', upErr, { id, status })

    return { success: true, message: `Status set to ${status}` }
  },

  remove: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'reported_errors', 'manage')

    const data = await request.formData()
    const id = (data.get('id') as string) ?? ''
    if (!id) return fail(400, { error: 'Missing id' })

    const { error: delErr } = await sbForUser(userId).from('reported_errors').delete().eq('id', id)
    if (delErr) return await logFail(userId, 'reported-errors.remove', delErr, { id })

    return { success: true, message: 'Report deleted' }
  }
}
