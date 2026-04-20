import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import * as changeLogService from '$lib/services/change-log.service'

export const load = async ({ cookies, url, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'audit_log', 'read')

  const page = parseInt(url.searchParams.get('page') ?? '0')
  const filterTable = url.searchParams.get('table') ?? ''
  const filterAction = url.searchParams.get('action') ?? ''
  const pageSize = 50

  const { entries, total, tables, actions } = await changeLogService.listWithFilters({
    page, pageSize, filterTable, filterAction
  })

  return { entries, total, page, pageSize, tables, actions, filterTable, filterAction }
}

export const actions = {
  restore: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'audit_log', 'manage')

    const data = await request.formData()
    const oldValues = JSON.parse(data.get('old_values') as string)

    const result = await changeLogService.restoreEntry(
      data.get('table_name') as string,
      data.get('record_id') as string,
      oldValues,
      userId
    )
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  }
}
