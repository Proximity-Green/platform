import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import { getOccupancyReport } from '$lib/services/occupancy.service'

/**
 * Occupancy V0 — inventory lens (sold/unsold + forward forecast).
 * NOT live presence (see docs/OCCUPANCY.md "two lenses").
 *
 * Aggregation lives in occupancy.service.ts so the AI assistant can
 * call it directly with the same shape the page renders.
 */
export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'subscriptions', 'read')

  const report = await getOccupancyReport({ windowMonths: 6 })
  return { report }
}
