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
 *
 * Composite mode:
 *   pairs=licenses:<uuid>,subscription_lines:<uuid>
 *     → merges change_log entries for several (table, id) tuples into
 *       one timeline. Used where a logical record spans multiple rows
 *       (e.g. a licence + its paired subscription_line). Mutually
 *       exclusive with the single table/id form.
 */
export async function GET({ url, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'audit_log', 'read')

  const table = url.searchParams.get('table')
  const id = url.searchParams.get('id')
  const pairsRaw = url.searchParams.get('pairs')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '200'), 1000)
  const countOnly = url.searchParams.get('count_only') === '1'

  type Pair = { table: string; id: string }
  let pairs: Pair[] = []
  if (pairsRaw) {
    pairs = pairsRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const i = s.indexOf(':')
        if (i < 1 || i === s.length - 1) throw error(400, `bad pair "${s}" — expected <table>:<uuid>`)
        return { table: s.slice(0, i), id: s.slice(i + 1) }
      })
    if (pairs.length === 0) throw error(400, 'pairs is empty')
  } else {
    if (!table || !id) throw error(400, 'table and id (or pairs) are required')
    pairs = [{ table, id }]
  }

  if (countOnly) {
    const counts = await Promise.all(
      pairs.map(p =>
        supabase
          .from('change_log')
          .select('id', { count: 'exact', head: true })
          .eq('table_name', p.table)
          .eq('record_id', p.id)
      )
    )
    for (const r of counts) if (r.error) throw error(500, r.error.message)
    const total = counts.reduce((s, r) => s + (r.count ?? 0), 0)
    return json({ count: total })
  }

  const results = await Promise.all(
    pairs.map(p =>
      supabase
        .from('change_log')
        .select('*')
        .eq('table_name', p.table)
        .eq('record_id', p.id)
        .order('created_at', { ascending: false })
        .limit(limit)
    )
  )
  for (const r of results) if (r.error) throw error(500, r.error.message)
  const data = results
    .flatMap(r => r.data ?? [])
    .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit)

  const userIds = [...new Set(data.map(e => e.changed_by).filter(Boolean) as string[])]
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    users?.forEach(u => { userMap[u.id] = u.email ?? u.id })
  }

  const entries = data.map(e => ({
    ...e,
    changed_by_email: e.changed_by ? userMap[e.changed_by] ?? e.changed_by : 'system'
  }))

  return json({ entries })
}
