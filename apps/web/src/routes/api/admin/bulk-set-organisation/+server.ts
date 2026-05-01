import { error } from '@sveltejs/kit'
import {
  requirePermission,
  getUserIdFromRequest,
  supabase,
  sbForUser
} from '$lib/services/permissions.service'

/**
 * Bulk-set persons.organisation_id for many person ids at once.
 * Mirrors bulk-set-first-name: NDJSON phases, snapshot-backed undo via the
 * bulk_action_undo dispatcher.
 *
 * POST /api/admin/bulk-set-organisation
 *   { organisation_id: string | null, person_ids: string[] }
 *
 * Pass organisation_id = null to clear the assignment.
 */
export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'bulk_actions', 'set_organisation')

  const body = await request.json().catch(() => null) as {
    organisation_id?: string | null
    person_ids?: string[]
  } | null
  if (!body?.person_ids?.length) throw error(400, 'person_ids is required')

  const orgId = body.organisation_id && body.organisation_id !== '' ? body.organisation_id : null
  const { person_ids } = body
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
          .is('deleted_at', null)
        if (lookupErr) throw new Error(lookupErr.message)
        const ids = (rows ?? []).map(r => r.id as string)
        emit({ phase: 'resolved', linked: ids.length, skipped_missing: person_ids.length - ids.length })

        // Resolve org name for the success message (or null = clearing).
        let orgName: string | null = null
        if (orgId) {
          const { data: org, error: orgErr } = await supabase
            .from('organisations')
            .select('name')
            .eq('id', orgId)
            .is('deleted_at', null)
            .single()
          if (orgErr || !org) throw new Error(orgErr?.message ?? 'Organisation not found')
          orgName = (org as any).name
        }

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

        // The shared client-side handlePhase() in /people/+page.svelte uses the
        // `role` field generically as "what we applied" — first-name endpoint
        // does the same. Send the org label there so the existing handler
        // renders "Applied to N persons" without a special branch.
        const label = orgName ?? '(none)'
        emit({ phase: 'applying', role: label, targets: ids.length })

        const { data: bulkActionId, error: rpcErr } = await sbForUser(userId).rpc('bulk_set_organisation_apply', {
          p_person_ids: ids,
          p_organisation_id: orgId,
          p_performed_by: userId
        })
        if (rpcErr) throw new Error(rpcErr.message)

        emit({
          phase: 'done',
          bulk_action_id: bulkActionId,
          applied: ids.length,
          role: label,
          organisation: orgName,
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
