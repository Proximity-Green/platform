/**
 * Occupancy reporting — V0 service.
 *
 * Inventory lens (NOT live presence). Returns the data shape that
 * powers `/occupancy` and is structured to be queryable from the AI
 * assistant alongside the page.
 *
 * Mirrors the W17 SA WSM "Location Detail" report (legend KPIs A1–D7)
 * with the by-item × forward-month grid as the daily-driver view, plus
 * additions WSM lacked: vacancy highlighting via state, prospect cells,
 * and membership demand below the offices grid.
 */
import { supabase } from '$lib/services/permissions.service'

const TERMINAL_SUB_STATUSES = new Set(['superseded', 'cancelled', 'expired', 'ended'])

/** State of one (item × month) cell. */
export type CellState = 'sold' | 'prospect' | 'vacant'

export type MonthCell = {
  month: string             // 'YYYY-MM'
  state: CellState
  rate: number | null       // sub.base_rate when sold/prospect; null when vacant
  org_id: string | null
  org_name: string | null
  org_status: string | null
  sub_id: string | null
}

export type SpaceItemRow = {
  item_id: string
  item_name: string
  type_slug: string
  type_name: string
  location_id: string
  area_sqm: number | null
  capacity: number | null
  start_price_per_m2: number | null
  /** Per-month cells in chronological order. */
  cells: MonthCell[]
}

export type LocationKpis = {
  // A — ratios
  pct_offices_sold: number | null              // A1: B1 / B3
  pct_business_case_achieved: number | null    // A2: C1 / C2
  // B — counts
  active_offices: number                       // B1
  vacant_offices: number                       // B2
  total_offices: number                        // B3
  // C — revenue
  projected_revenue: number                    // C1: sum of active sub.base_rate
  total_business_case: number                  // C2: sum of (start_price_per_m2 * area_sqm)
  achievable_revenue: number                   // C3: sum of items.base_rate (list)
  // D — m² and capacity
  total_size_sqm: number                       // D1
  occupied_size_sqm: number                    // D2
  vacant_size_sqm: number                      // D3
  pct_size_occupied: number | null             // D4: D2 / D1
  avg_rate_per_sqm_sold: number | null         // D5
  price_per_seat_sold: number | null           // D6
  total_desk_capacity: number                  // D7
  // Network/period revenue rollup
  forward_revenue_total: number                // sum across all cells in window
}

export type LocationReport = {
  location_id: string
  location_name: string
  short_name: string | null
  kpis: LocationKpis
  /** One row per space-family item (offices, meeting rooms, etc). */
  rows: SpaceItemRow[]
  /** Membership demand summary (existing V0 buckets). */
  membership: {
    sub_count: number
    stock_target: number | null
    total_seats: number
    buckets: Array<{
      occupancy_type: 'individual' | 'team' | 'corporate' | 'unknown'
      rooted: number
      occasional: number
      total_members: number
    }>
  }
}

export type OccupancyReport = {
  generated_at: string
  /** Month strings in chronological order — table column headers. */
  months: { iso: string; label: string }[]
  locations: LocationReport[]
  /** Network-wide totals across all locations. */
  network: {
    total_offices: number
    active_offices: number
    vacant_offices: number
    pct_offices_sold: number | null
    projected_revenue: number
    total_business_case: number
    pct_business_case_achieved: number | null
    total_size_sqm: number
    occupied_size_sqm: number
    pct_size_occupied: number | null
    membership_subs: number
    membership_seats: number
  }
  /** Schema fields that don't exist yet but the report is asking for. */
  schema_gaps: string[]
}

/**
 * Build the report. `windowMonths` controls how many forward months
 * (including the current month) appear in the by-item grid — WSM
 * uses 6, that's the default.
 */
export async function getOccupancyReport(opts: {
  windowMonths?: number
  /** Optional — pin to a single location id (org-page style report). */
  locationId?: string | null
} = {}): Promise<OccupancyReport> {
  const windowMonths = opts.windowMonths ?? 6
  const months = buildMonthRange(new Date(), windowMonths)

  // ── Bulk loads in parallel ───────────────────────────────────────
  const [locsRes, typesRes, itemsRes, officeRes, membershipRes, subsRes, orgsRes] = await Promise.all([
    locationQuery(opts.locationId),
    supabase.from('item_types').select('id, slug, name, family').is('deleted_at', null),
    supabase
      .from('items')
      .select('id, name, location_id, item_type_id, base_rate, active')
      .eq('active', true)
      .is('deleted_at', null),
    supabase.from('office_details').select('item_id, area_sqm, capacity, start_price_per_m2'),
    supabase.from('membership_details').select('item_id, occupancy_type, max_members, space_credits_per_month'),
    supabase
      .from('subscription_lines')
      .select(`
        id, status, base_rate, currency, started_at, ended_at, organisation_id, location_id,
        item_id, license_id,
        licenses(id, item_id, location_id, started_at, ended_at)
      `)
      .is('deleted_at', null),
    supabase.from('organisations').select('id, name, status').is('deleted_at', null)
  ])

  for (const r of [locsRes, typesRes, itemsRes, officeRes, membershipRes, subsRes, orgsRes]) {
    if (r.error) throw new Error(r.error.message)
  }

  const locations = locsRes.data ?? []
  const itemTypes = typesRes.data ?? []
  const items = itemsRes.data ?? []
  const officeDetails = officeRes.data ?? []
  const membershipDetails = membershipRes.data ?? []
  const subs = (subsRes.data ?? []).filter((s: any) => !TERMINAL_SUB_STATUSES.has(s.status))
  const orgs = orgsRes.data ?? []

  // ── Indexes ──────────────────────────────────────────────────────
  const typeById = new Map<string, any>()
  for (const t of itemTypes) typeById.set(t.id, t)

  const officeByItem = new Map<string, any>()
  for (const o of officeDetails) officeByItem.set(o.item_id, o)

  const membershipByItem = new Map<string, any>()
  for (const m of membershipDetails) membershipByItem.set(m.item_id, m)

  const orgById = new Map<string, any>()
  for (const o of orgs) orgById.set(o.id, o)

  // For each licence-backed sub, normalise to (item_id, location_id, started_at, ended_at).
  // Item-backed product subs are skipped — they don't consume floor stock.
  type ResolvedSub = {
    sub_id: string
    item_id: string
    location_id: string
    base_rate: number
    organisation_id: string
    started_at: string | null
    ended_at: string | null
  }
  const resolvedSubs: ResolvedSub[] = []
  for (const s of subs as any[]) {
    const lic = s.licenses
    const itemId = lic?.item_id ?? null
    const locId = lic?.location_id ?? s.location_id ?? null
    if (!itemId || !locId) continue
    resolvedSubs.push({
      sub_id: s.id,
      item_id: itemId,
      location_id: locId,
      base_rate: Number(s.base_rate ?? 0),
      organisation_id: s.organisation_id,
      started_at: s.started_at ?? lic?.started_at ?? null,
      ended_at: s.ended_at ?? lic?.ended_at ?? null
    })
  }

  // Group resolved subs by item_id for fast cell lookup.
  const subsByItem = new Map<string, ResolvedSub[]>()
  for (const r of resolvedSubs) {
    const list = subsByItem.get(r.item_id) ?? []
    list.push(r)
    subsByItem.set(r.item_id, list)
  }

  // ── Per-location reports ─────────────────────────────────────────
  const locationReports: LocationReport[] = locations.map((loc: any) => {
    const locItems = items.filter((i: any) => i.location_id === loc.id)

    // Space-family items get one row each in the grid.
    const spaceItems = locItems.filter((i: any) => typeById.get(i.item_type_id)?.family === 'space')
    const spaceItemsSorted = spaceItems.sort((a: any, b: any) => a.name.localeCompare(b.name))

    const rows: SpaceItemRow[] = spaceItemsSorted.map((it: any) => {
      const t = typeById.get(it.item_type_id)
      const od = officeByItem.get(it.id)
      const itemSubs = subsByItem.get(it.id) ?? []
      const cells: MonthCell[] = months.map(m => {
        // Pick the sub overlapping this month. If multiple, prefer the
        // one with the most recent started_at (e.g. an upgrade).
        const candidates = itemSubs.filter(s => monthOverlaps(m.iso, s.started_at, s.ended_at))
        candidates.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
        const winning = candidates[0]
        if (!winning) {
          return { month: m.iso, state: 'vacant', rate: null, org_id: null, org_name: null, org_status: null, sub_id: null }
        }
        const org = orgById.get(winning.organisation_id)
        const orgStatus = org?.status ?? null
        const state: CellState = orgStatus === 'active' ? 'sold' : 'prospect'
        return {
          month: m.iso,
          state,
          rate: winning.base_rate,
          org_id: winning.organisation_id,
          org_name: org?.name ?? null,
          org_status: orgStatus,
          sub_id: winning.sub_id
        }
      })
      return {
        item_id: it.id,
        item_name: it.name,
        type_slug: t?.slug ?? '',
        type_name: t?.name ?? '',
        location_id: loc.id,
        area_sqm: od?.area_sqm != null ? Number(od.area_sqm) : null,
        capacity: od?.capacity != null ? Number(od.capacity) : null,
        start_price_per_m2: od?.start_price_per_m2 != null ? Number(od.start_price_per_m2) : null,
        cells
      }
    })

    // ── KPIs (legend A1–D7) ────────────────────────────────────────
    // Legend defines KPIs in the offices-only flavour (COA = 2200).
    // We're broader: count all space-family items. Slug check is one
    // line if you want to narrow back to offices only.
    const isOfficeRow = (r: SpaceItemRow) => true  // family='space' already filtered
    const officeRows = rows.filter(isOfficeRow)
    const totalOffices = officeRows.length

    // Sold-now = state in the FIRST cell (current month) is 'sold'.
    const sold = officeRows.filter(r => r.cells[0]?.state === 'sold').length
    const vacant = officeRows.filter(r => r.cells[0]?.state === 'vacant').length

    // Revenue right-now (first cell rate).
    const projectedRevenue = officeRows.reduce((s, r) => s + (r.cells[0]?.rate ?? 0), 0)
    const achievableRevenue = officeRows.reduce((s, r) => {
      const item = items.find((i: any) => i.id === r.item_id)
      return s + Number(item?.base_rate ?? 0)
    }, 0)
    const totalBusinessCase = officeRows.reduce(
      (s, r) => s + (r.area_sqm != null && r.start_price_per_m2 != null ? r.area_sqm * r.start_price_per_m2 : 0),
      0
    )

    const totalSize = officeRows.reduce((s, r) => s + (r.area_sqm ?? 0), 0)
    const occupiedSize = officeRows
      .filter(r => r.cells[0]?.state === 'sold')
      .reduce((s, r) => s + (r.area_sqm ?? 0), 0)

    const soldRows = officeRows.filter(r => r.cells[0]?.state === 'sold')
    const avgRatePerSqmSold = sumIfPositive(soldRows.map(r => r.cells[0]?.rate ?? 0)) > 0 && sumIfPositive(soldRows.map(r => r.area_sqm ?? 0)) > 0
      ? sumIfPositive(soldRows.map(r => r.cells[0]?.rate ?? 0)) / sumIfPositive(soldRows.map(r => r.area_sqm ?? 0))
      : null
    const totalDeskCapacity = officeRows.reduce((s, r) => s + (r.capacity ?? 0), 0)
    const soldCapacity = soldRows.reduce((s, r) => s + (r.capacity ?? 0), 0)
    const pricePerSeatSold = soldCapacity > 0
      ? soldRows.reduce((s, r) => s + (r.cells[0]?.rate ?? 0), 0) / soldCapacity
      : null

    const forwardRevenueTotal = officeRows.reduce(
      (s, r) => s + r.cells.reduce((s2, c) => s2 + (c.rate ?? 0), 0),
      0
    )

    const kpis: LocationKpis = {
      pct_offices_sold: totalOffices > 0 ? sold / totalOffices : null,
      pct_business_case_achieved: totalBusinessCase > 0 ? projectedRevenue / totalBusinessCase : null,
      active_offices: sold,
      vacant_offices: vacant,
      total_offices: totalOffices,
      projected_revenue: projectedRevenue,
      total_business_case: totalBusinessCase,
      achievable_revenue: achievableRevenue,
      total_size_sqm: totalSize,
      occupied_size_sqm: occupiedSize,
      vacant_size_sqm: totalSize - occupiedSize,
      pct_size_occupied: totalSize > 0 ? occupiedSize / totalSize : null,
      avg_rate_per_sqm_sold: avgRatePerSqmSold,
      price_per_seat_sold: pricePerSeatSold,
      total_desk_capacity: totalDeskCapacity,
      forward_revenue_total: forwardRevenueTotal
    }

    // ── Membership demand (carried forward from V0) ────────────────
    const membershipBuckets = {
      individual: { occupancy_type: 'individual' as const, rooted: 0, occasional: 0, total_members: 0 },
      team:       { occupancy_type: 'team' as const,       rooted: 0, occasional: 0, total_members: 0 },
      corporate:  { occupancy_type: 'corporate' as const,  rooted: 0, occasional: 0, total_members: 0 },
      unknown:    { occupancy_type: 'unknown' as const,    rooted: 0, occasional: 0, total_members: 0 }
    }
    let membershipSubs = 0
    for (const r of resolvedSubs) {
      if (r.location_id !== loc.id) continue
      const it = items.find((i: any) => i.id === r.item_id)
      if (!it) continue
      const t = typeById.get(it.item_type_id)
      if (t?.family !== 'membership') continue
      membershipSubs += 1
      const md = membershipByItem.get(r.item_id)
      const occ = (md?.occupancy_type as keyof typeof membershipBuckets) ?? 'unknown'
      const credits = md?.space_credits_per_month
      const isOccasional = credits != null && Number(credits) > 0
      const seats = Number(md?.max_members ?? 1)
      const bucket = membershipBuckets[occ] ?? membershipBuckets.unknown
      if (isOccasional) bucket.occasional += 1
      else bucket.rooted += 1
      bucket.total_members += Number.isFinite(seats) && seats > 0 ? seats : 1
    }
    const totalSeats = Object.values(membershipBuckets).reduce((s, b) => s + b.total_members, 0)

    return {
      location_id: loc.id,
      location_name: loc.name,
      short_name: loc.short_name ?? null,
      kpis,
      rows,
      membership: {
        sub_count: membershipSubs,
        stock_target: null,
        total_seats: totalSeats,
        buckets: Object.values(membershipBuckets)
      }
    }
  })

  // ── Network rollup ───────────────────────────────────────────────
  const network = locationReports.reduce(
    (acc, lr) => {
      acc.total_offices       += lr.kpis.total_offices
      acc.active_offices      += lr.kpis.active_offices
      acc.vacant_offices      += lr.kpis.vacant_offices
      acc.projected_revenue   += lr.kpis.projected_revenue
      acc.total_business_case += lr.kpis.total_business_case
      acc.total_size_sqm      += lr.kpis.total_size_sqm
      acc.occupied_size_sqm   += lr.kpis.occupied_size_sqm
      acc.membership_subs     += lr.membership.sub_count
      acc.membership_seats    += lr.membership.total_seats
      return acc
    },
    {
      total_offices: 0,
      active_offices: 0,
      vacant_offices: 0,
      pct_offices_sold: null as number | null,
      projected_revenue: 0,
      total_business_case: 0,
      pct_business_case_achieved: null as number | null,
      total_size_sqm: 0,
      occupied_size_sqm: 0,
      pct_size_occupied: null as number | null,
      membership_subs: 0,
      membership_seats: 0
    }
  )
  network.pct_offices_sold = network.total_offices > 0
    ? network.active_offices / network.total_offices : null
  network.pct_business_case_achieved = network.total_business_case > 0
    ? network.projected_revenue / network.total_business_case : null
  network.pct_size_occupied = network.total_size_sqm > 0
    ? network.occupied_size_sqm / network.total_size_sqm : null

  return {
    generated_at: new Date().toISOString(),
    months,
    locations: locationReports,
    network,
    schema_gaps: [
      'locations.membership_capacity_target — per-location target headcount for floor pressure',
      'membership_details.space_pressure_factor — rooted vs occasional weighting (default 1.0; <1 for occasional)'
    ]
  }
}

// ── Helpers ────────────────────────────────────────────────────────

async function locationQuery(locationId?: string | null) {
  const q = supabase
    .from('locations')
    .select('id, name, short_name, status')
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('name')
  if (locationId) return q.eq('id', locationId)
  return q
}

function buildMonthRange(start: Date, count: number): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
    out.push({ iso, label })
  }
  return out
}

/**
 * Does the given month overlap [started_at, ended_at]? Open-ended subs
 * (ended_at null) overlap every month from started_at onward.
 */
function monthOverlaps(monthIso: string, startedAt: string | null, endedAt: string | null): boolean {
  // Build the [first, last] day of the month from monthIso (YYYY-MM).
  const [yy, mm] = monthIso.split('-').map(Number)
  const firstDay = `${monthIso}-01`
  const lastDay = isoDateOfLastDay(yy, mm)

  const start = (startedAt ?? '').slice(0, 10)
  const end = (endedAt ?? '').slice(0, 10)

  if (start && start > lastDay) return false
  if (end && end < firstDay) return false
  return true
}

function isoDateOfLastDay(year: number, month: number): string {
  // month is 1-indexed; pass day 0 of the next month to get last day.
  const d = new Date(Date.UTC(year, month, 0))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function sumIfPositive(xs: number[]): number {
  let s = 0
  for (const x of xs) if (x > 0) s += x
  return s
}
