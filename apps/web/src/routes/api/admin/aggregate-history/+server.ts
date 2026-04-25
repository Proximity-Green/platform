import { error, json } from '@sveltejs/kit'
import {
  supabase,
  requirePermission,
  getUserIdFromRequest
} from '$lib/services/permissions.service'

/**
 * Consolidated change_log feed for a "root" entity (organisation, person,
 * item, …) — walks a fan-out map, gathers ids of every related row, and
 * pulls the matching change_log rows into one chronological feed. Each
 * entry carries its source table so the UI can label it.
 *
 * GET /api/admin/aggregate-history?root=<table>&id=<uuid>&limit=500
 *   &count_only=1  → returns just { count }
 *
 * Adding a new related table is a one-line change in the FANOUT map below
 * (no UI / endpoint changes needed). Anything missing from the map is
 * silently absent from the feed — keep it tight to actual ownership.
 */

type FanoutTable = { table: string; col: string }

// FANOUT[root] lists every other tier-1 table that points at it.
// `col` is the foreign-key column on the child table.
const FANOUT: Record<string, FanoutTable[]> = {
  organisations: [
    { table: 'subscription_lines',                col: 'organisation_id' },
    { table: 'subscription_option_groups',        col: 'organisation_id' },
    { table: 'licenses',                          col: 'organisation_id' },
    { table: 'contracts',                         col: 'organisation_id' },
    { table: 'invoices',                          col: 'organisation_id' },
    { table: 'persons',                           col: 'organisation_id' },
    { table: 'wallets',                           col: 'organisation_id' },
    { table: 'organisation_accounting_customers', col: 'organisation_id' }
  ]
}

export async function GET({ url, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'audit_log', 'read')

  const root = url.searchParams.get('root')
  const id = url.searchParams.get('id')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '500'), 2000)
  const countOnly = url.searchParams.get('count_only') === '1'
  if (!root || !id) throw error(400, 'root and id are required')

  const fanout = FANOUT[root]
  if (!fanout) throw error(400, `No fan-out defined for root '${root}'`)

  // Collect every id that "belongs to" the root, in parallel.
  const childIdLists = await Promise.all(
    fanout.map(async ({ table, col }) => {
      const { data, error: e } = await supabase
        .from(table)
        .select('id')
        .eq(col, id)
      if (e) {
        console.warn(`[aggregate-history] ${table}.${col} lookup failed`, e.message)
        return [] as string[]
      }
      return (data ?? []).map(r => r.id as string)
    })
  )
  const allIds = [id, ...childIdLists.flat()]

  if (countOnly) {
    const { count, error: cErr } = await supabase
      .from('change_log')
      .select('id', { count: 'exact', head: true })
      .in('record_id', allIds)
    if (cErr) throw error(500, cErr.message)
    return json({ count: count ?? 0 })
  }

  const { data, error: dbErr } = await supabase
    .from('change_log')
    .select('*')
    .in('record_id', allIds)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (dbErr) throw error(500, dbErr.message)

  // Enrich users in one batch.
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

  return json({ entries, fanout: fanout.map(f => f.table) })
}
