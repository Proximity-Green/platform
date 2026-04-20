import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import * as systemLogsService from '$lib/services/system-logs.service'

export const load = async ({ cookies, url, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'system_logs', 'read')

  const filterCategory = url.searchParams.get('category') ?? ''
  const filterLevel = url.searchParams.get('level') ?? ''
  const page = parseInt(url.searchParams.get('page') ?? '0')
  const pageSize = 50

  const { entries, total, counts } = await systemLogsService.listWithFilters({
    page, pageSize, filterCategory, filterLevel
  })

  return { entries, total, page, pageSize, filterCategory, filterLevel, counts }
}
