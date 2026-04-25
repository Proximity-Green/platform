import { error } from '@sveltejs/kit'
import { getUserIdFromRequest, requirePermission, supabase } from '$lib/services/permissions.service'

const STATUSES = ['new', 'triaged', 'planned', 'in_progress', 'done'] as const
type Status = (typeof STATUSES)[number]

export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'feature_requests', 'update')

  const body = (await request.json().catch(() => null)) as {
    status?: string
    fr_ids?: string[]
  } | null

  const status = body?.status as Status | undefined
  if (!status || !STATUSES.includes(status)) throw error(400, 'valid status required')
  if (!body?.fr_ids?.length) throw error(400, 'fr_ids is required')

  const { fr_ids } = body
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

        emit({ phase: 'guarding', protected: 0, actionable: ids.length })
        if (ids.length === 0) {
          emit({
            phase: 'done',
            applied: 0,
            skipped: { missing: fr_ids.length },
            ms: Date.now() - t0,
            bulk_action_id: null,
            message: 'No matching feature requests.'
          })
          controller.close()
          return
        }

        emit({ phase: 'applying', role: status, targets: ids.length })

        const { data: bulkActionId, error: rpcErr } = await supabase.rpc('bulk_set_fr_status_apply', {
          p_fr_ids: ids,
          p_status: status,
          p_performed_by: userId
        })
        if (rpcErr) throw new Error(rpcErr.message)

        emit({
          phase: 'done',
          bulk_action_id: bulkActionId,
          applied: ids.length,
          role: status,
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
