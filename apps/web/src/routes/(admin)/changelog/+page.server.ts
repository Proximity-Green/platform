import { fail } from '@sveltejs/kit'
import { supabase, requirePermission, getUserIdFromRequest } from '$lib/server/permissions'

export const load = async ({ cookies, url, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'audit_log', 'read')

  const page = parseInt(url.searchParams.get('page') ?? '0')
  const filterTable = url.searchParams.get('table') ?? ''
  const filterAction = url.searchParams.get('action') ?? ''
  const pageSize = 50

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

  // Attach email to each entry
  const enrichedEntries = entries?.map(e => ({
    ...e,
    changed_by_email: e.changed_by ? userMap[e.changed_by] ?? e.changed_by : 'system'
  })) ?? []

  // Get filter options
  const { data: tableNames } = await supabase.from('change_log').select('table_name').limit(1000)
  const { data: actionNames } = await supabase.from('change_log').select('action').limit(1000)

  const tables = [...new Set(tableNames?.map(t => t.table_name) ?? [])].sort()
  const actions = [...new Set(actionNames?.map(a => a.action) ?? [])].sort()

  return {
    entries: enrichedEntries,
    total: count ?? 0,
    page,
    pageSize,
    tables,
    actions,
    filterTable,
    filterAction
  }
}

export const actions = {
  restore: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'audit_log', 'manage')

    const data = await request.formData()
    const tableName = data.get('table_name') as string
    const recordId = data.get('record_id') as string
    const oldValuesJson = data.get('old_values') as string

    const oldValues = JSON.parse(oldValuesJson)
    const { id, created_at, ...restoreData } = oldValues

    // Get current values before restore
    const { data: current } = await supabase.from(tableName).select('*').eq('id', recordId).single()

    // Restore the record
    const { error } = await supabase.from(tableName).update(restoreData).eq('id', recordId)
    if (error) return fail(400, { error: error.message })

    // Log as RESTORE
    await supabase.from('change_log').insert({
      table_name: tableName,
      record_id: recordId,
      action: 'RESTORE',
      changed_by: userId,
      old_values: current,
      new_values: oldValues
    })

    return { success: true, message: `Restored ${tableName} record` }
  }
}
