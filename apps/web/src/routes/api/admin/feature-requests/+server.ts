import { json, error } from '@sveltejs/kit'
import { getUserIdFromRequest, requirePermission } from '$lib/services/permissions.service'
import * as featureRequestsService from '$lib/services/feature-requests.service'

export const POST = async ({ request, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'feature_requests', 'create')

  const body = (await request.json().catch(() => null)) as {
    title?: string
    summary?: string | null
    transcript?: featureRequestsService.ChatMessage[]
    kind?: featureRequestsService.FeatureRequestKind
    tag_ids?: string[]
    new_tag_names?: string[]
  } | null

  const title = body?.title?.trim() ?? ''
  if (!title) throw error(400, 'Title is required')

  const result = await featureRequestsService.create({
    title,
    kind: body?.kind ?? 'feature_request',
    summary: body?.summary ?? null,
    transcript: body?.transcript ?? [],
    created_by: userId ?? null
  })
  if (!result.ok) throw error(400, result.error)

  const createdId = result.data!.id

  const tagIds = Array.isArray(body?.tag_ids) ? body!.tag_ids.filter(Boolean) : []
  const newTagNames = Array.isArray(body?.new_tag_names)
    ? body!.new_tag_names.map((n) => n.trim()).filter(Boolean)
    : []

  if (tagIds.length || newTagNames.length) {
    const fresh: string[] = []
    for (const name of newTagNames) {
      const made = await featureRequestsService.createTag(name, userId ?? null)
      if (made.ok) fresh.push(made.data!.id)
    }
    const all = [...new Set([...tagIds, ...fresh])]
    if (all.length) await featureRequestsService.setTags(createdId, all, userId ?? null)
  }

  return json({
    ok: true,
    id: createdId,
    href: `/feature-requests/${createdId}`
  })
}
