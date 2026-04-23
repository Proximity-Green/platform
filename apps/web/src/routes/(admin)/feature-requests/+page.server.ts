import { getUserIdFromRequest, requirePermission } from '$lib/services/permissions.service'
import * as featureRequestsService from '$lib/services/feature-requests.service'

export const load = async ({ cookies, locals, url }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'feature_requests', 'read')
  const [requests, allTags] = await Promise.all([
    featureRequestsService.listAll(userId ?? null),
    featureRequestsService.listTags()
  ])
  const kindParam = url.searchParams.get('kind')
  const initialFilter: 'all' | featureRequestsService.FeatureRequestKind =
    kindParam === 'feature_request' || kindParam === 'note' ? kindParam : 'all'
  return { requests, allTags, viewerId: userId ?? null, initialFilter }
}
