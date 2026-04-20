import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')
  return {}
}
