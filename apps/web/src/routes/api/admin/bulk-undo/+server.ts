import { error, json } from '@sveltejs/kit'
import {
  requirePermission,
  getUserIdFromRequest,
  sbForUser
} from '$lib/services/permissions.service'

/**
 * Undo a previously applied bulk action by id. Restores the snapshot
 * captured when the action was performed. SECURITY DEFINER RPC guards
 * against double-undo.
 *
 * POST /api/admin/bulk-undo  { bulk_action_id: string }
 */
export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  await requirePermission(userId, 'bulk_actions', 'undo')

  const body = await request.json().catch(() => null) as { bulk_action_id?: string } | null
  if (!body?.bulk_action_id) throw error(400, 'bulk_action_id is required')

  const { data, error: rpcErr } = await sbForUser(userId).rpc('bulk_action_undo', {
    p_bulk_action_id: body.bulk_action_id,
    p_undone_by: userId
  })
  if (rpcErr) throw error(400, rpcErr.message)

  return json(data)
}
