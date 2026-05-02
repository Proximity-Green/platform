import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'

/**
 * Occupancy V0 — crude sold/unsold report per location.
 *
 * NOT to be confused with the live presence/headcount feature in
 * docs/OCCUPANCY.md (RADIUS-driven, "who's here right now"). This is
 * the *inventory* lens: what fraction of bookable stock is paying.
 *
 * Two sections per location:
 *
 * 1. SPACE INVENTORY (item_types.family = 'space') — offices, meeting
 *    rooms, hotel rooms, dedicated desks. Each item is one unit of
 *    stock. Sold = has an active licence-backed subscription_line.
 *    Easy: items × subs join → stock vs sold per item_type.
 *
 * 2. MEMBERSHIP DEMAND (item_types.family = 'membership') — these
 *    aren't physical inventory; they're access products. Stock target
 *    is the floor capacity for member presence (NOT IN SCHEMA YET —
 *    needs locations.membership_capacity_target). Demand is harder
 *    than offices because:
 *      - team / corporate subs cover N members each (max_members)
 *      - "rooted" memberships (no credit cap) sit at full pressure
 *      - "occasional" memberships (limited credits) sit at fractional
 *        pressure. V0 just splits the count by these buckets so we
 *        can SEE the shape — proper weighting needs a per-membership
 *        space_pressure_factor field, also not in schema yet.
 *
 * Treat this report as the spec for the missing data-layer fields,
 * not as final production reporting.
 */

const TERMINAL_SUB_STATUSES = new Set(['superseded', 'cancelled', 'expired', 'ended'])

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'subscriptions', 'read')

  // ── Locations + item_types lookup ────────────────────────────────
  const [locsRes, typesRes, itemsRes, subsRes, memDetailsRes] = await Promise.all([
    supabase
      .from('locations')
      .select('id, name, short_name, status')
      .is('deleted_at', null)
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('item_types')
      .select('id, slug, name, family, requires_license')
      .is('deleted_at', null),
    // All non-deleted, active items at any active location.
    supabase
      .from('items')
      .select('id, name, location_id, item_type_id, active')
      .eq('active', true)
      .is('deleted_at', null),
    // All non-terminal, non-deleted subs with their licence + item refs.
    // We need: location_id (where the demand sits), license_id (presence
    // means licence-backed), and for licence subs the licence's item_id
    // so we can roll up by item_type.
    supabase
      .from('subscription_lines')
      .select(`
        id, status, location_id, license_id, item_id, organisation_id,
        licenses(id, item_id, location_id)
      `)
      .is('deleted_at', null),
    supabase
      .from('membership_details')
      .select('item_id, occupancy_type, max_members, space_credits_per_month')
  ])

  for (const r of [locsRes, typesRes, itemsRes, subsRes, memDetailsRes]) {
    if (r.error) throw new Error(r.error.message)
  }

  const locations = locsRes.data ?? []
  const itemTypes = typesRes.data ?? []
  const items = itemsRes.data ?? []
  const subs = (subsRes.data ?? []).filter(s => !TERMINAL_SUB_STATUSES.has((s as any).status))
  const memDetails = memDetailsRes.data ?? []

  // ── Indexes for fast lookups ─────────────────────────────────────
  const typeById = new Map<string, any>()
  for (const t of itemTypes) typeById.set(t.id, t)

  const itemById = new Map<string, any>()
  for (const i of items) itemById.set(i.id, i)

  const memDetailsByItem = new Map<string, any>()
  for (const m of memDetails) memDetailsByItem.set(m.item_id, m)

  // ── Resolve each licence-backed sub to its licence's item + location.
  // Licence-backed sub: license_id set, item_id null (XOR rule). We
  // pull the item via the licence; that's how we know which item_type
  // family the licence consumes. Item-backed subs (item_id set) we
  // skip for occupancy — they're product subs (coffee plan, etc.),
  // not floor-pressure.
  type Resolved = {
    sub_id: string
    location_id: string | null
    item_id: string | null
    type_id: string | null
    family: string | null
    type_slug: string | null
  }
  const resolved: Resolved[] = subs.map(s => {
    const lic = (s as any).licenses
    const itemId = lic?.item_id ?? null
    const locId = lic?.location_id ?? (s as any).location_id ?? null
    const item = itemId ? itemById.get(itemId) : null
    const type = item ? typeById.get(item.item_type_id) : null
    return {
      sub_id: (s as any).id,
      location_id: locId,
      item_id: itemId,
      type_id: type?.id ?? null,
      family: type?.family ?? null,
      type_slug: type?.slug ?? null
    }
  })

  // ── Per-location rollup ──────────────────────────────────────────
  type SpaceTypeRow = {
    type_slug: string
    type_name: string
    stock: number
    sold: number
  }
  type MembershipBucket = {
    occupancy_type: 'individual' | 'team' | 'corporate' | 'unknown'
    rooted: number       // subs with no/zero space_credits_per_month
    occasional: number   // subs with positive space_credits_per_month
    total_members: number  // sum of max_members ?? 1
  }

  const rows = locations.map((loc: any) => {
    // Items at this location, grouped by item_type.
    const locItems = items.filter(i => i.location_id === loc.id)

    // Space inventory — family='space' types.
    const spaceTypes = new Map<string, SpaceTypeRow>()
    for (const i of locItems) {
      const t = typeById.get(i.item_type_id)
      if (!t || t.family !== 'space') continue
      const row = spaceTypes.get(t.slug) ?? { type_slug: t.slug, type_name: t.name, stock: 0, sold: 0 }
      row.stock += 1
      spaceTypes.set(t.slug, row)
    }
    // Tally sold per type by counting resolved licence subs whose
    // item belongs to this location and family=space.
    for (const r of resolved) {
      if (r.location_id !== loc.id) continue
      if (r.family !== 'space') continue
      if (!r.type_slug) continue
      const row = spaceTypes.get(r.type_slug)
      if (row) row.sold += 1
    }

    // Membership demand — family='membership'.
    const buckets: Record<string, MembershipBucket> = {
      individual: { occupancy_type: 'individual', rooted: 0, occasional: 0, total_members: 0 },
      team:       { occupancy_type: 'team',       rooted: 0, occasional: 0, total_members: 0 },
      corporate:  { occupancy_type: 'corporate',  rooted: 0, occasional: 0, total_members: 0 },
      unknown:    { occupancy_type: 'unknown',    rooted: 0, occasional: 0, total_members: 0 }
    }
    let membershipSubsTotal = 0
    for (const r of resolved) {
      if (r.location_id !== loc.id) continue
      if (r.family !== 'membership') continue
      membershipSubsTotal += 1
      const md = r.item_id ? memDetailsByItem.get(r.item_id) : null
      const occ = (md?.occupancy_type as 'individual' | 'team' | 'corporate' | undefined) ?? 'unknown'
      const credits = md?.space_credits_per_month
      const isOccasional = credits != null && Number(credits) > 0
      const seats = Number(md?.max_members ?? 1)
      const bucket = buckets[occ]
      if (isOccasional) bucket.occasional += 1
      else bucket.rooted += 1
      bucket.total_members += Number.isFinite(seats) && seats > 0 ? seats : 1
    }

    // Total weighted demand — V0 uses raw seat count. A space pressure
    // factor (rooted = 1.0, occasional = e.g. 0.25) belongs in
    // membership_details and isn't in schema yet. Showing the split so
    // the operator can eyeball it.
    const totalSeats = Object.values(buckets).reduce((s, b) => s + b.total_members, 0)

    const spaceRows = [...spaceTypes.values()].sort((a, b) => a.type_name.localeCompare(b.type_name))
    const spaceStock = spaceRows.reduce((s, r) => s + r.stock, 0)
    const spaceSold  = spaceRows.reduce((s, r) => s + r.sold, 0)

    return {
      id: loc.id,
      name: loc.name,
      short_name: loc.short_name,
      space: {
        rows: spaceRows,
        stock_total: spaceStock,
        sold_total: spaceSold,
        unsold_total: spaceStock - spaceSold,
        occupancy_pct: spaceStock > 0 ? Math.round((spaceSold / spaceStock) * 100) : null
      },
      membership: {
        sub_count: membershipSubsTotal,
        // Stock target lives nowhere yet — surfaced as null so the UI
        // can flag the gap.
        stock_target: null as number | null,
        total_seats: totalSeats,
        buckets: Object.values(buckets)
      }
    }
  })

  return {
    locations: rows,
    // For the doc / header note — keep it visible that this report
    // is informing schema decisions, not finalised reporting.
    schemaGaps: [
      'locations.membership_capacity_target — per-location target headcount for floor pressure',
      'membership_details.space_pressure_factor — rooted vs occasional weighting (1.0 default; <1 for occasional)'
    ]
  }
}
