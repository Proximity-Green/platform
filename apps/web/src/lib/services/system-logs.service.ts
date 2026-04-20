import { supabase } from '$lib/services/permissions.service'

export type ListFilters = {
  page: number
  pageSize: number
  filterCategory: string
  filterLevel: string
}

export type Counts = {
  total: number
  email: number
  auth: number
  system: number
  error: number
  warning: number
}

export async function listWithFilters({ page, pageSize, filterCategory, filterLevel }: ListFilters) {
  let query = supabase
    .from('system_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)

  if (filterCategory) query = query.eq('category', filterCategory)
  if (filterLevel) query = query.eq('level', filterLevel)

  const { data: entries, count } = await query

  const userIds = [...new Set(entries?.map(e => e.created_by).filter(Boolean) ?? [])]
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: { users } } = await supabase.auth.admin.listUsers()
    users?.forEach(u => { userMap[u.id] = u.email ?? u.id })
  }

  const enriched = entries?.map(e => ({
    ...e,
    created_by_email: e.created_by ? userMap[e.created_by] ?? 'unknown' : 'system'
  })) ?? []

  const { data: stats } = await supabase.from('system_logs').select('category, level')
  const counts: Counts = { total: stats?.length ?? 0, email: 0, auth: 0, system: 0, error: 0, warning: 0 }
  stats?.forEach(s => {
    if (s.category === 'email') counts.email++
    if (s.category === 'auth') counts.auth++
    if (s.category === 'system') counts.system++
    if (s.level === 'error') counts.error++
    if (s.level === 'warning') counts.warning++
  })

  return { entries: enriched, total: count ?? 0, counts }
}
