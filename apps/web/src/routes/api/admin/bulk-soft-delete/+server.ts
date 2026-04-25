import { error } from '@sveltejs/kit'
import {
  requirePermission,
  getUserIdFromRequest,
  sbForUser
} from '$lib/services/permissions.service'
import { translate } from '$lib/services/errors'

/**
 * Generic bulk soft-delete for any tier-1 table. Streams NDJSON phases
 * (resolving → guarding → applying → done) and records an undo-able
 * bulk_actions row via the bulk_soft_delete_apply RPC.
 *
 * Body: { table: string, ids: string[], confirm: 'DELETE' }
 *
 * Per-table permission gate: bulk_actions.delete_<table>.
 * Defense-in-depth: requires literal 'DELETE' confirmation in body, mirroring
 * the UI's typed confirmation gate.
 */
const TIER1_TABLES = new Set([
  'items', 'item_types', 'tracking_codes', 'tags',
  'locations', 'spaces',
  'persons', 'organisations', 'legal_entities',
  'contracts', 'subscription_lines', 'subscription_option_groups', 'licenses',
  'notes', 'feature_requests', 'message_templates', 'approved_domains', 'wallets'
])

export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')

  const body = await request.json().catch(() => null) as {
    table?: string
    ids?: string[]
    confirm?: string
  } | null

  if (!body?.table || !TIER1_TABLES.has(body.table)) {
    throw error(400, 'Invalid or unsupported table')
  }
  if (!body.ids?.length) throw error(400, 'ids is required')
  if (body.confirm !== 'DELETE') {
    throw error(400, 'Confirmation required: pass "DELETE" in the confirm field')
  }

  await requirePermission(userId, 'bulk_actions', `delete_${body.table}`)

  const { table, ids } = body
  const t0 = Date.now()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }
      try {
        emit({ phase: 'resolving', selected: ids.length })

        const sb = sbForUser(userId)
        const { data: rows, error: lookupErr } = await sb
          .from(table)
          .select('id')
          .in('id', ids)
          .is('deleted_at', null)
        if (lookupErr) throw new Error(lookupErr.message)

        const liveIds = (rows ?? []).map(r => (r as { id: string }).id)
        const alreadyDeleted = ids.length - liveIds.length

        emit({ phase: 'resolved', linked: liveIds.length, already_deleted: alreadyDeleted })
        emit({ phase: 'guarding', actionable: liveIds.length, skipped: alreadyDeleted })

        if (liveIds.length === 0) {
          emit({
            phase: 'done',
            applied: 0,
            ms: Date.now() - t0,
            bulk_action_id: null,
            message: alreadyDeleted > 0
              ? `All ${alreadyDeleted} selected rows are already deleted.`
              : 'No matching rows.'
          })
          controller.close()
          return
        }

        emit({ phase: 'applying', role: `Deleting ${table}`, targets: liveIds.length })

        const { data: bulkActionId, error: rpcErr } = await sb.rpc('bulk_soft_delete_apply', {
          p_table: table,
          p_ids: liveIds,
          p_performed_by: userId
        })
        if (rpcErr) throw new Error(rpcErr.message)

        emit({
          phase: 'done',
          bulk_action_id: bulkActionId,
          applied: liveIds.length,
          role: `deleted ${table}`,
          message: `Deleted ${liveIds.length} ${table}${alreadyDeleted > 0 ? ` · ${alreadyDeleted} already deleted` : ''}`,
          skipped: { already_deleted: alreadyDeleted },
          ms: Date.now() - t0
        })
        controller.close()
      } catch (e: any) {
        const actionable = await translate(e)
        emit({ phase: 'error', error: actionable, ms: Date.now() - t0 })
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
