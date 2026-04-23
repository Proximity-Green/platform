import { error, fail, redirect } from '@sveltejs/kit'
import { getUserIdFromRequest, requirePermission } from '$lib/services/permissions.service'
import * as featureRequestsService from '$lib/services/feature-requests.service'

export const load = async ({ params, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'feature_requests', 'read')

  const [request, tags] = await Promise.all([
    featureRequestsService.getById(params.id, userId ?? null),
    featureRequestsService.listTags()
  ])
  if (!request) throw error(404, 'Feature request not found')

  return { request, allTags: tags, viewerId: userId ?? null }
}

export const actions = {
  updateDetails: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'feature_requests', 'update')
    const data = await request.formData()
    const result = await featureRequestsService.updateDetails(params.id!, {
      title: (data.get('title') as string) ?? undefined,
      summary: (data.get('summary') as string) ?? null
    }, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Feature request updated' }
  },

  updateStatus: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'feature_requests', 'update')
    const data = await request.formData()
    const status = data.get('status') as featureRequestsService.FeatureRequestStatus
    const result = await featureRequestsService.updateStatus(params.id!, status, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: `Status set to ${status.replace('_', ' ')}` }
  },

  updateKind: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'feature_requests', 'update')
    const data = await request.formData()
    const kind = data.get('kind') as featureRequestsService.FeatureRequestKind
    const result = await featureRequestsService.updateKind(params.id!, kind, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: kind === 'feature_request' ? 'Promoted to feature request' : 'Marked as note' }
  },

  addTag: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'feature_requests', 'update')
    const data = await request.formData()
    const explicitId = (data.get('tag_id') as string) ?? ''
    const name = ((data.get('name') as string) ?? '').trim()

    let tagId = explicitId
    let label = ''
    if (!tagId && name) {
      const existing = await featureRequestsService.findTagByName(name)
      if (existing) {
        tagId = existing.id
        label = existing.name
      } else {
        const created = await featureRequestsService.createTag(name, userId ?? null)
        if (!created.ok) return fail(400, { error: created.error })
        tagId = created.data!.id
        label = created.data!.name
      }
    }
    if (!tagId) return fail(400, { error: 'Tag name or id is required' })

    const result = await featureRequestsService.applyTag(params.id!, tagId, userId ?? null)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: label ? `Tag "${label}" added` : 'Tag added' }
  },

  removeTag: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'feature_requests', 'update')
    const data = await request.formData()
    const tagId = (data.get('tag_id') as string) ?? ''
    if (!tagId) return fail(400, { error: 'tag_id required' })
    const result = await featureRequestsService.removeTagAssignment(params.id!, tagId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Tag removed' }
  },

  toggleVote: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (!userId) return fail(401, { error: 'Sign-in required to vote' })
    await requirePermission(userId, 'feature_requests', 'read')
    const data = await request.formData()
    const hasVoted = data.get('has_voted') === 'true'
    const result = hasVoted
      ? await featureRequestsService.removeVote(params.id!, userId)
      : await featureRequestsService.addVote(params.id!, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: hasVoted ? 'Vote removed' : 'Vote added' }
  },

  delete: async ({ params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'feature_requests', 'delete')
    const result = await featureRequestsService.remove(params.id!, userId)
    if (!result.ok) return fail(400, { error: result.error })
    throw redirect(303, '/feature-requests')
  }
}
