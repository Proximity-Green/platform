import { supabase } from '$lib/services/permissions.service'

export type ServiceResult = { ok: true; message?: string } | { ok: false; error: string }

export type ListFilters = {
  page: number
  pageSize: number
  filterTable: string
  filterAction: string
}

export async function listWithFilters({ page, pageSize, filterTable, filterAction }: ListFilters) {
  let query = supabase
    .from('change_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)

  if (filterTable) query = query.eq('table_name', filterTable)
  if (filterAction) query = query.eq('action', filterAction)

  const { data: entries, count } = await query

  // Resolve user IDs to emails
  const userIds = [...new Set(entries?.map(e => e.changed_by).filter(Boolean) ?? [])]
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()
    authUsers?.forEach(u => { userMap[u.id] = u.email ?? u.id })
  }

  const enrichedEntries = entries?.map(e => ({
    ...e,
    changed_by_email: e.changed_by ? userMap[e.changed_by] ?? e.changed_by : 'system'
  })) ?? []

  const { data: tableNames } = await supabase.from('change_log').select('table_name').limit(1000)
  const { data: actionNames } = await supabase.from('change_log').select('action').limit(1000)

  const tables = [...new Set(tableNames?.map(t => t.table_name) ?? [])].sort()
  const actions = [...new Set(actionNames?.map(a => a.action) ?? [])].sort()

  return { entries: enrichedEntries, total: count ?? 0, tables, actions }
}

export async function restoreEntry(
  tableName: string,
  recordId: string,
  oldValues: Record<string, any>,
  restoredByUserId: string | null
): Promise<ServiceResult> {
  const { id, created_at, ...restoreData } = oldValues

  const { data: current } = await supabase.from(tableName).select('*').eq('id', recordId).single()

  const { error } = await supabase.from(tableName).update(restoreData).eq('id', recordId)
  if (error) return { ok: false, error: error.message }

  await supabase.from('change_log').insert({
    table_name: tableName,
    record_id: recordId,
    action: 'RESTORE',
    changed_by: restoredByUserId,
    old_values: current,
    new_values: oldValues
  })

  return { ok: true, message: `Restored ${tableName} record` }
}
