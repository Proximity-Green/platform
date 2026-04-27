<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import { page } from '$app/stores'
  import { goto, invalidateAll } from '$app/navigation'
  import {
    Button,
    PageHead,
    Toast,
    Badge,
    DataTable,
    FormCard,
    FieldGrid,
    Field,
    Select,
    Modal,
    ErrorBanner
  } from '$lib/components/ui'
  import type { ActionableError } from '$lib/services/errors'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'
  import { fmtMoney } from '$lib/utils/money'

  type Item = {
    id: string
    wsm_id: string | null
    item_type_id: string
    location_id: string | null
    name: string
    description: string | null
    sku: string | null
    base_rate: number | null
    accounting_gl_code: string | null
    accounting_item_code: string | null
    accounting_tax_code: string | null
    accounting_tax_percentage: number | null
    accounting_description: string | null
    active: boolean
    metadata: Record<string, any> | null
    created_at: string
    updated_at: string
    item_type_name: string | null
    item_type_slug: string | null
    location_name: string | null
  }

  type LookupOption = { id: string; slug?: string; name: string }

  type TrackingCode = {
    id: string
    location_id: string
    category: string | null
    code: string
    name: string
    is_primary: boolean
    active: boolean
  }

  type TypeSlug =
    | 'office'
    | 'meeting_room'
    | 'hotel_room'
    | 'membership'
    | 'product'
    | 'service'
    | 'art'
    | 'asset'
    | 'vehicle'
    | 'equipment'
  type FieldKind = 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'enum' | 'long_text'
  type FieldDef = { slug: string; label: string; kind: FieldKind; options?: string[]; unit?: string; noSeparator?: boolean }

  // Per-type UI-schema. Must match TYPE_COLUMNS in +page.server.ts.
  const TYPE_FIELDS: Partial<Record<TypeSlug, FieldDef[]>> = {
    office: [
      { slug: 'area_sqm', label: 'Area', kind: 'number', unit: 'm²' },
      { slug: 'capacity', label: 'Capacity', kind: 'integer' },
      { slug: 'aesthetic', label: 'Aesthetic', kind: 'text' },
      { slug: 'aesthetic_impact', label: 'Aesthetic impact', kind: 'number' },
      { slug: 'safety_margin', label: 'Safety margin', kind: 'number' },
      { slug: 'start_price_per_m2', label: 'Start price per m²', kind: 'number' },
      { slug: 'layout', label: 'Layout', kind: 'text' }
    ],
    meeting_room: [
      { slug: 'capacity', label: 'Capacity', kind: 'integer' },
      { slug: 'price_per_user_per_day', label: 'Price per user / day', kind: 'number' },
      { slug: 'off_peak_factor', label: 'Off-peak factor', kind: 'number' },
      { slug: 'layout', label: 'Layout', kind: 'text' },
      { slug: 'slots_per_day', label: 'Slots per day', kind: 'integer' }
    ],
    hotel_room: [
      { slug: 'capacity', label: 'Capacity', kind: 'integer' },
      { slug: 'price_per_day', label: 'Price per day', kind: 'number' },
      { slug: 'layout', label: 'Layout', kind: 'text' }
    ],
    membership: [
      { slug: 'occupancy_type', label: 'Occupancy type', kind: 'enum', options: ['individual','team','corporate'] },
      { slug: 'max_members', label: 'Seats included', kind: 'integer' },
      { slug: 'cost_extra_member', label: 'Cost per extra member', kind: 'number' },
      { slug: 'cost_period', label: 'Billing cadence', kind: 'enum', options: ['month','year'] },
      { slug: 'space_credits_per_month', label: 'Space credits / month', kind: 'integer' },
      { slug: 'space_credits_cost_full_day', label: 'Credits — full day', kind: 'number' },
      { slug: 'space_credits_cost_half_day', label: 'Credits — half day', kind: 'number' },
      { slug: 'stuff_credits_per_month', label: 'Stuff credits / month', kind: 'integer' },
      { slug: 'print_credits_per_month', label: 'Print credits / month', kind: 'integer' },
      { slug: 'marketing_description', label: 'Marketing description', kind: 'long_text' }
    ],
    product: [
      { slug: 'volume', label: 'Volume / pack size', kind: 'integer' },
      { slug: 'member_discount', label: 'Member discount %', kind: 'integer' },
      { slug: 'price_customisable', label: 'Price customisable', kind: 'boolean' },
      { slug: 'self_service', label: 'Self-service purchase', kind: 'boolean' },
      { slug: 'payment_options', label: 'Payment options', kind: 'text' },
      { slug: 'supplier_name', label: 'Supplier name', kind: 'text' },
      { slug: 'supplier_sku', label: 'Supplier SKU', kind: 'text' },
      { slug: 'price_updated_at', label: 'Price last reviewed', kind: 'date' }
    ],
    service: [
      { slug: 'duration_minutes', label: 'Duration (min)', kind: 'integer' },
      { slug: 'billable_unit', label: 'Billable unit', kind: 'enum', options: ['hour','session','project','day'] },
      { slug: 'requires_booking', label: 'Requires booking', kind: 'boolean' },
      { slug: 'capacity', label: 'Capacity', kind: 'integer' }
    ],
    art: [
      { slug: 'artist_name', label: 'Artist', kind: 'text' },
      { slug: 'medium', label: 'Medium', kind: 'text' },
      { slug: 'dimensions_height_cm', label: 'Height', kind: 'number', unit: 'cm' },
      { slug: 'dimensions_width_cm', label: 'Width', kind: 'number', unit: 'cm' },
      { slug: 'dimensions_depth_cm', label: 'Depth', kind: 'number', unit: 'cm' },
      { slug: 'year_created', label: 'Year created', kind: 'integer', noSeparator: true },
      { slug: 'edition_number', label: 'Edition #', kind: 'integer' },
      { slug: 'edition_size', label: 'Edition size', kind: 'integer' },
      { slug: 'framed', label: 'Framed', kind: 'boolean' },
      { slug: 'insurance_value', label: 'Insurance value', kind: 'number' },
      { slug: 'acquisition_cost', label: 'Acquisition cost', kind: 'number' },
      { slug: 'acquired_at', label: 'Acquired', kind: 'date' },
      { slug: 'list_price', label: 'List price', kind: 'number' },
      { slug: 'status', label: 'Status', kind: 'enum', options: ['in_storage','on_display','on_loan','sold','returned'] },
      { slug: 'consignment', label: 'On consignment', kind: 'boolean' },
      { slug: 'consignment_commission_percent', label: 'Consignment %', kind: 'number' },
      { slug: 'sold_at', label: 'Sold', kind: 'date' },
      { slug: 'sold_price', label: 'Sold price', kind: 'number' },
      { slug: 'condition_notes', label: 'Condition notes', kind: 'long_text' },
      { slug: 'provenance', label: 'Provenance', kind: 'long_text' }
    ],
    asset: [
      { slug: 'kind', label: 'Kind', kind: 'enum', options: ['vehicle','equipment','bicycle','other'] },
      { slug: 'make', label: 'Make', kind: 'text' },
      { slug: 'model', label: 'Model', kind: 'text' },
      { slug: 'serial_number', label: 'Serial #', kind: 'text' },
      { slug: 'registration', label: 'Registration', kind: 'text' },
      { slug: 'acquired_at', label: 'Acquired', kind: 'date' },
      { slug: 'acquisition_cost', label: 'Acquisition cost', kind: 'number' },
      { slug: 'insurance_value', label: 'Insurance value', kind: 'number' },
      { slug: 'last_service_at', label: 'Last service', kind: 'date' },
      { slug: 'odometer_km', label: 'Odometer', kind: 'number', unit: 'km' },
      { slug: 'status', label: 'Status', kind: 'enum', options: ['available','rented','maintenance','retired'] },
      { slug: 'rate_per_hour', label: 'Rate / hour', kind: 'number' },
      { slug: 'rate_per_day', label: 'Rate / day', kind: 'number' },
      { slug: 'rate_per_week', label: 'Rate / week', kind: 'number' },
      { slug: 'notes', label: 'Notes', kind: 'long_text' }
    ]
  }

  let { data, form } = $props()
  let showCreate = $state(false)
  let saving = $state(false)

  // ── Bulk selection ──────────────────────────────────────────────
  let selectedIds = $state<Set<string>>(new Set())
  let filteredItems = $state<Item[]>([])
  let bulkBusy = $state(false)

  type BulkDialog = null | 'type' | 'location' | 'tracking' | 'gl' | 'tax' | 'active' | 'delete'
  let bulkDialog = $state<BulkDialog>(null)
  let bulkDeleteConfirm = $state('')

  // Per-action form values
  let bulkTypeId = $state('')
  let bulkLocationId = $state('')
  let bulkTrackingLocationId = $state('')
  let bulkTrackingOp = $state<'replace' | 'add'>('replace')
  let bulkTrackingIds = $state<string[]>([])
  let bulkGlCode = $state('')
  let bulkTaxCode = $state('')
  let bulkTaxPct = $state('')
  let bulkActive = $state<'true' | 'false'>('true')

  // Streaming progress (mirrors /people)
  type PhaseStatus = 'pending' | 'active' | 'done' | 'skipped' | 'error'
  type Phase = { key: string; label: string; status: PhaseStatus; detail?: string }
  let bulkPhases = $state<Phase[]>([])
  let bulkResult = $state<{ bulk_action_id: string | null; applied: number; ms: number; role?: string; skipped?: any } | null>(null)
  let bulkError = $state<ActionableError | string | null>(null)
  function errorTitle(e: ActionableError | string | null | undefined): string | undefined {
    if (e == null) return undefined
    return typeof e === 'string' ? e : e.title
  }
  let lastBulkActionId = $state<string | null>(null)
  let lastBulkSummary = $state<string | null>(null)
  let undoBusy = $state(false)

  function initPhases(applyingLabel = 'Applying changes') {
    bulkPhases = [
      { key: 'resolving', label: 'Looking up records', status: 'active' },
      { key: 'guarding',  label: 'Checking safety guards', status: 'pending' },
      { key: 'applying',  label: applyingLabel, status: 'pending' },
      { key: 'done',      label: 'Done', status: 'pending' }
    ]
  }
  function setPhase(key: string, status: PhaseStatus, detail?: string) {
    bulkPhases = bulkPhases.map(p => p.key === key ? { ...p, status, detail } : p)
  }
  function advancePast(key: string) {
    let seen = false
    bulkPhases = bulkPhases.map(p => {
      if (p.key === key) { seen = true; return p }
      if (!seen && (p.status === 'active' || p.status === 'pending')) return { ...p, status: 'done' }
      return p
    })
  }

  async function runBulkUpdate(
    patch: Record<string, unknown>,
    tracking_codes: { op: 'replace' | 'add', ids: string[] } | null,
    applyingLabel: string
  ) {
    if (selectedArr.length === 0) return
    bulkBusy = true
    bulkError = null
    bulkResult = null
    initPhases(applyingLabel)
    try {
      const body: Record<string, unknown> = { item_ids: selectedArr, patch }
      if (tracking_codes) body.tracking_codes = tracking_codes
      const res = await fetch('/api/admin/bulk-update-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let evt: any
          try { evt = JSON.parse(line) } catch { continue }
          handlePhase(evt)
        }
      }
    } catch (e: any) {
      bulkError = e?.message ?? String(e)
      setPhase('applying', 'error', errorTitle(bulkError))
    } finally {
      bulkBusy = false
    }
  }

  async function runBulkSoftDelete() {
    if (selectedArr.length === 0) return
    if (bulkDeleteConfirm !== 'DELETE') return
    bulkBusy = true
    bulkError = null
    bulkResult = null
    initPhases('Deleting items')
    try {
      const res = await fetch('/api/admin/bulk-soft-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'items', ids: selectedArr, confirm: 'DELETE' })
      })
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let evt: any
          try { evt = JSON.parse(line) } catch { continue }
          handlePhase(evt)
        }
      }
    } catch (e: any) {
      bulkError = e?.message ?? String(e)
      setPhase('applying', 'error', errorTitle(bulkError))
    } finally {
      bulkBusy = false
    }
  }

  function handlePhase(evt: any) {
    switch (evt.phase) {
      case 'resolving':
        setPhase('resolving', 'active', `${evt.selected} selected`)
        break
      case 'resolved':
        setPhase('resolving', 'done', `${evt.linked} found${evt.skipped_no_user ? `, ${evt.skipped_no_user} missing` : ''}`)
        setPhase('guarding', 'active')
        break
      case 'guarding':
        setPhase('guarding', evt.actionable === 0 ? 'skipped' : 'done',
          `${evt.actionable} actionable`)
        setPhase('applying', evt.actionable === 0 ? 'skipped' : 'active',
          evt.actionable === 0 ? 'nothing to apply' : undefined)
        break
      case 'applying':
        setPhase('applying', 'active', `→ ${evt.role} · ${evt.targets} item${evt.targets === 1 ? '' : 's'}`)
        break
      case 'done': {
        advancePast('done')
        setPhase('done', 'done', `${evt.applied} applied in ${evt.ms}ms`)
        bulkResult = evt
        lastBulkActionId = evt.bulk_action_id ?? null
        const headline = evt.message
          ?? (evt.applied > 0 ? `Updated ${evt.role} on ${evt.applied} item${evt.applied === 1 ? '' : 's'}` : 'Nothing applied')
        const parts = [
          headline,
          evt.skipped?.missing ? `${evt.skipped.missing} missing` : null,
          `${evt.ms}ms`
        ].filter(Boolean) as string[]
        lastBulkSummary = parts.join(' · ')
        invalidateAll()
        break
      }
      case 'error':
        bulkError = evt.error ?? 'Unknown error'
        setPhase('applying', 'error', errorTitle(bulkError))
        break
    }
  }

  function closeBulkDialog() {
    bulkDialog = null
    bulkPhases = []
    bulkResult = null
    bulkError = null
    bulkTypeId = ''
    bulkLocationId = ''
    bulkTrackingLocationId = ''
    bulkTrackingOp = 'replace'
    bulkTrackingIds = []
    bulkGlCode = ''
    bulkTaxCode = ''
    bulkTaxPct = ''
    bulkActive = 'true'
    bulkDeleteConfirm = ''
    // Selection is intentionally retained — user may want to chain further
    // bulk actions on the same set. Clear via the bulk-bar's "Clear" link.
  }

  async function undoLastBulk() {
    if (!lastBulkActionId) return
    undoBusy = true
    bulkError = null
    try {
      const res = await fetch('/api/admin/bulk-undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk_action_id: lastBulkActionId })
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `HTTP ${res.status}`)
      }
      const payload = await res.json().catch(() => ({}))
      lastBulkActionId = null
      bulkDialog = null
      bulkPhases = []
      bulkResult = null
      bulkError = null
      await invalidateAll()
      lastBulkSummary = `Undone — previous state restored${payload?.restored ? ` (${payload.restored} rows)` : ''}.`
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      bulkError = `Undo failed: ${msg}`
      lastBulkSummary = `Undo failed: ${msg}`
    } finally {
      undoBusy = false
    }
  }

  function toggleSelect(id: string, on: boolean) {
    const next = new Set(selectedIds)
    if (on) next.add(id); else next.delete(id)
    selectedIds = next
  }
  function selectAll() {
    selectedIds = new Set((data.items as Item[]).map(i => i.id))
  }
  function selectFound() {
    selectedIds = new Set(filteredItems.map(i => i.id))
  }
  function clearSelection() {
    selectedIds = new Set()
  }
  const selectedArr = $derived([...selectedIds])
  const selectedItems = $derived((data.items as Item[]).filter(i => selectedIds.has(i.id)))
  const selectedShareLocation = $derived.by(() => {
    if (selectedItems.length === 0) return null
    const first = selectedItems[0].location_id
    return selectedItems.every(i => i.location_id === first) ? first : null
  })

  type TabKey = 'properties' | 'metadata' | 'accounting'
  let createTab = $state<TabKey>('properties')

  let createLocationId = $state<string>('')
  let createCodeIds = $state<string[]>([])

  let createItemTypeId = $state<string>('')
  let createDetails = $state<Record<string, string>>({})

  $effect(() => {
    if (form?.success) { showCreate = false }
  })

  $effect(() => {
    const urlId = $page.url.searchParams.get('id')
    if (!urlId) return
    const exists = (data.items as Item[]).some(it => it.id === urlId)
    if (exists) goto(`/items/${urlId}?tab=properties`, { replaceState: true })
  })

  $effect(() => {
    if (!showCreate) {
      createLocationId = ''
      createCodeIds = []
      createItemTypeId = ''
      createDetails = {}
      createTab = 'properties'
    }
  })

  function codesForLocation(locId: string): TrackingCode[] {
    if (!locId) return []
    return (data.trackingCodes as TrackingCode[]).filter(c => c.location_id === locId)
  }

  function groupByCategory(codes: TrackingCode[]): { category: string; codes: TrackingCode[] }[] {
    const map = new Map<string, TrackingCode[]>()
    for (const c of codes) {
      const k = c.category ?? 'Uncategorised'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(c)
    }
    return [...map.entries()].map(([category, codes]) => ({ category, codes }))
  }

  const createCodeGroups = $derived(groupByCategory(codesForLocation(createLocationId)))

  function toggleCreateCode(id: string, checked: boolean) {
    if (checked) {
      if (!createCodeIds.includes(id)) createCodeIds = [...createCodeIds, id]
    } else {
      createCodeIds = createCodeIds.filter(x => x !== id)
    }
  }

  function onCreateLocationChange(v: string) {
    if (v !== createLocationId) {
      createLocationId = v
      createCodeIds = []
    }
  }

  function onCreateItemTypeChange(v: string) {
    if (v !== createItemTypeId) {
      const prev = slugForType(createItemTypeId)
      const next = slugForType(v)
      createItemTypeId = v
      if (prev !== next) createDetails = {}
    }
  }

  const itemTypeSlugById = $derived.by(() => {
    const m = new Map<string, TypeSlug>()
    for (const t of data.itemTypes as LookupOption[]) {
      if (t.slug && t.slug in TYPE_FIELDS) m.set(t.id, t.slug as TypeSlug)
    }
    return m
  })

  function slugForType(itemTypeId: string): TypeSlug | null {
    return itemTypeSlugById.get(itemTypeId) ?? null
  }

  const createSlug = $derived(slugForType(createItemTypeId))
  const createFields = $derived(createSlug ? (TYPE_FIELDS[createSlug] ?? []) : [])

  function fieldInputType(kind: FieldKind): string {
    if (kind === 'date') return 'date'
    return 'text'
  }
  function fieldStep(kind: FieldKind): string | undefined {
    return undefined
  }

  function randChoice<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
  function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
  function randDate(fromYear = 2015, toYear = 2025): string {
    const y = randInt(fromYear, toYear)
    const m = String(randInt(1, 12)).padStart(2, '0')
    const d = String(randInt(1, 28)).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  function randomValueFor(f: FieldDef): string {
    switch (f.kind) {
      case 'boolean': return Math.random() > 0.5 ? 'true' : 'false'
      case 'integer': return String(randInt(1, f.slug.includes('year') ? 2025 : 100))
      case 'number':  return String(randInt(10, 10000))
      case 'date':    return randDate(2015, 2025)
      case 'enum':    return randChoice(f.options ?? [''])
      case 'long_text': return randChoice([
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        'Sample placeholder text for testing.',
        'Notes captured during the demo session.'
      ])
      default: return randChoice(['Sample', 'Demo entry', 'Test value', 'Generated'])
    }
  }

  function randomDetailsFor(slug: TypeSlug): Record<string, string> {
    if (slug === 'art') return randomArtDetails()
    const out: Record<string, string> = {}
    for (const f of (TYPE_FIELDS[slug] ?? [])) out[f.slug] = randomValueFor(f)
    return out
  }

  function randomArtDetails(): Record<string, string> {
    const artists = ['Van Gogh','Picasso','Frida Kahlo','David Goldblatt','William Kentridge','Irma Stern','Gerard Sekoto','Marlene Dumas','Zanele Muholi','Esther Mahlangu']
    const mediums = ['Oil on canvas','Acrylic on canvas','Mixed media','Photography','Bronze sculpture','Watercolour','Charcoal on paper','Digital print','Screen print']
    const statuses = ['in_storage','on_display','on_loan','sold','returned']
    const status = randChoice(statuses)
    const sold = status === 'sold'
    return {
      artist_name: randChoice(artists),
      medium: randChoice(mediums),
      dimensions_height_cm: String(randInt(20, 300)),
      dimensions_width_cm: String(randInt(20, 300)),
      dimensions_depth_cm: String(randInt(2, 15)),
      year_created: String(randInt(1900, 2025)),
      edition_number: String(randInt(1, 20)),
      edition_size: String(randInt(20, 100)),
      framed: Math.random() > 0.3 ? 'true' : 'false',
      insurance_value: String(randInt(50000, 5000000)),
      acquisition_cost: String(randInt(20000, 2000000)),
      acquired_at: randDate(2015, 2025),
      consignment: Math.random() > 0.6 ? 'true' : 'false',
      consignment_commission_percent: String(randInt(10, 45)),
      list_price: String(randInt(80000, 8000000)),
      status,
      sold_at: sold ? randDate(2020, 2025) : '',
      sold_price: sold ? String(randInt(100000, 10000000)) : '',
      condition_notes: randChoice([
        'Excellent condition; no visible damage.',
        'Minor surface scratches on frame.',
        'Colour fading on lower third — professional restoration recommended.',
        'Pristine — provenance fully documented.',
        'Small tear repaired in 2022.'
      ]),
      provenance: randChoice([
        'Acquired directly from the artist; prior exhibition at Zeitz MOCAA 2021.',
        'Private collection, Johannesburg → Stevenson Gallery → Proximity Green.',
        'Estate of the artist via executor; documented in catalogue raisonné.',
        'Purchased at Strauss & Co auction, Lot 147, 2023.'
      ])
    }
  }

  function fmtNum(s: string): string {
    if (!s || s === '-') return s
    const hasDot = s.includes('.')
    const [intPart, fracPart] = s.split('.')
    const isNeg = intPart.startsWith('-')
    const digits = intPart.replace(/-/g, '')
    if (!digits) return hasDot ? (isNeg ? '-' : '') + '.' + (fracPart ?? '') : s
    const n = Number(digits)
    if (!isFinite(n)) return s
    const formatted = (isNeg ? '-' : '') + n.toLocaleString('en-US')
    return hasDot ? `${formatted}.${fracPart ?? ''}` : formatted
  }

  function onNumInput(e: Event, setter: (v: string) => void) {
    const el = e.currentTarget as HTMLInputElement
    const before = el.value
    const caret = el.selectionStart ?? before.length
    const commasBefore = (before.slice(0, caret).match(/,/g) ?? []).length
    const stripped = before.replace(/,/g, '').replace(/[^0-9.\-]/g, '')
    setter(stripped)
    const next = fmtNum(stripped)
    queueMicrotask(() => {
      const rawCaret = caret - commasBefore
      let seen = 0, pos = 0
      for (; pos < next.length && seen < rawCaret; pos++) {
        if (next[pos] !== ',') seen++
      }
      try { el.setSelectionRange(pos, pos) } catch {}
    })
  }
  function enumOptions(f: FieldDef) {
    return [
      { value: '', label: '—' },
      ...((f.options ?? []).map(o => ({ value: o, label: o })))
    ]
  }
  function isChecked(v: string | undefined): boolean {
    return v === 'true'
  }

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const yesNo = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' }
  ]

  const itemTypeOptions = $derived(
    [...(data.itemTypes as LookupOption[])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({ value: t.id, label: t.name }))
  )
  const locationOptions = $derived([
    { value: '', label: 'None' },
    ...(data.locations as LookupOption[]).map(l => ({ value: l.id, label: l.name }))
  ])

  const fmtPrice = fmtMoney

  // itemTrackingCodeIds is streamed from the server — start empty and fill in
  // when the link map resolves so the table paints immediately.
  let itemTrackingCodeIds = $state<Record<string, string[]>>({})
  $effect(() => {
    Promise.resolve(data.itemTrackingCodeIds).then(v => { itemTrackingCodeIds = v ?? {} })
  })

  // Ids of items currently on a signed subscription line — streamed so the
  // filter count updates as soon as the promise resolves.
  let activeSubItemIds = $state<Set<string>>(new Set())
  $effect(() => {
    Promise.resolve(data.activeSubItemIds).then(v => { activeSubItemIds = new Set(v ?? []) })
  })

  const trackingCodesById = $derived.by(() => {
    const map = new Map<string, TrackingCode>()
    for (const c of (data.trackingCodes as TrackingCode[])) map.set(c.id, c)
    return map
  })

  function itemTrackingCodeLabels(itemId: string): string[] {
    const ids = itemTrackingCodeIds[itemId] ?? []
    return ids.map(id => {
      const c = trackingCodesById.get(id)
      return c ? c.code : ''
    }).filter(Boolean)
  }

  // Stable function refs so DataTable doesn't see "new" props on every tab click.
  function onRowClick(i: Item) {
    goto(`/items/${i.id}?tab=properties`)
  }

  function fmtTax(i: Item): string {
    const code = i.accounting_tax_code ?? ''
    const pct  = i.accounting_tax_percentage
    if (!code && pct == null) return ''
    if (code && pct != null) return `${code} ${pct}%`
    return code || `${pct}%`
  }

  const columns: Column<Item>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '18%' },
    { key: 'item_type_name', label: 'Type', sortable: true, width: '10%', muted: true, get: i => i.item_type_name ?? '' },
    { key: 'accounting_gl_code', label: 'GL Code', sortable: true, width: '9%', mono: true, muted: true, hideBelow: 'md', get: i => i.accounting_gl_code ?? '' },
    { key: 'location_name', label: 'Location', sortable: true, width: '13%', muted: true, hideBelow: 'md', get: i => i.location_name ?? '' },
    { key: 'tracking_codes', label: 'Tracking Codes', width: '13%', muted: true, hideBelow: 'md',
      get: i => itemTrackingCodeLabels(i.id).join(', '),
      render: i => itemTrackingCodeLabels(i.id).join(', ') || '' },
    { key: 'accounting_tax_code', label: 'Tax', sortable: true, width: '9%', mono: true, muted: true, hideBelow: 'md', get: i => fmtTax(i), render: i => fmtTax(i) },
    { key: 'base_rate', label: 'Rate', sortable: true, width: '10%', align: 'right', mono: true, get: i => i.base_rate ?? null, render: i => fmtPrice(i.base_rate) },
    { key: 'active', label: 'Active', sortable: true, width: '8%' }
  ]

  const filters: Filter<Item>[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active only', test: i => i.active },
    { key: 'no_codes', label: 'No tracking codes', test: i => (itemTrackingCodeIds[i.id]?.length ?? 0) === 0 },
    { key: 'on_subs', label: 'On active subs', test: i => activeSubItemIds.has(i.id) },
    {
      kind: 'select',
      key: 'type',
      label: 'Type',
      multi: true,
      // Faceted: only show types that exist in the rows reachable under the
      // other active filters.
      options: (_state, available) => {
        const seen = new Set<string>()
        for (const i of available as Item[]) if (i.item_type_slug) seen.add(i.item_type_slug)
        return [...(data.itemTypes as LookupOption[])]
          .filter(t => seen.has(t.slug ?? ''))
          .map(t => ({ value: t.slug ?? t.id, label: t.name }))
          .sort((a, b) => a.label.localeCompare(b.label))
      },
      test: (item, vals) => !!item.item_type_slug && vals.includes(item.item_type_slug)
    },
    {
      kind: 'select',
      key: 'location',
      label: 'Location',
      // Faceted: only show locations that have at least one row under the
      // other active filters.
      options: (_state, available) => {
        const seen = new Set<string>()
        for (const i of available as Item[]) if (i.location_id) seen.add(i.location_id)
        return (data.locations as LookupOption[])
          .filter(l => seen.has(l.id))
          .map(l => ({ value: l.id, label: l.name }))
          .sort((a, b) => a.label.localeCompare(b.label))
      },
      test: (item, vals) => !!item.location_id && vals.includes(item.location_id)
    },
    {
      kind: 'select',
      key: 'tracking',
      label: 'Tracking code',
      multi: true,
      // Faceted: only show tracking codes attached to rows reachable under
      // the other active filters.
      options: (_state, available) => {
        const seen = new Set<string>()
        for (const i of available as Item[]) {
          const ids = itemTrackingCodeIds[i.id] ?? []
          for (const id of ids) seen.add(id)
        }
        return (data.trackingCodes as TrackingCode[])
          .filter(c => seen.has(c.id))
          .map(c => ({ value: c.id, label: `${c.code} · ${c.name}` }))
          .sort((a, b) => a.label.localeCompare(b.label))
      },
      test: (item, vals) => {
        const ids = itemTrackingCodeIds[item.id] ?? []
        return ids.some(id => vals.includes(id))
      }
    }
  ]
</script>

<PageHead title="Items" lede="Unified catalog — spaces, memberships, products, services, art, assets. One row per sellable thing.">
  {#if can('items', 'create')}
    <Button size="sm" onclick={() => { showCreate = !showCreate }}>
      {showCreate ? 'Cancel' : '+ Add Item'}
    </Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

{#if showCreate && can('items', 'create')}
  <div class="create-wrap">
    <FormCard
      action="?/create"
      id="create-item-form"
      onSubmit={() => { saving = true }}
      onResult={() => { saving = false }}
    >
      <nav class="tabs" aria-label="Item form sections">
        <button type="button" class="tab" class:is-active={createTab === 'properties'} onclick={() => createTab = 'properties'}>Properties</button>
        <button type="button" class="tab" class:is-active={createTab === 'metadata'} onclick={() => createTab = 'metadata'}>Meta Data</button>
        <button type="button" class="tab" class:is-active={createTab === 'accounting'} onclick={() => createTab = 'accounting'}>Accounting</button>
      </nav>

      <!-- TAB 1: PROPERTIES -->
      <div class="tab-pane" class:is-active={createTab === 'properties'}>
        <FieldGrid cols={2}>
          <Field label="Item Type">
            <Select
              name="item_type_id"
              value={createItemTypeId}
              options={itemTypeOptions}
              placeholder="Select type…"
              required
              onchange={onCreateItemTypeChange}
            />
          </Field>
          <Field label="Location">
            <Select
              name="location_id"
              value={createLocationId}
              options={locationOptions}
              onchange={onCreateLocationChange}
            />
          </Field>
        </FieldGrid>

        {#if createLocationId}
          <div class="sub-loc-under">
            <span class="sub-loc-label">Sub-locations</span>
            <div class="sub-loc-wrap">
              {#if createCodeGroups.length === 0}
                <p class="sub-loc-empty">No tracking or sub-locations defined for this location. Add them on the location detail page.</p>
              {:else}
                {#each createCodeGroups as group (group.category)}
                  <div class="provider-group">
                    <div class="provider-header">{group.category}</div>
                    <div class="code-grid">
                      {#each group.codes as tc (tc.id)}
                        <label class="code-row">
                          <input
                            type="checkbox"
                            name="tracking_code_ids"
                            value={tc.id}
                            checked={createCodeIds.includes(tc.id)}
                            onchange={(e) => toggleCreateCode(tc.id, (e.currentTarget as HTMLInputElement).checked)}
                          />
                          <span class="code">{tc.code}</span>
                          <span class="sep">·</span>
                          <span class="name">{tc.name}</span>
                          {#if tc.is_primary}<span class="primary-flag">Primary</span>{/if}
                        </label>
                      {/each}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/if}

        <FieldGrid cols={3}>
          <Field name="name" label="Name" required />
          <Field name="base_rate" label="Base Rate" type="number" placeholder="0.00" />
          <Field label="Active">
            <Select name="active" value="true" options={yesNo} />
          </Field>
        </FieldGrid>
        <FieldGrid cols={1}>
          <Field name="description" label="Description" />
        </FieldGrid>
      </div>

      <!-- TAB 2: META DATA -->
      <div class="tab-pane" class:is-active={createTab === 'metadata'}>
        <FieldGrid cols={2}>
          <Field label="Item Type">
            <Select
              value={createItemTypeId}
              options={itemTypeOptions}
              placeholder="Select type…"
              onchange={onCreateItemTypeChange}
            />
          </Field>
        </FieldGrid>
        {#if createSlug && createFields.length > 0}
          <div class="meta-head">
            <h3 class="section-title">{createSlug.replace(/_/g, ' ')} details</h3>
            <Button variant="ghost" size="sm" type="button"
              onclick={() => { if (createSlug) createDetails = randomDetailsFor(createSlug) }}>
              🎲 Randomise
            </Button>
          </div>
          <FieldGrid cols={2}>
            {#each createFields as f (f.slug)}
              {#if f.kind === 'boolean'}
                <label class="bool-row">
                  <input
                    type="checkbox"
                    name={`detail_${f.slug}`}
                    value="true"
                    checked={isChecked(createDetails[f.slug])}
                    onchange={(e) => {
                      createDetails[f.slug] = (e.currentTarget as HTMLInputElement).checked ? 'true' : 'false'
                    }}
                  />
                  <span class="bool-label">{f.label}</span>
                </label>
              {:else if f.kind === 'long_text'}
                <Field label={f.label} full>
                  <textarea
                    name={`detail_${f.slug}`}
                    rows="3"
                    value={createDetails[f.slug] ?? ''}
                    oninput={(e) => { createDetails[f.slug] = (e.currentTarget as HTMLTextAreaElement).value }}
                  ></textarea>
                </Field>
              {:else if f.kind === 'enum'}
                <Field label={f.label}>
                  <Select
                    name={`detail_${f.slug}`}
                    value={createDetails[f.slug] ?? ''}
                    options={enumOptions(f)}
                    onchange={(v) => { createDetails[f.slug] = v }}
                  />
                </Field>
              {:else if (f.kind === 'number' || f.kind === 'integer') && !f.noSeparator}
                <Field label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                  <input
                    name={`detail_${f.slug}`}
                    type="text"
                    inputmode="decimal"
                    value={fmtNum(createDetails[f.slug] ?? '')}
                    oninput={(e) => onNumInput(e, (v) => createDetails[f.slug] = v)}
                    autocomplete="off"
                  />
                </Field>
              {:else}
                <Field label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                  <input
                    name={`detail_${f.slug}`}
                    type={fieldInputType(f.kind)}
                    step={fieldStep(f.kind)}
                    value={createDetails[f.slug] ?? ''}
                    oninput={(e) => { createDetails[f.slug] = (e.currentTarget as HTMLInputElement).value }}
                    autocomplete="off"
                  />
                </Field>
              {/if}
            {/each}
          </FieldGrid>
        {:else if !createItemTypeId}
          <p class="sub-loc-empty">Pick an item type on the Properties tab to see per-type fields.</p>
        {:else}
          <p class="sub-loc-empty">No meta fields for this type.</p>
        {/if}
      </div>

      <!-- TAB 3: ACCOUNTING -->
      <div class="tab-pane" class:is-active={createTab === 'accounting'}>
        <FieldGrid cols={2}>
          <Field name="accounting_gl_code" label="GL Code" />
          <Field name="accounting_item_code" label="Item Code" />
          <Field name="accounting_tax_code" label="Tax Code" />
          <Field
            name="accounting_tax_percentage"
            label="Tax %"
            type="number"
            placeholder="e.g. 15.00"
          />
          <Field
            name="accounting_description"
            label="Invoice Description Override"
          />
        </FieldGrid>
      </div>

      {#snippet actions()}
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Create Item'}</Button>
      {/snippet}
    </FormCard>
  </div>
{/if}

{#if (can('bulk_actions', 'update_items') || can('bulk_actions', 'delete_items')) && (selectedIds.size > 0 || (filteredItems.length > 0 && filteredItems.length !== (data.items as Item[]).length))}
  <div class="bulk-bar" role="region" aria-label="Bulk actions">
    <div class="bulk-count">
      {#if selectedIds.size > 0}
        <strong>{selectedIds.size}</strong> selected
        <span class="bulk-sep">·</span>
        <button type="button" class="bulk-link" onclick={clearSelection}>Clear</button>
      {:else}
        <span class="muted">No selection</span>
        <span class="bulk-sep">·</span>
      {/if}
      <button type="button" class="bulk-link" onclick={selectAll}>
        Select all ({(data.items as Item[]).length} records)
      </button>
      {#if filteredItems.length > 0 && filteredItems.length !== (data.items as Item[]).length}
        <button type="button" class="bulk-link" onclick={selectFound}>
          Select filtered ({filteredItems.length} records)
        </button>
      {/if}
    </div>
    <div class="bulk-actions">
      {#if can('bulk_actions', 'update_items')}
        <Button size="sm" variant="secondary" disabled={selectedIds.size === 0} onclick={() => (bulkDialog = 'type')}>Set type…</Button>
        <Button size="sm" variant="secondary" disabled={selectedIds.size === 0} onclick={() => (bulkDialog = 'location')}>Set location…</Button>
        <Button size="sm" variant="secondary" disabled={selectedIds.size === 0}
                onclick={async () => {
                  bulkTrackingLocationId = selectedShareLocation ?? ''
                  bulkDialog = 'tracking'
                  // Refresh tracking-codes lookup in case it was edited in another tab.
                  await invalidateAll()
                }}>
          Set tracking codes…
        </Button>
        <Button size="sm" variant="secondary" disabled={selectedIds.size === 0} onclick={() => (bulkDialog = 'gl')}>Set GL code…</Button>
        <Button size="sm" variant="secondary" disabled={selectedIds.size === 0} onclick={() => (bulkDialog = 'tax')}>Set tax…</Button>
        <Button size="sm" variant="secondary" disabled={selectedIds.size === 0} onclick={() => (bulkDialog = 'active')}>Set active…</Button>
      {/if}
      {#if can('bulk_actions', 'delete_items')}
        <button type="button" class="bulk-delete-btn" disabled={selectedIds.size === 0}
                onclick={() => { bulkDeleteConfirm = ''; bulkDialog = 'delete' }}>
          <span aria-hidden="true">⚠</span> Delete…
        </button>
      {/if}
    </div>
  </div>
{/if}

<DataTable
  data={data.items as Item[]}
  {columns}
  {filters}
  table="items"
  title="Items"
  lede="Unified catalog — spaces, memberships, products, services, art, assets."
  searchFields={['name', 'accounting_gl_code', 'description', 'item_type_name', 'location_name']}
  searchPlaceholder="Search name, GL Code, type, location…"
  csvFilename="items"
  empty="No items yet."
  onFilteredChange={(rows) => (filteredItems = rows as Item[])}
  onFiltersChanged={clearSelection}
  {onRowClick}
>
  {#snippet row(item)}
    <td class="name-cell">
      {#if can('bulk_actions', 'update_items') || can('bulk_actions', 'delete_items')}
        <label class="row-check-wrap" onclick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            class="row-check"
            checked={selectedIds.has(item.id)}
            onchange={(e) => toggleSelect(item.id, (e.currentTarget as HTMLInputElement).checked)}
            aria-label={`Select ${item.name}`}
          />
        </label>
      {/if}
      <span class="name">{item.name}</span>
    </td>
    <td class="muted">{item.item_type_name ?? '—'}</td>
    <td class="muted mono hide-md">{item.accounting_gl_code ?? '—'}</td>
    <td class="muted hide-md">
      {#if item.location_id && item.location_name && can('locations')}
        <a class="row-link" href={`/locations/${item.location_id}?tab=properties`} onclick={(e) => e.stopPropagation()}>{item.location_name}</a>
      {:else}
        {item.location_name ?? '—'}
      {/if}
    </td>
    <td class="hide-md tc-cell">
      {#each itemTrackingCodeLabels(item.id) as code}
        <Badge tone="default">{code}</Badge>
      {:else}
        <span class="muted">—</span>
      {/each}
    </td>
    <td class="muted mono hide-md">{fmtTax(item) || '—'}</td>
    <td class="mono price">{fmtPrice(item.base_rate)}</td>
    <td>
      {#if item.active}
        <Badge tone="success">Active</Badge>
      {:else}
        <Badge tone="default">Inactive</Badge>
      {/if}
    </td>
  {/snippet}
  {#snippet pageActions()}
    {#if can('items', 'create')}
      <Button size="sm" onclick={() => { showCreate = !showCreate }}>
        {showCreate ? 'Cancel' : '+ Add Item'}
      </Button>
    {/if}
  {/snippet}
</DataTable>

{#snippet phaseList()}
  <ul class="phase-list" aria-live="polite">
    {#each bulkPhases as p (p.key)}
      <li class="phase phase-{p.status}">
        <span class="phase-icon" aria-hidden="true">
          {#if p.status === 'done'}✓{:else if p.status === 'active'}<span class="spin"></span>{:else if p.status === 'error'}!{:else if p.status === 'skipped'}–{:else}·{/if}
        </span>
        <span class="phase-label">{p.label}</span>
        {#if p.detail}<span class="phase-detail">{p.detail}</span>{/if}
      </li>
    {/each}
  </ul>
  {#if bulkResult && !bulkError}
    <div class="phase-summary ok">
      <strong>{bulkResult.applied}</strong> item{bulkResult.applied === 1 ? '' : 's'} updated · <span class="muted">{bulkResult.ms}ms</span>
      {#if bulkResult.bulk_action_id}
        <Button size="xs" variant="ghost" onclick={undoLastBulk} disabled={undoBusy} loading={undoBusy}>Undo</Button>
      {/if}
    </div>
  {/if}
  {#if bulkError}
    <ErrorBanner error={bulkError} showRaw />
  {/if}
{/snippet}

<Modal open={bulkDialog === 'type'}
       title={`Set item type on ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
       onClose={closeBulkDialog}
       busy={bulkBusy}
       width="460px"
       minHeight="240px">
  <p class="muted small">Changes <code>item_type_id</code>. Per-type detail rows are not auto-migrated — you may need to refill metadata after.</p>
  {#if bulkPhases.length === 0}
    <Field label="Item type">
      <Select value={bulkTypeId} placeholder="Select type…" onchange={(v) => (bulkTypeId = v)} options={itemTypeOptions} />
    </Field>
  {:else}
    {@render phaseList()}
  {/if}
  {#snippet footer()}
    {#if bulkPhases.length === 0}
      <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
      <Button size="sm" onclick={() => runBulkUpdate({ item_type_id: bulkTypeId }, null, 'Setting type')} disabled={!bulkTypeId || bulkBusy}>Apply</Button>
    {:else}
      <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Close'}</Button>
    {/if}
  {/snippet}
</Modal>

<Modal open={bulkDialog === 'location'}
       title={`Set location on ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
       onClose={closeBulkDialog}
       busy={bulkBusy}
       width="460px"
       minHeight="240px">
  <p class="muted small"><strong>Heads-up:</strong> changing location wipes existing tracking codes (they're location-scoped). You can reassign tracking codes after.</p>
  {#if bulkPhases.length === 0}
    <Field label="Location">
      <Select value={bulkLocationId} options={locationOptions} onchange={(v) => (bulkLocationId = v)} />
    </Field>
  {:else}
    {@render phaseList()}
  {/if}
  {#snippet footer()}
    {#if bulkPhases.length === 0}
      <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
      <Button size="sm" onclick={() => runBulkUpdate({ location_id: bulkLocationId || null }, null, 'Setting location')} disabled={bulkBusy}>Apply</Button>
    {:else}
      <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Close'}</Button>
    {/if}
  {/snippet}
</Modal>

<Modal open={bulkDialog === 'tracking'}
       title={`Set tracking codes on ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
       onClose={closeBulkDialog}
       busy={bulkBusy}
       width="640px"
       minHeight="320px">
  {#if !selectedShareLocation}
    <p class="muted small"><strong>Selected items span multiple locations.</strong> Pick the location whose tracking codes to apply — items on other locations will be skipped.</p>
  {:else}
    <p class="muted small">All selected items are at this location — only its tracking codes can be applied.</p>
  {/if}
  {#if bulkPhases.length === 0}
    <FieldGrid cols={2}>
      <Field label="Location">
        <Select value={bulkTrackingLocationId} options={locationOptions} disabled={!!selectedShareLocation} onchange={(v) => { bulkTrackingLocationId = v; bulkTrackingIds = [] }} />
      </Field>
      <Field label="Mode">
        <Select value={bulkTrackingOp} options={[{ value: 'replace', label: 'Replace existing' }, { value: 'add', label: 'Add to existing' }]} onchange={(v) => (bulkTrackingOp = v as 'replace' | 'add')} />
      </Field>
    </FieldGrid>
    {#if bulkTrackingLocationId}
      {@const groups = groupByCategory(codesForLocation(bulkTrackingLocationId))}
      <div class="sub-loc-wrap tracking-list" style="margin-top: var(--space-3)">
        {#if groups.length === 0}
          <p class="sub-loc-empty">
            No tracking codes defined for this location.
            {#if can('locations', 'update')}
              <a href={`/locations/${bulkTrackingLocationId}?tab=tracking`} target="_blank" rel="noopener">Define codes →</a>
            {/if}
          </p>
        {:else}
          {#each groups as group (group.category)}
            <div class="provider-group">
              <div class="provider-header">{group.category}</div>
              <div class="code-grid">
                {#each group.codes as tc (tc.id)}
                  <label class="code-row">
                    <input
                      type="checkbox"
                      checked={bulkTrackingIds.includes(tc.id)}
                      onchange={(e) => {
                        const on = (e.currentTarget as HTMLInputElement).checked
                        if (on) bulkTrackingIds = [...bulkTrackingIds, tc.id]
                        else bulkTrackingIds = bulkTrackingIds.filter(x => x !== tc.id)
                      }}
                    />
                    <span class="code">{tc.code}</span>
                    <span class="sep">·</span>
                    <span class="name">{tc.name}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  {:else}
    {@render phaseList()}
  {/if}
  {#snippet footer()}
    {#if bulkPhases.length === 0}
      <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
      {@const _availCodes = bulkTrackingLocationId ? codesForLocation(bulkTrackingLocationId).length : 0}
      <Button size="sm"
              onclick={() => runBulkUpdate({}, { op: bulkTrackingOp, ids: bulkTrackingIds }, `${bulkTrackingOp === 'replace' ? 'Replacing' : 'Adding'} tracking codes`)}
              disabled={bulkBusy || !bulkTrackingLocationId || _availCodes === 0 || (bulkTrackingOp === 'add' && bulkTrackingIds.length === 0)}>Apply</Button>
    {:else}
      <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Close'}</Button>
    {/if}
  {/snippet}
</Modal>

<Modal open={bulkDialog === 'gl'}
       title={`Set GL code on ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
       onClose={closeBulkDialog}
       busy={bulkBusy}
       width="460px"
       minHeight="220px">
  {#if bulkPhases.length === 0}
    <Field label="GL code">
      <input type="text" class="plain-input" bind:value={bulkGlCode} placeholder="e.g. 2140" autofocus />
    </Field>
  {:else}
    {@render phaseList()}
  {/if}
  {#snippet footer()}
    {#if bulkPhases.length === 0}
      <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
      <Button size="sm" onclick={() => runBulkUpdate({ accounting_gl_code: bulkGlCode.trim() || null }, null, 'Setting GL code')} disabled={bulkBusy}>Apply</Button>
    {:else}
      <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Close'}</Button>
    {/if}
  {/snippet}
</Modal>

<Modal open={bulkDialog === 'tax'}
       title={`Set tax on ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
       onClose={closeBulkDialog}
       busy={bulkBusy}
       width="500px"
       minHeight="240px">
  <p class="muted small">Sets tax code and/or tax percentage. Leave a field blank to skip it.</p>
  {#if bulkPhases.length === 0}
    <FieldGrid cols={2}>
      <Field label="Tax code">
        <input type="text" class="plain-input" bind:value={bulkTaxCode} placeholder="e.g. VAT" />
      </Field>
      <Field label="Tax %">
        <input type="text" inputmode="decimal" class="plain-input" bind:value={bulkTaxPct} placeholder="e.g. 15.00" />
      </Field>
    </FieldGrid>
  {:else}
    {@render phaseList()}
  {/if}
  {#snippet footer()}
    {#if bulkPhases.length === 0}
      <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
      <Button size="sm"
              onclick={() => {
                const patch: Record<string, unknown> = {}
                if (bulkTaxCode.trim()) patch.accounting_tax_code = bulkTaxCode.trim()
                if (bulkTaxPct.trim())  patch.accounting_tax_percentage = Number(bulkTaxPct)
                if (Object.keys(patch).length === 0) { bulkError = 'Enter a tax code or %'; return }
                runBulkUpdate(patch, null, 'Setting tax')
              }}
              disabled={bulkBusy || (!bulkTaxCode.trim() && !bulkTaxPct.trim())}>Apply</Button>
    {:else}
      <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Close'}</Button>
    {/if}
  {/snippet}
</Modal>

<Modal open={bulkDialog === 'active'}
       title={`Set active on ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
       onClose={closeBulkDialog}
       busy={bulkBusy}
       width="420px"
       minHeight="220px">
  {#if bulkPhases.length === 0}
    <Field label="Active">
      <Select value={bulkActive} options={yesNo} onchange={(v) => (bulkActive = v as 'true' | 'false')} />
    </Field>
  {:else}
    {@render phaseList()}
  {/if}
  {#snippet footer()}
    {#if bulkPhases.length === 0}
      <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
      <Button size="sm" onclick={() => runBulkUpdate({ active: bulkActive === 'true' }, null, `Setting active ${bulkActive}`)} disabled={bulkBusy}>Apply</Button>
    {:else}
      <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Close'}</Button>
    {/if}
  {/snippet}
</Modal>

<Modal open={bulkDialog === 'delete'}
       title={`Delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
       onClose={closeBulkDialog}
       busy={bulkBusy}
       width="500px"
       minHeight="280px">
  {#if bulkPhases.length === 0}
    <div class="danger-banner">
      <span class="danger-icon" aria-hidden="true">⚠</span>
      <div>
        <strong>This will soft-delete {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'}.</strong>
        <p class="muted small">Deleted items hide from all lists but remain recoverable via undo or admin trash for 90 days, after which they are permanently purged.</p>
      </div>
    </div>
    <Field label='Type DELETE to confirm'>
      <input
        type="text"
        class="delete-confirm-input"
        bind:value={bulkDeleteConfirm}
        placeholder="DELETE"
        autocomplete="off"
        spellcheck="false"
      />
    </Field>
  {:else}
    {@render phaseList()}
  {/if}
  {#snippet footer()}
    {#if bulkPhases.length === 0}
      <Button variant="ghost" size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>Cancel</Button>
      <button type="button" class="danger-apply" disabled={bulkBusy || bulkDeleteConfirm !== 'DELETE'} onclick={runBulkSoftDelete}>
        Delete {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'}
      </button>
    {:else}
      <Button size="sm" onclick={closeBulkDialog} disabled={bulkBusy}>{bulkBusy ? 'Deleting…' : 'Close'}</Button>
    {/if}
  {/snippet}
</Modal>

{#if lastBulkSummary && !bulkDialog}
  <div class="bulk-flash" role="status">
    <span>{lastBulkSummary}</span>
    {#if lastBulkActionId}
      <Button size="xs" variant="ghost" onclick={undoLastBulk} disabled={undoBusy} loading={undoBusy}>Undo</Button>
    {/if}
    <button type="button" class="bulk-flash-close" onclick={() => (lastBulkSummary = null)} aria-label="Dismiss">×</button>
  </div>
{/if}

<style>
  .create-wrap { margin-bottom: var(--space-6); }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-5);
  }
  :global([data-theme='w17']) .tabs {
    border-bottom: 1px solid #dee2e6 !important;
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .tab {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-muted);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
    cursor: pointer;
    transition: color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out);
  }
  .tab:hover { color: var(--text); }
  .tab.is-active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    font-weight: var(--weight-semibold);
  }

  .tab-pane { display: none; }
  .tab-pane.is-active { display: block; }

  .row-link {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px dashed transparent;
    transition: border-color 120ms ease;
  }
  .row-link:hover { border-bottom-color: var(--accent); }
  .name {
    font-weight: var(--weight-medium);
    color: var(--text);
  }
  .price {
    text-align: right;
    white-space: nowrap;
  }
  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }
  .meta-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .meta-head .section-title { margin: 0; }
  .json {
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow-x: auto;
    margin: 0;
  }
  .empty-meta {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin: 0;
  }

  .sub-loc-under {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: var(--space-3);
  }
  .sub-loc-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .sub-loc-label {
    font-size: 11px;
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--label-color);
  }
  .sub-loc-empty {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin: 0;
  }
  .primary-flag {
    font-size: 10px;
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    margin-left: var(--space-1);
  }
  .provider-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .provider-header {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide, 0.06em);
  }
  .code-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-1) var(--space-3);
  }
  .code-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text);
    padding: 2px 0;
    cursor: pointer;
    line-height: 1.2;
  }
  .code-row input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
  }
  .code-row .code {
    font-family: var(--font-mono);
    font-weight: var(--weight-medium);
  }
  .code-row .sep {
    color: var(--text-muted);
  }
  .code-row .name {
    color: var(--text);
  }

  .bool-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text);
    padding: 6px 0;
    cursor: pointer;
  }
  .bool-row input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
  }
  .bool-row .bool-label {
    font-weight: var(--weight-medium);
  }
  textarea {
    padding: 0.4rem 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-normal);
    resize: vertical;
  }
  textarea:focus {
    outline: none;
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  @media (max-width: 640px) { .hide-sm { display: none; } }
  @media (max-width: 900px) { .hide-md { display: none; } }

  /* ── Bulk actions ───────────────────────────────────────────────── */
  .bulk-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 10px 14px;
    margin-bottom: var(--space-3);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
    border-radius: var(--radius-md);
    position: sticky;
    top: var(--topnav-height, 0);
    z-index: 20;
    box-shadow: 0 2px 10px rgba(0,0,0,0.04);
  }
  .bulk-count {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: var(--text-sm);
    color: var(--text);
    flex-wrap: wrap;
  }
  .bulk-count strong { font-weight: var(--weight-bold); color: var(--accent); }
  .bulk-link {
    background: none;
    border: none;
    color: var(--accent);
    font-size: var(--text-sm);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .bulk-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }
  .bulk-delete-btn {
    margin-left: auto;
    height: 28px;
    padding: 0 0.9rem;
    border: 1px solid var(--danger, #c0392b);
    background: transparent;
    color: var(--danger, #c0392b);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
  }
  .bulk-delete-btn:hover:not(:disabled) {
    background: var(--danger, #c0392b);
    color: var(--surface, #fff);
  }
  .bulk-delete-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .danger-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    margin-bottom: var(--space-3);
    background: color-mix(in srgb, var(--danger, #c0392b) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger, #c0392b) 25%, transparent);
    border-radius: var(--radius-md, 6px);
  }
  .danger-icon {
    color: var(--danger, #c0392b);
    font-size: 1.4em;
    line-height: 1;
  }
  .danger-banner strong { color: var(--danger, #c0392b); }
  .danger-banner p { margin: 4px 0 0 0; }

  .delete-confirm-input {
    width: 100%;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 6px);
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-sm);
    letter-spacing: 0.06em;
  }
  .delete-confirm-input:focus {
    outline: none;
    border-color: var(--danger, #c0392b);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger, #c0392b) 20%, transparent);
  }

  .danger-apply {
    height: 32px;
    padding: 0 1rem;
    border: 1px solid var(--danger, #c0392b);
    background: var(--danger, #c0392b);
    color: var(--surface, #fff);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: opacity var(--motion-fast) var(--ease-out);
  }
  .danger-apply:hover:not(:disabled) { opacity: 0.9; }
  .danger-apply:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-check-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 10px;
    margin: -8px -6px -8px -10px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .row-check {
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: var(--accent);
    flex-shrink: 0;
  }

  .tracking-list {
    max-height: 40vh;
    overflow-y: auto;
  }

  .plain-input {
    display: block;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    font-size: 14px;
    font-family: inherit;
  }
  .plain-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }

  .phase-list {
    list-style: none;
    margin: 14px 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .phase {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    padding: 6px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface-2) 60%, transparent);
    transition: background 160ms ease;
  }
  .phase-icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    background: var(--surface-3);
    color: var(--text-muted);
    flex: 0 0 auto;
  }
  .phase-label { flex: 0 0 auto; color: var(--text-muted); }
  .phase-detail {
    color: var(--text-muted);
    font-size: 12px;
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .phase-active { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
  .phase-active .phase-icon { background: var(--accent); color: white; }
  .phase-active .phase-label { color: var(--text); font-weight: 600; }
  .phase-done .phase-icon { background: color-mix(in srgb, var(--accent) 85%, #000); color: white; }
  .phase-done .phase-label { color: var(--text); }
  .phase-error .phase-icon { background: #c0392b; color: white; }
  .phase-error .phase-label { color: #c0392b; font-weight: 600; }
  .phase-skipped .phase-icon { background: var(--surface-3); color: var(--text-muted); }

  .spin {
    display: inline-block;
    width: 10px; height: 10px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: white;
    border-radius: 999px;
    animation: phase-spin 720ms linear infinite;
  }
  @keyframes phase-spin { to { transform: rotate(360deg); } }

  .phase-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
  }
  .phase-summary.ok {
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .phase-summary.err {
    background: color-mix(in srgb, #c0392b 10%, var(--surface));
    border: 1px solid color-mix(in srgb, #c0392b 40%, var(--border));
    color: #c0392b;
  }

  .bulk-flash {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 var(--space-3);
    padding: 10px 14px;
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    border-radius: var(--radius-md);
    font-size: 13px;
  }
  .bulk-flash-close {
    margin-left: auto;
    background: transparent;
    border: none;
    font-size: 18px;
    line-height: 1;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 6px;
  }
  .bulk-flash-close:hover { color: var(--text); }
</style>
