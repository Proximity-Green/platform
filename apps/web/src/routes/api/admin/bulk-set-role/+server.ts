import { error, json } from '@sveltejs/kit'
import {
  requirePermission,
  getUserIdFromRequest,
  supabase,
  sbForUser
} from '$lib/services/permissions.service'

/**
 * Streaming bulk role assignment.
 *
 * Request body: { role_id: string, person_ids: string[] }
 *
 * Response: application/x-ndjson — one JSON object per line as the op advances:
 *   { phase: 'resolving', selected: N }
 *   { phase: 'resolved',  linked: N, skipped_no_user: N }
 *   { phase: 'guarding',  protected: N, actionable: N }
 *   { phase: 'applying',  role: 'member', targets: N }
 *   { phase: 'done',      bulk_action_id: '…', applied: N, skipped: {...}, ms: 340 }
 *   { phase: 'error',     error: '…' }
 *
 * The snapshot+swap is performed atomically inside a SECURITY DEFINER RPC
 * (bulk_set_role_apply). The endpoint only emits progress phases around the
 * single RPC call — we don't stream mid-transaction.
 */
export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'bulk_actions', 'set_role')

  const body = await request.json().catch(() => null) as {
    role_id?: string
    person_ids?: string[]
  } | null
  if (!body?.role_id) throw error(400, 'role_id is required')
  if (!body.person_ids?.length) throw error(400, 'person_ids is required')

  const { role_id, person_ids } = body
  const t0 = Date.now()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }

      try {
        emit({ phase: 'resolving', selected: person_ids.length })

        // 1. Resolve persons → user_ids (only those with linked users).
        const { data: rows, error: lookupErr } = await supabase
          .from('persons')
          .select('id, user_id')
          .in('id', person_ids)
          .is('deleted_at', null)
        if (lookupErr) throw new Error(lookupErr.message)
        const linked = (rows ?? []).filter(r => !!r.user_id)
        const skippedNoUser = (rows ?? []).length - linked.length
        emit({ phase: 'resolved', linked: linked.length, skipped_no_user: skippedNoUser })

        if (linked.length === 0) {
          emit({
            phase: 'done',
            applied: 0,
            skipped: { no_user: skippedNoUser, protected: 0 },
            ms: Date.now() - t0,
            bulk_action_id: null,
            message: 'No members with linked user accounts to update.'
          })
          controller.close()
          return
        }

        // 2. Protect the acting user + any super_admin from being demoted.
        const candidateIds = linked.map(r => r.user_id as string)
        const { data: superRows } = await supabase
          .from('user_roles')
          .select('user_id, roles(name)')
          .in('user_id', candidateIds)
        const protectedIds = new Set<string>()
        protectedIds.add(userId)
        for (const ur of (superRows ?? [])) {
          const uid = (ur as any).user_id as string
          const rname = (ur as any).roles?.name as string | undefined
          if (uid && rname === 'super_admin') protectedIds.add(uid)
        }
        const actionable = candidateIds.filter(uid => !protectedIds.has(uid))
        const skippedProtected = candidateIds.length - actionable.length
        emit({ phase: 'guarding', protected: skippedProtected, actionable: actionable.length })

        if (actionable.length === 0) {
          emit({
            phase: 'done',
            applied: 0,
            skipped: { no_user: skippedNoUser, protected: skippedProtected },
            ms: Date.now() - t0,
            bulk_action_id: null,
            message: 'All targets are protected (self or super_admin).'
          })
          controller.close()
          return
        }

        // 3. Role name (for UX echo).
        const { data: role } = await supabase.from('roles').select('name').eq('id', role_id).single()
        const roleName = role?.name ?? role_id
        emit({ phase: 'applying', role: roleName, targets: actionable.length })

        // 4. Atomic snapshot + swap via RPC.
        const { data: bulkActionId, error: rpcErr } = await sbForUser(userId).rpc('bulk_set_role_apply', {
          p_user_ids: actionable,
          p_role_id: role_id,
          p_performed_by: userId
        })
        if (rpcErr) throw new Error(rpcErr.message)

        emit({
          phase: 'done',
          bulk_action_id: bulkActionId,
          applied: actionable.length,
          role: roleName,
          skipped: { no_user: skippedNoUser, protected: skippedProtected },
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
