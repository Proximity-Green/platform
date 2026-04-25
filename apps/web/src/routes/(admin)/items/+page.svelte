<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
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
    SubmitButton
  } from '$lib/components/ui'
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

  const columns: Column<Item>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '20%' },
    { key: 'item_type_name', label: 'Type', sortable: true, width: '12%', muted: true, get: i => i.item_type_name ?? '' },
    { key: 'accounting_gl_code', label: 'GL Code', sortable: true, width: '11%', mono: true, muted: true, hideBelow: 'md', get: i => i.accounting_gl_code ?? '' },
    { key: 'location_name', label: 'Location', sortable: true, width: '14%', muted: true, hideBelow: 'md', get: i => i.location_name ?? '' },
    { key: 'tracking_codes', label: 'Tracking Codes', width: '15%', muted: true, hideBelow: 'md',
      get: i => itemTrackingCodeLabels(i.id).join(', '),
      render: i => itemTrackingCodeLabels(i.id).join(', ') || '' },
    { key: 'base_rate', label: 'Rate', sortable: true, width: '10%', align: 'right', mono: true, get: i => i.base_rate ?? null, render: i => fmtPrice(i.base_rate) },
    { key: 'active', label: 'Active', sortable: true, width: '8%' }
  ]

  const filters: Filter<Item>[] = [
    { key: 'all', label: 'All' },
    { key: 'product', label: 'Product', test: i => i.item_type_slug === 'product' },
    { key: 'membership', label: 'Membership', test: i => i.item_type_slug === 'membership' },
    { key: 'office', label: 'Office', test: i => i.item_type_slug === 'office' },
    { key: 'art', label: 'Art', test: i => i.item_type_slug === 'art' },
    { key: 'adjustment', label: 'Adjustment', test: i => i.item_type_slug === 'adjustment' },
    { key: 'active', label: 'Active only', test: i => i.active },
    { key: 'no_codes', label: 'No tracking codes', test: i => (itemTrackingCodeIds[i.id]?.length ?? 0) === 0 },
    { key: 'on_subs', label: 'On active subs', test: i => activeSubItemIds.has(i.id) }
  ]
</script>

<PageHead title="Items" lede="Unified catalog — spaces, memberships, products, services, art, assets. One row per sellable thing.">
  {#if can('items', 'create')}
    <Button size="sm" onclick={() => { showCreate = !showCreate }}>
      {showCreate ? 'Cancel' : '+ Add Item'}
    </Button>
  {/if}
</PageHead>

<Toast error={form?.error} success={form?.success} message={form?.message} />

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
  {onRowClick}
>
  {#snippet row(item)}
    <td>
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
  {#snippet actions(item)}
    {#if can('items', 'update')}
      <a
        class="open-arrow"
        href={`/items/${item.id}?tab=properties`}
        onclick={(e) => e.stopPropagation()}
        aria-label="Open item"
        title="Open item"
      >→</a>
    {/if}
    {#if can('items', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: item.id }}
        confirm={{
          title: 'Delete item?',
          message: `Permanently delete ${item.name}? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

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
</style>
