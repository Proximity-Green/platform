import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'organisations', 'read')

  const { data: organisations } = await supabase
    .from('organisations')
    .select('id, wsm_id, name, slug, legal_name, short_name, industry, type, status, email, phone, website, billing_currency, started_at, created_at, updated_at')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  return { organisations: organisations ?? [] }
}
