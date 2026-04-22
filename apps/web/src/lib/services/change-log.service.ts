import { supabase } from '$lib/services/permissions.service'

export type ServiceResult = { ok: true; message?: string } | { ok: false; error: string }

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) }
    )
  })
}

export async function listAll() {
  const [changeRes, bulkRes] = await Promise.allSettled([
    // No timeout on change_log — it's the core log and can be large. The
    // bulk_actions query has a shorter timeout because it's supplementary.
    supabase
      .from('change_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10000),
    withTimeout(
      supabase
        .from('bulk_actions')
        .select('*')
        .order('performed_at', { ascending: false })
        .limit(500),
      4000,
      'bulk_actions'
    )
  ])

  const entries = changeRes.status === 'fulfilled' ? (changeRes.value.data ?? []) : []
  if (changeRes.status === 'rejected') console.warn('[change-log] change_log query failed', changeRes.reason)
  else if (changeRes.value.error) console.warn('[change-log] change_log returned error', changeRes.value.error)
  console.log(`[change-log] loaded ${entries.length} change_log rows`)

  const bulkRows = bulkRes.status === 'fulfilled' ? (bulkRes.value.data ?? []) : []
  if (bulkRes.status === 'rejected') console.warn('[change-log] bulk_actions query failed (migration 034 applied?)', bulkRes.reason)
  else if (bulkRes.value.error) console.warn('[change-log] bulk_actions returned error', bulkRes.value.error)

  const userIds = [
    ...new Set([
      ...(entries?.map(e => e.changed_by).filter(Boolean) ?? []),
      ...(bulkRows?.flatMap(b => [b.performed_by, b.undone_by].filter(Boolean)) ?? [])
    ])
  ]
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    authUsers?.forEach(u => { userMap[u.id] = u.email ?? u.id })
  }

  const enriched = entries?.map(e => ({
    ...e,
    changed_by_email: e.changed_by ? userMap[e.changed_by] ?? e.changed_by : 'system',
    record_label: labelFor(e)
  })) ?? []

  const bulkActions = (bulkRows ?? []).map(b => ({
    ...b,
    performed_by_email: b.performed_by ? userMap[b.performed_by] ?? b.performed_by : 'system',
    undone_by_email: b.undone_by ? userMap[b.undone_by] ?? b.undone_by : null
  }))

  return { entries: enriched, bulkActions }
}

function labelFor(entry: any): string {
  const vals = entry.new_values || entry.old_values
  if (!vals) return entry.record_id?.slice(0, 8) ?? '—'
  if (vals.name) return vals.name
  if (vals.first_name || vals.last_name) return `${vals.first_name ?? ''} ${vals.last_name ?? ''}`.trim()
  if (vals.email) return vals.email
  return entry.record_id?.slice(0, 8) ?? '—'
}

// NOTE — multi-step audit-aware writes live in Postgres, not here.
// `restore_record` is a SECURITY DEFINER RPC defined in migration 011. It
// runs the snapshot + UPDATE + RESTORE-row insert inside a single
// transaction, with a session-local flag that tells the audit trigger to
// skip auto-logging the UPDATE — otherwise we'd get RESTORE + UPDATE rows
// for one user action. See `packages/database/migrations/011_restore_rpc.sql`.
//
// Rule of thumb: any time multiple writes need to be atomic OR we need to
// suppress/control a trigger, do it in a Postgres function and call .rpc()
// from here. Don't try to coordinate it from the JS client (each query is
// its own transaction; SET LOCAL won't carry between calls).
export async function restoreEntry(
  tableName: string,
  recordId: string,
  oldValues: Record<string, any>,
  restoredByUserId: string | null
): Promise<ServiceResult> {
  const { error } = await supabase.rpc('restore_record', {
    p_table_name: tableName,
    p_record_id: recordId,
    p_new_values: oldValues,
    p_changed_by: restoredByUserId
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: `Restored ${tableName} record` }
}
