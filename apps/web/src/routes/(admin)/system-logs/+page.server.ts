import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import * as systemLogsService from '$lib/services/system-logs.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'system_logs', 'read')
  return await systemLogsService.listAll()
}
