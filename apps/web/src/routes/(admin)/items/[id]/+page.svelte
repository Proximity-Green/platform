<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { enhance } from '$app/forms'
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    Button,
    PageHead,
    Toast,
    Field,
    FieldGrid,
    Select,
    Badge,
    ErrorBanner,
    RecordHistory
  } from '$lib/components/ui'
  import { fmtMoneyWithCurrency } from '$lib/utils/money'
  import { resolvePrice, type PricingParams } from '$lib/services/pricing.service'

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
  type FieldDef = { slug: string; label: string; kind: FieldKind; options?: string[]; unit?: string; noSeparator?: boolean; hint?: string; percentBump?: boolean }

  type TrackingCode = {
    id: string
    location_id: string
    category: string | null
    code: string
    name: string
    is_primary: boolean
    active: boolean
  }

  const TYPE_FIELDS: Partial<Record<TypeSlug, FieldDef[]>> = {
    office: [
      { slug: 'area_sqm', label: 'Area', kind: 'number', unit: 'm²' },
      { slug: 'capacity', label: 'Capacity', kind: 'integer' },
      { slug: 'aesthetic', label: 'Aesthetic reason', kind: 'text' },
      { slug: 'aesthetic_impact', label: 'Aesthetic impact %', kind: 'number', percentBump: true },
      { slug: 'safety_margin', label: 'Safety margin %', kind: 'number', percentBump: true },
      { slug: 'start_price_per_m2', label: 'Start price per m²', kind: 'number' },
      { slug: 'layout', label: 'Layout', kind: 'text' }
    ],
    meeting_room: [
      { slug: 'capacity', label: 'Capacity', kind: 'integer' },
      { slug: 'price_per_user_per_day', label: 'Price per user / day', kind: 'number' },
      { slug: 'off_peak_factor', label: 'Off-peak factor', kind: 'number', hint: '0.7 = 30% off-peak discount' },
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
      { slug: 'supplier_name', label: 'Supplier name', kind: 'text' },
      { slug: 'supplier_sku', label: 'Supplier SKU', kind: 'text' }
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
      { slug: 'year_created', label: 'Year created', kind: 'integer', noSeparator: true },
      { slug: 'framed', label: 'Framed', kind: 'boolean' },
      { slug: 'insurance_value', label: 'Insurance value', kind: 'number' },
      { slug: 'list_price', label: 'List price', kind: 'number' },
      { slug: 'status', label: 'Status', kind: 'enum', options: ['in_storage','on_display','on_loan','sold','returned'] }
    ],
    asset: [
      { slug: 'kind', label: 'Kind', kind: 'enum', options: ['vehicle','equipment','bicycle','other'] },
      { slug: 'make', label: 'Make', kind: 'text' },
      { slug: 'model', label: 'Model', kind: 'text' },
      { slug: 'serial_number', label: 'Serial #', kind: 'text' },
      { slug: 'registration', label: 'Registration', kind: 'text' },
      { slug: 'acquired_at', label: 'Acquired', kind: 'date' },
      { slug: 'status', label: 'Status', kind: 'enum', options: ['available','rented','maintenance','retired'] },
      { slug: 'rate_per_hour', label: 'Rate / hour', kind: 'number' },
      { slug: 'rate_per_day', label: 'Rate / day', kind: 'number' },
      { slug: 'notes', label: 'Notes', kind: 'long_text' }
    ],
    vehicle: [
      { slug: 'kind', label: 'Kind', kind: 'enum', options: ['vehicle','equipment','bicycle','other'] },
      { slug: 'make', label: 'Make', kind: 'text' },
      { slug: 'model', label: 'Model', kind: 'text' },
      { slug: 'serial_number', label: 'Serial #', kind: 'text' },
      { slug: 'registration', label: 'Registration', kind: 'text' },
      { slug: 'rate_per_hour', label: 'Rate / hour', kind: 'number' },
      { slug: 'rate_per_day', label: 'Rate / day', kind: 'number' }
    ],
    equipment: [
      { slug: 'kind', label: 'Kind', kind: 'enum', options: ['vehicle','equipment','bicycle','other'] },
      { slug: 'make', label: 'Make', kind: 'text' },
      { slug: 'model', label: 'Model', kind: 'text' },
      { slug: 'serial_number', label: 'Serial #', kind: 'text' },
      { slug: 'rate_per_day', label: 'Rate / day', kind: 'number' }
    ]
  }

  let { data, form } = $props()

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const item = $derived(data.item as any)
  const itemSlug = $derived(data.slug as TypeSlug | null)

  // Streamed lookups + item-specific async data. Initialise empty/null so the
  // shell paints immediately; populate when promises resolve.
  let itemTypes = $state<any[]>([])
  let locations = $state<any[]>([])
  let trackingCodes = $state<TrackingCode[]>([])
  let subscriptions = $state<any[]>([])

  // Clamp any number-ish value to currency precision (2dp) and return as string.
  // Used everywhere base_rate flows from a number into a form string, so legacy
  // FP drift like 137.50000000000003 doesn't survive a round-trip.
  function num2dp(v: number | string | null | undefined): string {
    if (v == null || v === '') return ''
    const n = Number(v)
    if (!Number.isFinite(n)) return ''
    return String(Math.round(n * 100) / 100)
  }

  let saving = $state(false)
  let itemTypeId = $state<string>(item.item_type_id)
  let locationId = $state<string>(item.location_id ?? '')
  let codeIds = $state<string[]>([])
  let details = $state<Record<string, string>>({})
  let name = $state<string>(item.name)
  let basePrice = $state<string>(num2dp(item.base_rate))
  let baseRateOverride = $state<boolean>(!!item.base_rate_override)
  let taxPercentage = $state<string>(item.accounting_tax_percentage != null ? String(item.accounting_tax_percentage) : '')

  // Convention for percent fields:
  //   - DB stores a decimal fraction (0.2 = 20%)
  //   - UI displays the percent (20)
  //   - Formula references the raw fraction, so callers should write
  //     expressions like "(1 + aesthetic_impact)" to apply a +20% bump.
  function detailsToForm(row: Record<string, unknown> | null, fields: FieldDef[] = []): Record<string, string> {
    const out: Record<string, string> = {}
    if (!row) return out
    const fieldBy = new Map(fields.map(f => [f.slug, f]))
    for (const [k, v] of Object.entries(row)) {
      if (k === 'item_id' || k === 'created_at' || k === 'updated_at') continue
      if (v == null) continue
      const f = fieldBy.get(k)
      if (f?.percentBump) {
        const n = Number(v)
        if (Number.isFinite(n)) {
          out[k] = String(Math.round(n * 10000) / 100)
          continue
        }
      }
      out[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)
    }
    return out
  }

  function percentToFraction(s: string | undefined): string {
    if (!s) return ''
    const n = Number(String(s).replace(/,/g, ''))
    if (!Number.isFinite(n)) return ''
    return String(n / 100)
  }

  // Re-hydrate form identity when navigation loads a new item
  $effect(() => {
    itemTypeId = item.item_type_id
    locationId = item.location_id ?? ''
    name = item.name
    basePrice = num2dp(item.base_rate)
    baseRateOverride = !!item.base_rate_override
    taxPercentage = item.accounting_tax_percentage != null ? String(item.accounting_tax_percentage) : ''
  })

  // Resolve streamed lookups — each arrives independently so the form
  // sections fill in as data lands.
  $effect(() => { Promise.resolve(data.itemTypes).then(v => itemTypes = v ?? []) })
  $effect(() => { Promise.resolve(data.locations).then(v => locations = v ?? []) })
  $effect(() => { Promise.resolve(data.trackingCodes).then(v => trackingCodes = v ?? []) })
  $effect(() => {
    Promise.resolve(data.itemTrackingCodeIds).then(v => { codeIds = [...(v ?? [])] })
  })
  $effect(() => {
    Promise.resolve(data.itemDetails).then(v => {
      const slug = itemSlug
      const fields = slug ? (TYPE_FIELDS[slug] ?? []) : []
      details = detailsToForm(v ?? null, fields)
    })
  })
  $effect(() => {
    Promise.resolve(data.subscriptions).then(v => { subscriptions = v ?? [] })
  })

  const TABS = [
    { key: 'properties', label: 'Properties' },
    { key: 'metadata',   label: 'Meta Data' },
    { key: 'accounting', label: 'Accounting' }
  ] as const

  const activeTab = $derived(($page.url.searchParams.get('tab') ?? 'properties'))

  function tabHref(key: string): string {
    const u = new URL($page.url)
    u.searchParams.set('tab', key)
    return u.pathname + u.search
  }

  // Keyboard nav: ⌘/Ctrl+Enter save, ←/→ tab nav (← at first tab → list)
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const f = document.getElementById('update-form') as HTMLFormElement | null
        if (f) { e.preventDefault(); f.requestSubmit() }
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      const idx = TABS.findIndex(t => t.key === activeTab)
      if (e.key === 'ArrowRight') {
        if (idx >= 0 && idx < TABS.length - 1) {
          e.preventDefault()
          goto(tabHref(TABS[idx + 1].key), { replaceState: true, noScroll: true, keepFocus: true })
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (idx > 0) goto(tabHref(TABS[idx - 1].key), { replaceState: true, noScroll: true, keepFocus: true })
        else goto('/items')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const itemTypeOptions = $derived(
    [...itemTypes]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({ value: t.id, label: t.name }))
  )
  const locationOptions = $derived([
    { value: '', label: 'None' },
    ...locations.map(l => ({ value: l.id, label: l.name }))
  ])
  const yesNo = [
    { value: 'true',  label: 'Yes' },
    { value: 'false', label: 'No' }
  ]

  const currentSlug = $derived.by(() => {
    // Prefer the type slug from streamed itemTypes (in case user just changed
    // type via the dropdown); fall back to the slug from the page load.
    const t = itemTypes.find(it => it.id === itemTypeId)
    const s = (t?.slug ?? itemSlug) as string | undefined
    return (s && (s in TYPE_FIELDS)) ? (s as TypeSlug) : null
  })
  const currentFields = $derived<FieldDef[]>(currentSlug ? (TYPE_FIELDS[currentSlug] ?? []) : [])

  const codeGroups = $derived.by(() => {
    if (!locationId) return [] as { category: string; codes: TrackingCode[] }[]
    const codes = trackingCodes.filter(c => c.location_id === locationId)
    const byCat = new Map<string, TrackingCode[]>()
    for (const c of codes) {
      const k = c.category ?? 'Uncategorised'
      ;(byCat.get(k) ?? byCat.set(k, []).get(k)!).push(c)
    }
    return [...byCat.entries()].map(([category, codes]) => ({ category, codes }))
  })

  function toggleCode(id: string, checked: boolean) {
    codeIds = checked ? [...codeIds, id] : codeIds.filter(x => x !== id)
  }

  function fieldInputType(kind: FieldKind): string { return kind === 'date' ? 'date' : 'text' }
  function enumOpts(f: FieldDef) {
    return [{ value: '', label: '—' }, ...((f.options ?? []).map(o => ({ value: o, label: o })))]
  }
  function isChecked(v: string | undefined): boolean { return v === 'true' }

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

  // ────────────────────────────────────────────────────────────────────
  // Pricing: derive computed value from type's pricing_params + meta-data
  // form values. Re-runs whenever the user edits the meta-data inputs.
  // ────────────────────────────────────────────────────────────────────
  const pricingParams = $derived<PricingParams | null>(
    (item.item_types?.pricing_params ?? null) as PricingParams | null
  )
  const hasExpression = $derived(!!pricingParams?.expression?.trim())

  const detailInputs = $derived.by(() => {
    const out: Record<string, number | null> = {}
    const fieldBy = new Map(currentFields.map(f => [f.slug, f]))
    for (const [k, v] of Object.entries(details)) {
      if (v === '' || v == null) continue
      let n = Number(String(v).replace(/,/g, ''))
      if (Number.isNaN(n)) continue
      const f = fieldBy.get(k)
      if (f?.percentBump) n = n / 100
      out[k] = n
    }
    return out
  })

  const computed = $derived.by(() => {
    if (!hasExpression) return null
    return resolvePrice(pricingParams, detailInputs, null)
  })

  // When formula is present and override is OFF, sync basePrice with computed.
  $effect(() => {
    if (!hasExpression || baseRateOverride) return
    if (computed && 'amount' in computed) {
      const next = num2dp(computed.amount)
      if (basePrice !== next) basePrice = next
    }
  })

  function randChoice<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
  function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
  function randDate(fromYear = 2015, toYear = 2025): string {
    const y = randInt(fromYear, toYear)
    const m = String(randInt(1, 12)).padStart(2, '0')
    const d = String(randInt(1, 28)).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // Realistic per-slug ranges. UI display values — for percentBump fields
  // these are entered as percentages (e.g. 20 means +20%, stored as 0.2).
  const NUM_RANGES: Record<string, [number, number]> = {
    area_sqm: [12, 200],
    capacity: [1, 30],
    aesthetic_impact: [5, 30],
    safety_margin: [5, 25],
    start_price_per_m2: [180, 800],
    price_per_user_per_day: [80, 350],
    off_peak_factor: [60, 90],
    slots_per_day: [2, 4],
    price_per_day: [800, 3000],
    max_members: [1, 20],
    cost_extra_member: [200, 1500],
    space_credits_per_month: [0, 40],
    space_credits_cost_full_day: [200, 600],
    space_credits_cost_half_day: [100, 350],
    stuff_credits_per_month: [0, 100],
    print_credits_per_month: [0, 200],
    volume: [1, 24],
    member_discount: [0, 25],
    duration_minutes: [15, 120],
    rate_per_hour: [50, 500],
    rate_per_day: [400, 4000],
    rate_per_week: [1500, 15000],
    insurance_value: [50000, 5000000],
    list_price: [80000, 8000000],
    odometer_km: [0, 250000]
  }
  const AESTHETIC_REASONS = [
    'Modern industrial', 'Warm minimalist', 'Boutique heritage',
    'Bright open-plan', 'Skyline view premium', 'Quiet corner',
    'Garden-facing', 'High ceilings', 'Period building'
  ]
  const LAYOUTS = [
    'Open plan', 'Private offices', 'Boardroom', 'Hot desks', 'Hybrid mix',
    'U-shape', 'Theatre', 'Cabaret'
  ]
  function randomValueFor(f: FieldDef): string {
    switch (f.kind) {
      case 'boolean': return Math.random() > 0.5 ? 'true' : 'false'
      case 'date':    return randDate(2015, 2025)
      case 'enum':    return randChoice(f.options ?? [''])
      case 'long_text': return randChoice([
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        'Sample placeholder text for testing.',
        'Notes captured during the demo session.'
      ])
      case 'number':
      case 'integer': {
        if (f.slug === 'off_peak_factor') return String(randInt(60, 90) / 100)
        const r = NUM_RANGES[f.slug]
        if (r) return String(randInt(r[0], r[1]))
        if (f.slug.includes('year')) return String(randInt(2010, 2025))
        return f.kind === 'integer' ? String(randInt(1, 50)) : String(randInt(10, 1000))
      }
      default:
        if (f.slug === 'aesthetic') return randChoice(AESTHETIC_REASONS)
        if (f.slug === 'layout')    return randChoice(LAYOUTS)
        return randChoice(['Sample', 'Demo entry', 'Test value', 'Generated'])
    }
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
      year_created: String(randInt(1900, 2025)),
      framed: Math.random() > 0.3 ? 'true' : 'false',
      insurance_value: String(randInt(50000, 5000000)),
      list_price: String(randInt(80000, 8000000)),
      status,
      sold_at: sold ? randDate(2020, 2025) : '',
      sold_price: sold ? String(randInt(100000, 10000000)) : ''
    }
  }
  function randomDetailsFor(slug: TypeSlug): Record<string, string> {
    if (slug === 'art') return randomArtDetails()
    const out: Record<string, string> = {}
    for (const f of (TYPE_FIELDS[slug] ?? [])) out[f.slug] = randomValueFor(f)
    return out
  }
</script>

<PageHead
  title={`Item: ${item.name}`}
  lede={`Type: ${(itemTypes.find((t: any) => t.id === itemTypeId)?.name) ?? item.item_types?.name ?? '—'}`}
>
  <Button variant="ghost" size="sm" href="/items">← Back</Button>
  {#if can('items', 'update')}
    <Button type="submit" form="update-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || form?.actionable}
  <ErrorBanner error={form?.actionable ?? form?.error} showRaw />
{/if}

<nav class="tabs" aria-label="Item sections">
  {#each TABS as t}
    <a class="tab" class:is-active={activeTab === t.key} href={tabHref(t.key)}>{t.label}</a>
  {/each}
</nav>

<div class="tab-body">
  <form
    method="POST"
    action="?/update"
    id="update-form"
    autocomplete="off"
    use:enhance={() => {
      saving = true
      return async ({ update }) => {
        await update({ reset: false })
        saving = false
      }
    }}
  >
    <!-- Always-present hidden fields so form state persists across tabs -->
    <!-- checkboxes for tracking codes are rendered in the Properties pane -->

    <!-- ── PROPERTIES ── -->
    <div class="pane" class:is-active={activeTab === 'properties'}>
      <FieldGrid cols={2}>
        <Field label="Item Type">
          <Select name="item_type_id" value={itemTypeId} options={itemTypeOptions} required onchange={(v) => itemTypeId = v} />
        </Field>
        <Field label="Location">
          <Select name="location_id" value={locationId} options={locationOptions} onchange={(v) => locationId = v} />
        </Field>
      </FieldGrid>

      {#if locationId}
        <div class="sub-loc-under">
          <span class="sub-loc-label">Tracking Codes</span>
          <div class="sub-loc-wrap">
            {#if codeGroups.length === 0}
              <p class="sub-loc-empty">No tracking or sub-locations defined for this location. Add them on the location detail page.</p>
            {:else}
              {#each codeGroups as group (group.category)}
                <div class="provider-group">
                  <div class="provider-header">{group.category}</div>
                  <div class="code-grid">
                    {#each group.codes as tc (tc.id)}
                      <label class="code-row">
                        <input type="checkbox" name="tracking_code_ids" value={tc.id}
                          checked={codeIds.includes(tc.id)}
                          onchange={(e) => toggleCode(tc.id, (e.currentTarget as HTMLInputElement).checked)} />
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
        <Field name="name" label="Name" value={item.name} oninput={(v) => name = v} required />
        <Field label="Base Rate">
          <div class="rate-row">
            <input
              name="base_rate"
              type="text"
              inputmode="decimal"
              value={fmtNum(basePrice)}
              oninput={(e) => onNumInput(e, (v) => basePrice = v)}
              placeholder="0.00"
              autocomplete="off"
              readonly={hasExpression && !baseRateOverride}
              class:is-computed={hasExpression && !baseRateOverride}
            />
            {#if hasExpression && !baseRateOverride}
              {#if computed && 'amount' in computed}
                <span class="rate-badge ok" title={computed.raw != null ? `pre-rounding: ${computed.raw}` : ''}>via formula</span>
              {:else if computed && !computed.ok}
                <span class="rate-badge bad" title={computed.error}>{computed.missing ? 'missing inputs' : 'eval error'}</span>
              {/if}
            {/if}
          </div>
          {#if hasExpression}
            <label class="override-row">
              <input type="checkbox" name="base_rate_override" bind:checked={baseRateOverride} />
              <span>Override formula (manual rate)</span>
            </label>
          {/if}
        </Field>
        <Field label="Active">
          <Select name="active" value={item.active ? 'true' : 'false'} options={yesNo} />
        </Field>
        {#if item.wsm_id}
          <Field name="wsm_id_display" label="WSM ID (read-only)" value={item.wsm_id} readonly />
        {/if}
      </FieldGrid>
      <FieldGrid cols={1}>
        <Field name="description" label="Description" value={item.description ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Subscriptions using this item ({subscriptions.length})</h3>
      {#if subscriptions.length === 0}
        <p class="empty-meta">Not on any subscription.</p>
      {:else}
        <div class="subs-table">
          <div class="subs-head">
            <span>Organisation</span>
            <span>Status</span>
            <span class="right">Qty</span>
            <span class="right">Rate</span>
            <span>Started</span>
            <span>Ended</span>
          </div>
          {#each subscriptions as s (s.id)}
            <div class="subs-row">
              <a
                class="org"
                href={`/organisations/${s.organisation_id}?tab=subscription`}
                target="_blank"
                rel="noopener"
              >
                {s.organisations?.name ?? '—'}
              </a>
              <span><Badge tone={s.status === 'signed' ? 'success' : s.status === 'ended' || s.status === 'cancelled' || s.status === 'expired' ? 'default' : 'info'}>{s.status}</Badge></span>
              <span class="right mono">{s.quantity}</span>
              <span class="right mono">{fmtMoneyWithCurrency(s.base_rate, s.currency)}</span>
              <span class="mono muted">{s.started_at ? String(s.started_at).slice(0, 10) : '—'}</span>
              <span class="mono muted">{s.ended_at ? String(s.ended_at).slice(0, 10) : '—'}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── META DATA ── -->
    <div class="pane" class:is-active={activeTab === 'metadata'}>
      {#if hasExpression}
        <div class="price-preview">
          <div class="price-preview-label">Pricing formula</div>
          <code class="price-preview-expr">{pricingParams?.expression}</code>
          {#if computed && 'amount' in computed}
            <div class="price-preview-flow">
              {#if computed.raw != null && pricingParams?.round_to}
                <span class="price-preview-raw">Raw {fmtMoneyWithCurrency(computed.raw, 'ZAR')}</span>
                <span class="price-preview-arrow">→</span>
                <span class="price-preview-step">rounded up to nearest R{pricingParams.round_to}</span>
                <span class="price-preview-arrow">→</span>
                <span class="price-preview-amount">{fmtMoneyWithCurrency(computed.amount, 'ZAR')}</span>
              {:else if pricingParams?.round_to}
                <span class="price-preview-step">rounded up to nearest R{pricingParams.round_to}</span>
                <span class="price-preview-arrow">→</span>
                <span class="price-preview-amount">{fmtMoneyWithCurrency(computed.amount, 'ZAR')}</span>
              {:else}
                <span class="price-preview-amount">{fmtMoneyWithCurrency(computed.amount, 'ZAR')}</span>
              {/if}
            </div>
          {:else if computed && !computed.ok}
            <div class="price-preview-flow">
              {#if computed.missing && computed.missing.length}
                <span class="price-preview-bad">missing: {computed.missing.join(', ')}</span>
              {:else}
                <span class="price-preview-bad">{computed.error}</span>
              {/if}
            </div>
          {/if}
          {#if baseRateOverride}
            <div class="price-preview-note">Override is on — manual base rate will be used instead of this formula.</div>
          {/if}
        </div>
      {/if}
      {#if currentSlug && currentFields.length > 0}
        <div class="meta-head">
          <h3 class="section-title">{currentSlug.replace(/_/g, ' ')} details</h3>
          <Button variant="ghost" size="sm" type="button"
            onclick={() => { if (currentSlug) details = randomDetailsFor(currentSlug) }}>
            🎲 Randomise
          </Button>
        </div>
        <FieldGrid cols={2}>
          {#each currentFields as f (f.slug)}
            {#if f.kind === 'boolean'}
              <label class="bool-row">
                <input type="checkbox" name={`detail_${f.slug}`} value="true"
                  checked={isChecked(details[f.slug])}
                  onchange={(e) => { details[f.slug] = (e.currentTarget as HTMLInputElement).checked ? 'true' : 'false' }} />
                <span class="bool-label">{f.label}</span>
              </label>
            {:else if f.kind === 'long_text'}
              <Field label={f.label} full>
                <textarea name={`detail_${f.slug}`} rows="3" value={details[f.slug] ?? ''}
                  oninput={(e) => { details[f.slug] = (e.currentTarget as HTMLTextAreaElement).value }}></textarea>
              </Field>
            {:else if f.kind === 'enum'}
              <Field label={f.label}>
                <Select name={`detail_${f.slug}`} value={details[f.slug] ?? ''} options={enumOpts(f)}
                  onchange={(v) => { details[f.slug] = v }} />
              </Field>
            {:else if (f.kind === 'number' || f.kind === 'integer') && f.percentBump}
              <Field label={f.label}>
                <div class="pct-row">
                  <input type="text" inputmode="decimal"
                    value={fmtNum(details[f.slug] ?? '')}
                    oninput={(e) => onNumInput(e, (v) => details[f.slug] = v)}
                    autocomplete="off" />
                  <span class="pct-suffix">%</span>
                </div>
                <input type="hidden" name={`detail_${f.slug}`} value={percentToFraction(details[f.slug])} />
                {#if f.hint}<span class="field-hint">{f.hint}</span>{/if}
              </Field>
            {:else if (f.kind === 'number' || f.kind === 'integer') && !f.noSeparator}
              <Field label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                <input name={`detail_${f.slug}`} type="text" inputmode="decimal"
                  value={fmtNum(details[f.slug] ?? '')}
                  oninput={(e) => onNumInput(e, (v) => details[f.slug] = v)}
                  placeholder={f.hint ?? ''}
                  autocomplete="off" />
                {#if f.hint}<span class="field-hint">{f.hint}</span>{/if}
              </Field>
            {:else}
              <Field label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                <input name={`detail_${f.slug}`} type={fieldInputType(f.kind)}
                  value={details[f.slug] ?? ''}
                  oninput={(e) => { details[f.slug] = (e.currentTarget as HTMLInputElement).value }}
                  placeholder={f.hint ?? ''}
                  autocomplete="off" />
                {#if f.hint}<span class="field-hint">{f.hint}</span>{/if}
              </Field>
            {/if}
          {/each}
        </FieldGrid>
      {:else}
        <p class="sub-loc-empty">No meta fields for this item type.</p>
      {/if}
    </div>

    <!-- ── ACCOUNTING ── -->
    <div class="pane" class:is-active={activeTab === 'accounting'}>
      <FieldGrid cols={2}>
        <Field name="accounting_gl_code" label="GL Code" value={item.accounting_gl_code ?? ''} />
        <Field name="accounting_item_code" label="Item Code" value={item.accounting_item_code ?? ''} />
        <Field name="accounting_tax_code" label="Tax Code" value={item.accounting_tax_code ?? ''} />
        <Field label="Tax %">
          <input
            name="accounting_tax_percentage"
            type="text"
            inputmode="decimal"
            value={fmtNum(taxPercentage)}
            oninput={(e) => onNumInput(e, (v) => taxPercentage = v)}
            placeholder="e.g. 15.00"
            autocomplete="off"
          />
        </Field>
        <Field name="accounting_description" label="Invoice Description Override" value={item.accounting_description ?? ''} />
      </FieldGrid>
    </div>
  </form>
</div>

<RecordHistory table="items" id={item?.id} />

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-4);
  }
  .tab {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-muted);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
    transition: color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out);
  }
  .tab:hover { color: var(--text); }
  .tab.is-active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    font-weight: var(--weight-semibold);
  }

  .tab-body { display: flex; flex-direction: column; gap: var(--space-4); }

  .pane { display: none; }
  .pane.is-active { display: block; }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-child { margin-top: 0; }

  .meta-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .meta-head .section-title { margin: 0; }
  .type-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .type-row :global(.select-wrap) { flex: 1; min-width: 0; }

  .sub-loc-under {
    margin: var(--space-2) 0;
    padding: 6px 10px 8px;
    background: #e9ecef;
    border-radius: var(--radius-sm);
  }
  .sub-loc-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
    margin-bottom: 4px;
  }
  .sub-loc-empty {
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin: 0;
  }
  .sub-loc-wrap {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    flex: 1;
  }
  .provider-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .provider-header {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--text-muted);
    margin: 0;
    white-space: nowrap;
  }
  .code-grid {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px 12px;
  }
  .code-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .code-row input { accent-color: var(--accent); }
  .code { font-family: var(--font-mono); color: var(--text); }
  .sep { color: var(--text-muted); }
  .name { color: var(--text-muted); }
  .primary-flag {
    background: var(--accent-soft);
    color: var(--accent);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-size: 10px;
    font-weight: var(--weight-semibold);
  }

  .bool-row {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-sm);
  }
  .bool-row input { accent-color: var(--accent); width: 16px; height: 16px; }

  .json {
    background: var(--surface-sunk);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    overflow-x: auto;
    margin: 0;
  }
  .empty-meta {
    color: var(--text-muted);
    font-size: var(--text-sm);
    margin: 0;
  }

  .subs-table {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .subs-head, .subs-row {
    display: grid;
    grid-template-columns: 2fr 1fr 0.6fr 1fr 1fr 1fr;
    gap: var(--space-3);
    padding: 8px 12px;
    align-items: center;
  }
  .subs-head {
    background: #e9ecef;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
  }
  .subs-row {
    font-size: var(--text-sm);
    color: var(--text);
    border-top: 1px solid var(--border);
  }
  .subs-row .org {
    font-weight: var(--weight-medium);
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px dashed transparent;
    transition: border-color 120ms ease;
  }
  .subs-row .org:hover { border-bottom-color: var(--accent); }
  .subs-row .right { text-align: right; }
  .subs-row .mono { font-family: var(--font-mono); }
  .subs-row .muted { color: var(--text-muted); }

  /* Pricing override + computed indicator */
  .rate-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
  }
  .rate-row input { flex: 1; min-width: 0; }
  .rate-row input.is-computed {
    background: var(--surface-sunk, #fafafa);
    color: var(--text-muted);
    cursor: not-allowed;
  }
  .rate-badge {
    display: inline-flex; align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    border: 1px solid transparent;
    text-transform: none;
    letter-spacing: 0;
  }
  .rate-badge.ok  { background: var(--success-soft, #d4edda); color: var(--success, #2d6a35); border-color: var(--success, #2d6a35); }
  .rate-badge.bad { background: #fdecea;                       color: var(--danger,  #c0392b); border-color: var(--danger,  #c0392b); }
  .override-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
    font-weight: var(--weight-normal, 400);
    cursor: pointer;
  }
  .override-row input { width: 14px; height: 14px; accent-color: var(--accent); }

  .price-preview {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    background: var(--surface-sunk, #fafafa);
    margin-bottom: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .price-preview-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
  }
  .price-preview-expr {
    display: block;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--text-xs);
    color: var(--text);
    background: var(--surface, #fff);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    overflow-x: auto;
    white-space: nowrap;
  }
  .price-preview-flow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }
  .price-preview-raw {
    color: var(--text-muted);
  }
  .price-preview-arrow {
    color: var(--text-muted);
  }
  .price-preview-step {
    color: var(--text-muted);
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: var(--text-xs);
  }
  .price-preview-amount {
    font-weight: var(--weight-semibold);
    color: var(--success, #2d6a35);
  }
  .price-preview-bad {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--danger, #c0392b);
  }
  .price-preview-note {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .field-hint {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
    font-weight: var(--weight-normal, 400);
  }
  .pct-row {
    position: relative;
    display: flex;
    align-items: center;
  }
  .pct-row input { flex: 1; padding-right: 28px; min-width: 0; }
  .pct-suffix {
    position: absolute;
    right: 10px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .subs-head { display: none; }
    .subs-row {
      display: block;
      padding: var(--space-3);
      border-top: 1px solid var(--border);
    }
    .subs-row > * {
      display: block;
      padding: 4px 0;
    }
    .subs-row .org {
      font-size: 1rem;
      font-weight: var(--weight-semibold);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    }
    .subs-row > span {
      border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    }
    .subs-row > span:last-child { border-bottom: none; }
    .subs-row .right { text-align: left; }
    /* Label prefixes for each field (column order: Organisation, Status, Qty, Rate, Started, Ended) */
    .subs-row > *:nth-child(2)::before { content: 'Status: '; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--weight-semibold); margin-right: 6px; }
    .subs-row > *:nth-child(3)::before { content: 'Qty: '; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--weight-semibold); margin-right: 6px; }
    .subs-row > *:nth-child(4)::before { content: 'Rate: '; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--weight-semibold); margin-right: 6px; }
    .subs-row > *:nth-child(5)::before { content: 'Started: '; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--weight-semibold); margin-right: 6px; }
    .subs-row > *:nth-child(6)::before { content: 'Ended: '; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--weight-semibold); margin-right: 6px; }
  }
</style>
