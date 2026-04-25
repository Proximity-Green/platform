import { error } from '@sveltejs/kit'
import {
  requirePermission,
  getUserIdFromRequest,
  supabase,
  sbForUser
} from '$lib/services/permissions.service'
import { translate, findSoftDeleted, softDeletedRefError } from '$lib/services/errors'

/**
 * Bulk-edit items: any subset of {item_type_id, location_id, accounting_gl_code,
 * accounting_tax_code, accounting_tax_percentage, active} plus optional
 * tracking-code op (replace | add). Streams NDJSON phases (resolving →
 * guarding → applying → done) and records an undo-able bulk_actions row
 * via bulk_update_items_apply RPC.
 *
 * Body: {
 *   item_ids: string[],
 *   patch: {                       -- only present keys are applied
 *     item_type_id?: string | null,
 *     location_id?: string | null,
 *     accounting_gl_code?: string | null,
 *     accounting_tax_code?: string | null,
 *     accounting_tax_percentage?: number | null,
 *     active?: boolean
 *   },
 *   tracking_codes?: { op: 'replace' | 'add', ids: string[] }
 * }
 */
export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'bulk_actions', 'update_items')

  const body = await request.json().catch(() => null) as {
    item_ids?: string[]
    patch?: Record<string, unknown>
    tracking_codes?: { op?: 'replace' | 'add', ids?: string[] }
  } | null

  if (!body?.item_ids?.length) throw error(400, 'item_ids is required')
  const patch = body.patch ?? {}
  const tcOp = body.tracking_codes?.op ?? null
  const tcIds = body.tracking_codes?.ids ?? []

  if (Object.keys(patch).length === 0 && !tcOp) {
    throw error(400, 'No fields to update — supply patch or tracking_codes')
  }
  if (tcOp && tcOp !== 'replace' && tcOp !== 'add') {
    throw error(400, 'tracking_codes.op must be "replace" or "add"')
  }

  const { item_ids } = body
  const t0 = Date.now()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }
      try {
        emit({ phase: 'resolving', selected: item_ids.length })

        // Sanity check: only apply to items that actually exist.
        const { data: rows, error: lookupErr } = await supabase
          .from('items')
          .select('id')
          .in('id', item_ids)
          .is('deleted_at', null)
        if (lookupErr) throw new Error(lookupErr.message)
        let ids = (rows ?? []).map(r => r.id as string)
        const missing = item_ids.length - ids.length
        emit({ phase: 'resolved', linked: ids.length, skipped_no_user: missing })

        // When applying tracking codes, the codes are scoped to one location.
        // Pre-filter the items to only those at that location so the trigger
        // never raises on mismatches — instead we cleanly skip them and
        // report the count.
        // Proactive soft-delete checks: stop with an actionable error if any
        // referenced row was soft-deleted in another tab while the dialog
        // was open. Cleaner than letting the apply silently skip.
        if (tcOp && tcIds.length > 0) {
          const dead = await findSoftDeleted('tracking_codes', tcIds)
          if (dead.length > 0) {
            emit({ phase: 'error', error: softDeletedRefError('tracking_codes', dead), ms: Date.now() - t0 })
            controller.close()
            return
          }
        }
        if (patch.item_type_id) {
          const dead = await findSoftDeleted('item_types', [patch.item_type_id as string])
          if (dead.length > 0) {
            emit({ phase: 'error', error: softDeletedRefError('item_types', dead), ms: Date.now() - t0 })
            controller.close()
            return
          }
        }
        if (patch.location_id) {
          const dead = await findSoftDeleted('locations', [patch.location_id as string])
          if (dead.length > 0) {
            emit({ phase: 'error', error: softDeletedRefError('locations', dead), ms: Date.now() - t0 })
            controller.close()
            return
          }
        }

        let skippedWrongLocation = 0
        if (tcOp && tcIds.length > 0) {
          const { data: codeRows } = await supabase
            .from('tracking_codes')
            .select('location_id')
            .in('id', tcIds)
            .is('deleted_at', null)
          const locs = new Set((codeRows ?? []).map(r => r.location_id as string))
          if (locs.size === 1) {
            const targetLoc = [...locs][0]
            const { data: matching } = await supabase
              .from('items')
              .select('id')
              .in('id', ids)
              .eq('location_id', targetLoc)
              .is('deleted_at', null)
            const matchingIds = new Set((matching ?? []).map(r => r.id as string))
            skippedWrongLocation = ids.length - matchingIds.size
            ids = ids.filter(id => matchingIds.has(id))
          }
        }

        emit({ phase: 'guarding', protected: skippedWrongLocation, actionable: ids.length })
        if (ids.length === 0) {
          emit({
            phase: 'done',
            applied: 0,
            skipped: { missing: item_ids.length - ids.length, wrong_location: skippedWrongLocation },
            ms: Date.now() - t0,
            bulk_action_id: null,
            message: skippedWrongLocation > 0
              ? `All ${skippedWrongLocation} selected items are at a different location than the chosen tracking codes.`
              : 'No matching items.'
          })
          controller.close()
          return
        }

        // Build a short, human-readable label for the "applying" phase.
        const labelParts: string[] = []
        if ('item_type_id' in patch)              labelParts.push('type')
        if ('location_id' in patch)               labelParts.push('location')
        if ('accounting_gl_code' in patch)        labelParts.push('GL')
        if ('accounting_tax_code' in patch)       labelParts.push('tax code')
        if ('accounting_tax_percentage' in patch) labelParts.push('tax %')
        if ('active' in patch)                    labelParts.push('active')
        if (tcOp)                                 labelParts.push(`tracking codes (${tcOp})`)
        const label = labelParts.join(', ') || 'fields'
        emit({ phase: 'applying', role: label, targets: ids.length })

        const { data: bulkActionId, error: rpcErr } = await sbForUser(userId).rpc('bulk_update_items_apply', {
          p_item_ids: ids,
          p_patch: patch,
          p_tc_op: tcOp,
          p_tc_ids: tcIds,
          p_performed_by: userId
        })
        if (rpcErr) throw new Error(rpcErr.message)

        emit({
          phase: 'done',
          bulk_action_id: bulkActionId,
          applied: ids.length,
          role: label,
          skipped: { missing },
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
