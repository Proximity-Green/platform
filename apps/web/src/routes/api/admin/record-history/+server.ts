import { error, json } from '@sveltejs/kit'
import {
  supabase,
  requirePermission,
  getUserIdFromRequest
} from '$lib/services/permissions.service'

/**
 * Lazy fetch of change_log entries for a single record. Powers the
 * <RecordHistory /> opt-in expander shown below detail pages — keeping
 * this off the default load is the whole point (a typical detail page
 * shouldn't pay for change_log work it never displays).
 *
 * GET /api/admin/record-history?table=<name>&id=<uuid>&limit=200
 *   &count_only=1  → returns just { count }, skips entry fetch + auth
 *                     enrichment. Used by the closed-panel badge so we
 *                     can show a fresh count without paying for body.
 */
export async function GET({ url, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'audit_log', 'read')

  const table = url.searchParams.get('table')
  const id = url.searchParams.get('id')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '200'), 1000)
  const countOnly = url.searchParams.get('count_only') === '1'
  if (!table || !id) throw error(400, 'table and id are required')

  if (countOnly) {
    const { count, error: cErr } = await supabase
      .from('change_log')
      .select('id', { count: 'exact', head: true })
      .eq('table_name', table)
      .eq('record_id', id)
    if (cErr) throw error(500, cErr.message)
    return json({ count: count ?? 0 })
  }

  const { data, error: dbErr } = await supabase
    .from('change_log')
    .select('*')
    .eq('table_name', table)
    .eq('record_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dbErr) throw error(500, dbErr.message)

  const userIds = [...new Set((data ?? []).map(e => e.changed_by).filter(Boolean) as string[])]
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    users?.forEach(u => { userMap[u.id] = u.email ?? u.id })
  }

  const entries = (data ?? []).map(e => ({
    ...e,
    changed_by_email: e.changed_by ? userMap[e.changed_by] ?? e.changed_by : 'system'
  }))

  return json({ entries })
}
