import { supabase } from '$lib/services/permissions.service'
import type { Matcher } from '../types'

/**
 * Postgres trigger raises this when an item_tracking_codes link would put a
 * tracking code on an item at a different location. Trigger uses UUIDs since
 * it has no UI context — we look up the names so the user can act on it.
 */
const PATTERN = /Tracking code ([0-9a-f-]+) belongs to a different location than item ([0-9a-f-]+)/i

export const match: Matcher = async ({ message }) => {
  const m = message.match(PATTERN)
  if (!m) return null
  const [, tcId, itemId] = m

  const [tcRes, itemRes] = await Promise.all([
    supabase
      .from('tracking_codes')
      .select('code, name, location_id, locations(name)')
      .eq('id', tcId)
      .maybeSingle(),
    supabase
      .from('items')
      .select('name, location_id, locations(name)')
      .eq('id', itemId)
      .maybeSingle()
  ])

  const tc = tcRes.data as any
  const it = itemRes.data as any
  const tcLabel = tc ? `${tc.code} · ${tc.name}` : tcId
  const tcLoc = tc?.locations?.name ?? 'unknown location'
  const itLabel = it?.name ?? itemId
  const itLoc = it?.locations?.name ?? 'no location set'

  const actions = []
  if (it?.location_id) actions.push({ label: `Open item "${itLabel}"`, href: `/items/${itemId}` })
  if (tc?.location_id) actions.push({ label: `View ${tcLoc} codes`, href: `/locations/${tc.location_id}?tab=tracking` })

  return {
    code: 'cross_location_tracking_code',
    title: `Tracking code "${tcLabel}" belongs to ${tcLoc}, but item "${itLabel}" is at ${itLoc}.`,
    detail: `Move the item to ${tcLoc} first, or pick codes from ${itLoc}.`,
    actions,
    raw: message
  }
}
