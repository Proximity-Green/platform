import { error } from '@sveltejs/kit'
import {
  requirePermission,
  getUserIdFromRequest,
  supabase
} from '$lib/services/permissions.service'

/**
 * Testing bulk action: overwrite persons.first_name for every selected id.
 * Streams NDJSON phases (resolving → applying → done) and records an undo-able
 * bulk_actions row via bulk_set_first_name_apply RPC.
 *
 * POST /api/admin/bulk-set-first-name  { first_name: string, person_ids: string[] }
 */
export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'bulk_actions', 'set_first_name')

  const body = await request.json().catch(() => null) as {
    first_name?: string
    person_ids?: string[]
  } | null
  const firstName = body?.first_name?.trim()
  if (!firstName) throw error(400, 'first_name is required')
  if (!body?.person_ids?.length) throw error(400, 'person_ids is required')

  const { first_name: _fn, person_ids } = body
  const t0 = Date.now()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }
      try {
        emit({ phase: 'resolving', selected: person_ids.length })

        // Sanity check: only apply to persons that actually exist.
        const { data: rows, error: lookupErr } = await supabase
          .from('persons')
          .select('id')
          .in('id', person_ids)
        if (lookupErr) throw new Error(lookupErr.message)
        const ids = (rows ?? []).map(r => r.id as string)
        emit({ phase: 'resolved', linked: ids.length, skipped_no_user: person_ids.length - ids.length })

        emit({ phase: 'guarding', protected: 0, actionable: ids.length })
        if (ids.length === 0) {
          emit({
            phase: 'done',
            applied: 0,
            skipped: { missing: person_ids.length },
            ms: Date.now() - t0,
            bulk_action_id: null,
            message: 'No matching persons.'
          })
          controller.close()
          return
        }

        emit({ phase: 'applying', role: firstName, targets: ids.length })

        const { data: bulkActionId, error: rpcErr } = await supabase.rpc('bulk_set_first_name_apply', {
          p_person_ids: ids,
          p_first_name: firstName,
          p_performed_by: userId
        })
        if (rpcErr) throw new Error(rpcErr.message)

        emit({
          phase: 'done',
          bulk_action_id: bulkActionId,
          applied: ids.length,
          role: firstName,
          skipped: { missing: person_ids.length - ids.length },
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
