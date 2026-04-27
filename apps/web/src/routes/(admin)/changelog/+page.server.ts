import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import * as changeLogService from '$lib/services/change-log.service'
import { logFail } from '$lib/services/action-log.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'audit_log', 'read')
  return await changeLogService.listAll()
}

export const actions = {
  restore: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'audit_log', 'manage')

    const data = await request.formData()
    const tableName = data.get('table_name') as string
    const recordId = data.get('record_id') as string
    const oldValues = JSON.parse(data.get('old_values') as string)

    const result = await changeLogService.restoreEntry(tableName, recordId, oldValues, userId)
    if (!result.ok) return await logFail(userId, 'changelog.restore', result.error, { table: tableName, record_id: recordId })
    return { success: true, message: result.message }
  }
}
