import { error } from '@sveltejs/kit'
import { getUserIdFromRequest, requirePermission, supabase } from '$lib/services/permissions.service'

export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'feature_requests', 'update')

  const body = (await request.json().catch(() => null)) as {
    tag_ids?: string[]
    new_tag_names?: string[]
    fr_ids?: string[]
  } | null

  const fr_ids = body?.fr_ids ?? []
  if (!fr_ids.length) throw error(400, 'fr_ids is required')

  const incomingTagIds = body?.tag_ids ?? []
  const newTagNames = (body?.new_tag_names ?? []).map((n) => n.trim()).filter(Boolean)

  if (!incomingTagIds.length && !newTagNames.length) {
    throw error(400, 'tag_ids or new_tag_names is required')
  }

  const t0 = Date.now()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        emit({ phase: 'resolving', selected: fr_ids.length })

        const { data: rows, error: lookupErr } = await supabase
          .from('feature_requests')
          .select('id')
          .in('id', fr_ids)
          .is('deleted_at', null)
        if (lookupErr) throw new Error(lookupErr.message)
        const ids = (rows ?? []).map((r) => r.id as string)
        emit({ phase: 'resolved', linked: ids.length, skipped_no_user: fr_ids.length - ids.length })

        // Create any fresh tag names first — collect all resolved tag IDs.
        const allTagIds: string[] = [...incomingTagIds]
        for (const name of newTagNames) {
          const { data: created, error: tagErr } = await supabase
            .from('tags')
            .insert({ name, created_by: userId })
            .select('id')
            .single()
          if (tagErr) {
            // Name collision? Look up and use the existing id.
            const { data: existing } = await supabase
              .from('tags')
              .select('id')
              .ilike('name', name)
              .is('deleted_at', null)
              .maybeSingle()
            if (existing) allTagIds.push(existing.id as string)
          } else if (created) {
            allTagIds.push(created.id as string)
          }
        }
        const dedupedTagIds = Array.from(new Set(allTagIds))

        emit({ phase: 'guarding', protected: 0, actionable: ids.length * dedupedTagIds.length })
        if (ids.length === 0 || dedupedTagIds.length === 0) {
          emit({
            phase: 'done',
            applied: 0,
            skipped: { missing: fr_ids.length - ids.length },
            ms: Date.now() - t0,
            bulk_action_id: null,
            message: 'Nothing to apply.'
          })
          controller.close()
          return
        }

        emit({
          phase: 'applying',
          role: `${dedupedTagIds.length} tag${dedupedTagIds.length === 1 ? '' : 's'}`,
          targets: ids.length
        })

        const { data: bulkActionId, error: rpcErr } = await supabase.rpc('bulk_add_fr_tags_apply', {
          p_fr_ids: ids,
          p_tag_ids: dedupedTagIds,
          p_performed_by: userId
        })
        if (rpcErr) throw new Error(rpcErr.message)

        emit({
          phase: 'done',
          bulk_action_id: bulkActionId,
          applied: ids.length,
          role: `${dedupedTagIds.length} tag${dedupedTagIds.length === 1 ? '' : 's'}`,
          skipped: { missing: fr_ids.length - ids.length },
          ms: Date.now() - t0
        })
        controller.close()
      } catch (e: any) {
        emit({ phase: 'error', error: e?.message ?? String(e), ms: Date.now() - t0 })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  })
}
