import { supabase } from '$lib/services/permissions.service'

// In-memory cache for lookup tables that rarely change. A short TTL keeps
// server-side memory stable and allows admins to see edits within a minute
// without needing to invalidate manually.
const TTL_MS = 60_000

type Cached<T> = { at: number; value: T } | null

let itemTypesCache: Cached<Array<{ id: string; slug: string; name: string }>> = null
let locationsCache: Cached<Array<{ id: string; name: string; short_name: string | null }>> = null
let trackingCodesCache: Cached<Array<{ id: string; location_id: string; category: string | null; code: string; name: string; is_primary: boolean; active: boolean }>> = null

function fresh<T>(c: Cached<T>): T | null {
  if (!c) return null
  return Date.now() - c.at < TTL_MS ? c.value : null
}

export async function listItemTypes() {
  const hit = fresh(itemTypesCache)
  if (hit) return hit
  const { data } = await supabase
    .from('item_types')
    .select('id, slug, name')
    .is('deleted_at', null)
    .order('name')
  const value = data ?? []
  itemTypesCache = { at: Date.now(), value }
  return value
}

export async function listLocationsLite() {
  const hit = fresh(locationsCache)
  if (hit) return hit
  const { data } = await supabase
    .from('locations')
    .select('id, name, short_name')
    .is('deleted_at', null)
    .order('name')
  const value = data ?? []
  locationsCache = { at: Date.now(), value }
  return value
}

export async function listActiveTrackingCodes() {
  const hit = fresh(trackingCodesCache)
  if (hit) return hit
  const { data } = await supabase
    .from('tracking_codes')
    .select('id, location_id, category, code, name, is_primary, active')
    .eq('active', true)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('category')
    .order('code')
  const value = data ?? []
  trackingCodesCache = { at: Date.now(), value }
  return value
}

export function invalidateItemLookups() {
  itemTypesCache = null
  locationsCache = null
  trackingCodesCache = null
}
