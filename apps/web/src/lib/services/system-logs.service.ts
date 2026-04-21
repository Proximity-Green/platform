import { supabase } from '$lib/services/permissions.service'

export async function listAll() {
  const { data: entries } = await supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000)

  const userIds = [...new Set(entries?.map(e => e.created_by).filter(Boolean) ?? [])]
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    users?.forEach(u => { userMap[u.id] = u.email ?? u.id })
  }

  const enriched = entries?.map(e => ({
    ...e,
    created_by_email: e.created_by ? userMap[e.created_by] ?? 'unknown' : 'system'
  })) ?? []

  const counts = { total: enriched.length, email: 0, auth: 0, system: 0, warning: 0, error: 0 }
  enriched.forEach(e => {
    if (e.category === 'email') counts.email++
    if (e.category === 'auth') counts.auth++
    if (e.category === 'system') counts.system++
    if (e.level === 'warning') counts.warning++
    if (e.level === 'error') counts.error++
  })

  return { entries: enriched, counts }
}
