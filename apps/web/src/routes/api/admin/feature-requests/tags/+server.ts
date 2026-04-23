import { json } from '@sveltejs/kit'
import { getUserIdFromRequest, requirePermission } from '$lib/services/permissions.service'
import * as featureRequestsService from '$lib/services/feature-requests.service'

export const GET = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'feature_requests', 'read')
  const tags = await featureRequestsService.listTags()
  return json({ tags })
}
