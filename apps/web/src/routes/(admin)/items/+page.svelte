<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import {
    Button,
    PageHead,
    Toast,
    Badge,
    DataTable,
    Drawer,
    FormCard,
    FieldGrid,
    Field,
    Select,
    SubmitButton
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'

  type Item = {
    id: string
    wsm_id: string | null
    item_type_id: string
    location_id: string | null
    name: string
    description: string | null
    sku: string | null
    base_price: number | null
    accounting_gl_code: string | null
    accounting_item_code: string | null
    accounting_tax_code: string | null
    accounting_tax_percentage: number | null
    accounting_tracking_codes: string[] | null
    accounting_description: string | null
    active: boolean
    metadata: Record<string, any> | null
    created_at: string
    updated_at: string
    item_type_name: string | null
    item_type_slug: string | null
    location_name: string | null
  }

  type LookupOption = { id: string; slug?: string; name: string; family?: Family }

  type TrackingCode = {
    id: string
    location_id: string
    category: string | null
    code: string
    name: string
    is_primary: boolean
    active: boolean
  }

  type Family = 'space' | 'membership' | 'product' | 'service' | 'art' | 'asset'
  type FieldKind = 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'enum' | 'long_text'
  type FieldDef = { slug: string; label: string; kind: FieldKind; options?: string[]; unit?: string; noSeparator?: boolean }

  // Hardcoded UI-schema per family. Must match FAMILY_COLUMNS in +page.server.ts.
  const FAMILY_FIELDS: Record<Family, FieldDef[]> = {
    space: [
      { slug: 'meters_squared', label: 'Floor area', kind: 'number', unit: 'm²' },
      { slug: 'capacity', label: 'Capacity', kind: 'integer' },
      { slug: 'aesthetic', label: 'Aesthetic', kind: 'text' },
      { slug: 'aesthetic_impact', label: 'Aesthetic impact', kind: 'number' },
      { slug: 'safety_margin', label: 'Safety margin', kind: 'number' },
      { slug: 'start_price_per_square_meter', label: 'Start price per m²', kind: 'number' },
      { slug: 'number_available', label: 'Number available', kind: 'integer' },
      { slug: 'private', label: 'Private', kind: 'boolean' },
      { slug: 'layout', label: 'Default layout', kind: 'text' },
      { slug: 'price_per_day', label: 'Price per day', kind: 'number' },
      { slug: 'price_per_user_per_day', label: 'Price per user / day', kind: 'number' },
      { slug: 'half_day_discount', label: 'Half-day discount', kind: 'number' },
      { slug: 'full_day_discount', label: 'Full-day discount', kind: 'number' },
      { slug: 'off_peak_cost', label: 'Off-peak cost', kind: 'number' },
      { slug: 'external_ical', label: 'External iCal URL', kind: 'text' },
      { slug: 'business_case', label: 'Business case', kind: 'long_text' }
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
      { slug: 'pro_rata', label: 'Pro-rata billing', kind: 'boolean' },
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
  let editing = $state<Item | null>(null)
  let saving = $state(false)

  type TabKey = 'properties' | 'metadata' | 'accounting'
  let createTab = $state<TabKey>('properties')
  let editTab = $state<TabKey>('properties')

  let createLocationId = $state<string>('')
  let createCodeIds = $state<string[]>([])
  let editLocationId = $state<string>('')
  let editCodeIds = $state<string[]>([])

  let createItemTypeId = $state<string>('')
  let editItemTypeId = $state<string>('')
  let editDetails = $state<Record<string, string>>({})
  let createDetails = $state<Record<string, string>>({})
  // Tracks the currently-typed name so the drawer header updates live while editing.
  let editName = $state<string>('')

  $effect(() => {
    // Close the create pane on success, but keep the edit drawer open so the
    // user can keep working on the same record after saving.
    if (form?.success) { showCreate = false }
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

  $effect(() => {
    if (editing) {
      editLocationId = editing.location_id ?? ''
      editCodeIds = [...(data.itemTrackingCodeIds?.[editing.id] ?? [])]
      editItemTypeId = editing.item_type_id
      editDetails = detailsToFormMap(data.itemDetails?.[editing.id] ?? null)
      editName = editing.name
      editTab = 'properties'
    } else {
      editLocationId = ''
      editCodeIds = []
      editItemTypeId = ''
      editDetails = {}
      editName = ''
    }
  })

  function detailsToFormMap(row: Record<string, unknown> | null): Record<string, string> {
    if (!row) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) {
      if (k === 'item_id' || k === 'created_at' || k === 'updated_at') continue
      if (v == null) continue
      if (typeof v === 'boolean') out[k] = v ? 'true' : 'false'
      else out[k] = String(v)
    }
    return out
  }

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
  const editCodeGroups = $derived(groupByCategory(codesForLocation(editLocationId)))

  function toggleCreateCode(id: string, checked: boolean) {
    if (checked) {
      if (!createCodeIds.includes(id)) createCodeIds = [...createCodeIds, id]
    } else {
      createCodeIds = createCodeIds.filter(x => x !== id)
    }
  }

  function toggleEditCode(id: string, checked: boolean) {
    if (checked) {
      if (!editCodeIds.includes(id)) editCodeIds = [...editCodeIds, id]
    } else {
      editCodeIds = editCodeIds.filter(x => x !== id)
    }
  }

  function onCreateLocationChange(v: string) {
    if (v !== createLocationId) {
      createLocationId = v
      createCodeIds = []
    }
  }
  function onEditLocationChange(v: string) {
    if (v !== editLocationId) {
      editLocationId = v
      editCodeIds = []
    }
  }

  // Family changes invalidate the previously-typed detail values.
  function onCreateItemTypeChange(v: string) {
    if (v !== createItemTypeId) {
      const prev = familyForType(createItemTypeId)
      const next = familyForType(v)
      createItemTypeId = v
      if (prev !== next) createDetails = {}
    }
  }
  function onEditItemTypeChange(v: string) {
    if (v !== editItemTypeId) {
      const prev = familyForType(editItemTypeId)
      const next = familyForType(v)
      editItemTypeId = v
      if (prev !== next) editDetails = {}
    }
  }

  const itemTypeFamilyById = $derived.by(() => {
    const m = new Map<string, Family>()
    for (const t of data.itemTypes as LookupOption[]) {
      if (t.family) m.set(t.id, t.family)
    }
    return m
  })

  function familyForType(itemTypeId: string): Family | null {
    return itemTypeFamilyById.get(itemTypeId) ?? null
  }

  const createFamily = $derived(familyForType(createItemTypeId))
  const editFamily = $derived(familyForType(editItemTypeId))
  const createFields = $derived(createFamily ? FAMILY_FIELDS[createFamily] : [])
  const editFields = $derived(editFamily ? FAMILY_FIELDS[editFamily] : [])

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

  function randomDetailsFor(family: Family): Record<string, string> {
    if (family === 'art') return randomArtDetails()
    const out: Record<string, string> = {}
    for (const f of FAMILY_FIELDS[family]) out[f.slug] = randomValueFor(f)
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
    (data.itemTypes as LookupOption[]).map(t => ({ value: t.id, label: t.name }))
  )
  const locationOptions = $derived([
    { value: '', label: 'None' },
    ...(data.locations as LookupOption[]).map(l => ({ value: l.id, label: l.name }))
  ])

  function fmtPrice(v: number | null): string {
    if (v == null) return '—'
    return Number(v).toFixed(2)
  }

  const trackingCodesById = $derived.by(() => {
    const map = new Map<string, TrackingCode>()
    for (const c of (data.trackingCodes as TrackingCode[])) map.set(c.id, c)
    return map
  })

  function itemTrackingCodeLabels(itemId: string): string[] {
    const ids = (data.itemTrackingCodeIds?.[itemId] ?? []) as string[]
    return ids.map(id => {
      const c = trackingCodesById.get(id)
      return c ? c.code : ''
    }).filter(Boolean)
  }

  // Stable function refs so DataTable doesn't see "new" props on every tab click.
  function isActiveRow(i: Item) { return i.id === editing?.id }
  function onActivate(i: Item) { editing = i }

  const columns: Column<Item>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '20%' },
    { key: 'item_type_name', label: 'Type', sortable: true, width: '12%', muted: true, get: i => i.item_type_name ?? '' },
    { key: 'sku', label: 'SKU', sortable: true, width: '11%', mono: true, muted: true, hideBelow: 'md' },
    { key: 'location_name', label: 'Location', sortable: true, width: '14%', muted: true, hideBelow: 'md', get: i => i.location_name ?? '' },
    { key: 'tracking_codes', label: 'Tracking Codes', width: '15%', muted: true, hideBelow: 'md',
      get: i => itemTrackingCodeLabels(i.id).join(', '),
      render: i => itemTrackingCodeLabels(i.id).join(', ') || '' },
    { key: 'base_price', label: 'Price', sortable: true, width: '10%', align: 'right', mono: true, get: i => i.base_price ?? null, render: i => fmtPrice(i.base_price) },
    { key: 'active', label: 'Active', sortable: true, width: '8%' }
  ]

  const filters: Filter<Item>[] = [
    { key: 'all', label: 'All' },
    { key: 'product', label: 'Product', test: i => i.item_type_slug === 'product' },
    { key: 'membership', label: 'Membership', test: i => i.item_type_slug === 'membership' },
    { key: 'office', label: 'Office', test: i => i.item_type_slug === 'office' },
    { key: 'art', label: 'Art', test: i => i.item_type_slug === 'art' },
    { key: 'adjustment', label: 'Adjustment', test: i => i.item_type_slug === 'adjustment' },
    { key: 'active', label: 'Active only', test: i => i.active }
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
                <p class="sub-loc-empty">No sub-locations defined for this location. Add them on the location detail page.</p>
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
          <Field name="base_price" label="Base Price" type="number" placeholder="0.00" />
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
        {#if createFamily && createFields.length > 0}
          <div class="meta-head">
            <h3 class="section-title">{createFamily} details</h3>
            <Button variant="ghost" size="sm" type="button"
              onclick={() => { if (createFamily) createDetails = randomDetailsFor(createFamily) }}>
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
            name="accounting_tracking_codes"
            label="Tracking Codes (comma-separated)"
            placeholder="e.g. cape-town, retail"
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
  searchFields={['name', 'sku', 'description', 'item_type_name', 'location_name']}
  searchPlaceholder="Search name, SKU, type, location…"
  csvFilename="items"
  empty="No items yet."
  {isActiveRow}
  {onActivate}
>
  {#snippet row(item)}
    <td>
      <span class="name">{item.name}</span>
    </td>
    <td class="muted">{item.item_type_name ?? '—'}</td>
    <td class="muted mono hide-md">{item.sku ?? '—'}</td>
    <td class="muted hide-md">{item.location_name ?? '—'}</td>
    <td class="hide-md tc-cell">
      {#each itemTrackingCodeLabels(item.id) as code}
        <Badge tone="default">{code}</Badge>
      {:else}
        <span class="muted">—</span>
      {/each}
    </td>
    <td class="mono price">{fmtPrice(item.base_price)}</td>
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
      <Button variant="ghost" size="sm" onclick={() => editing = item}>Edit</Button>
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

<Drawer open={!!editing} title={editing ? `Edit Item — ${editName || editing.name}` : 'Edit Item'} formId="edit-item-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action="?/update"
      id="edit-item-form"
      autocomplete="off"
      use:enhance={() => {
        saving = true
        return async ({ update }) => {
          await update({ reset: false })
          saving = false
        }
      }}
    >
      <input type="hidden" name="id" value={editing.id} />

      <nav class="tabs" aria-label="Item form sections">
        <button type="button" class="tab" class:is-active={editTab === 'properties'} onclick={() => editTab = 'properties'}>Properties</button>
        <button type="button" class="tab" class:is-active={editTab === 'metadata'} onclick={() => editTab = 'metadata'}>Meta Data</button>
        <button type="button" class="tab" class:is-active={editTab === 'accounting'} onclick={() => editTab = 'accounting'}>Accounting</button>
      </nav>

      <!-- TAB 1: PROPERTIES -->
      <div class="tab-pane" class:is-active={editTab === 'properties'}>
        <FieldGrid cols={2}>
          <Field label="Item Type">
            <Select
              name="item_type_id"
              value={editItemTypeId}
              options={itemTypeOptions}
              required
              onchange={onEditItemTypeChange}
            />
          </Field>
          <Field label="Location">
            <Select
              name="location_id"
              value={editLocationId}
              options={locationOptions}
              onchange={onEditLocationChange}
            />
          </Field>
        </FieldGrid>

        {#if editLocationId}
          <div class="sub-loc-under">
            <span class="sub-loc-label">Sub-locations</span>
            <div class="sub-loc-wrap">
              {#if editCodeGroups.length === 0}
                <p class="sub-loc-empty">No sub-locations defined for this location. Add them on the location detail page.</p>
              {:else}
                {#each editCodeGroups as group (group.category)}
                  <div class="provider-group">
                    <div class="provider-header">{group.category}</div>
                    <div class="code-grid">
                      {#each group.codes as tc (tc.id)}
                        <label class="code-row">
                          <input
                            type="checkbox"
                            name="tracking_code_ids"
                            value={tc.id}
                            checked={editCodeIds.includes(tc.id)}
                            onchange={(e) => toggleEditCode(tc.id, (e.currentTarget as HTMLInputElement).checked)}
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
          <Field name="name" label="Name" value={editing.name} oninput={(v) => editName = v} required />
          <Field
            name="base_price"
            label="Base Price"
            type="number"
            value={editing.base_price != null ? String(editing.base_price) : ''}
            placeholder="0.00"
          />
          <Field label="Active">
            <Select
              name="active"
              value={editing.active ? 'true' : 'false'}
              options={yesNo}
            />
          </Field>
          {#if editing.wsm_id}
            <Field name="wsm_id_display" label="WSM ID (read-only)" value={editing.wsm_id} readonly />
          {/if}
        </FieldGrid>
        <FieldGrid cols={1}>
          <Field name="description" label="Description" value={editing.description ?? ''} />
        </FieldGrid>

        <h3 class="section-title">Metadata (read-only)</h3>
        {#if editing.metadata}
          <pre class="json">{JSON.stringify(editing.metadata, null, 2)}</pre>
        {:else}
          <p class="empty-meta">No metadata.</p>
        {/if}
      </div>

      <!-- TAB 2: META DATA -->
      <div class="tab-pane" class:is-active={editTab === 'metadata'}>
        <FieldGrid cols={2}>
          <Field label="Item Type">
            <Select
              value={editItemTypeId}
              options={itemTypeOptions}
              onchange={onEditItemTypeChange}
            />
          </Field>
        </FieldGrid>
        {#if editFamily && editFields.length > 0}
          <div class="meta-head">
            <h3 class="section-title">{editFamily} details</h3>
            <Button variant="ghost" size="sm" type="button"
              onclick={() => { if (editFamily) editDetails = randomDetailsFor(editFamily) }}>
              🎲 Randomise
            </Button>
          </div>
          <FieldGrid cols={2}>
            {#each editFields as f (f.slug)}
              {#if f.kind === 'boolean'}
                <label class="bool-row">
                  <input
                    type="checkbox"
                    name={`detail_${f.slug}`}
                    value="true"
                    checked={isChecked(editDetails[f.slug])}
                    onchange={(e) => {
                      editDetails[f.slug] = (e.currentTarget as HTMLInputElement).checked ? 'true' : 'false'
                    }}
                  />
                  <span class="bool-label">{f.label}</span>
                </label>
              {:else if f.kind === 'long_text'}
                <Field label={f.label} full>
                  <textarea
                    name={`detail_${f.slug}`}
                    rows="3"
                    value={editDetails[f.slug] ?? ''}
                    oninput={(e) => { editDetails[f.slug] = (e.currentTarget as HTMLTextAreaElement).value }}
                  ></textarea>
                </Field>
              {:else if f.kind === 'enum'}
                <Field label={f.label}>
                  <Select
                    name={`detail_${f.slug}`}
                    value={editDetails[f.slug] ?? ''}
                    options={enumOptions(f)}
                    onchange={(v) => { editDetails[f.slug] = v }}
                  />
                </Field>
              {:else if (f.kind === 'number' || f.kind === 'integer') && !f.noSeparator}
                <Field label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                  <input
                    name={`detail_${f.slug}`}
                    type="text"
                    inputmode="decimal"
                    value={fmtNum(editDetails[f.slug] ?? '')}
                    oninput={(e) => onNumInput(e, (v) => editDetails[f.slug] = v)}
                    autocomplete="off"
                  />
                </Field>
              {:else}
                <Field label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                  <input
                    name={`detail_${f.slug}`}
                    type={fieldInputType(f.kind)}
                    step={fieldStep(f.kind)}
                    value={editDetails[f.slug] ?? ''}
                    oninput={(e) => { editDetails[f.slug] = (e.currentTarget as HTMLInputElement).value }}
                    autocomplete="off"
                  />
                </Field>
              {/if}
            {/each}
          </FieldGrid>
        {:else if !editItemTypeId}
          <p class="sub-loc-empty">Pick an item type on the Properties tab to see per-type fields.</p>
        {:else}
          <p class="sub-loc-empty">No meta fields for this type.</p>
        {/if}
      </div>

      <!-- TAB 3: ACCOUNTING -->
      <div class="tab-pane" class:is-active={editTab === 'accounting'}>
        <FieldGrid cols={2}>
          <Field name="accounting_gl_code" label="GL Code" value={editing.accounting_gl_code ?? ''} />
          <Field name="accounting_item_code" label="Item Code" value={editing.accounting_item_code ?? ''} />
          <Field name="accounting_tax_code" label="Tax Code" value={editing.accounting_tax_code ?? ''} />
          <Field
            name="accounting_tax_percentage"
            label="Tax %"
            type="number"
            value={editing.accounting_tax_percentage != null ? String(editing.accounting_tax_percentage) : ''}
            placeholder="e.g. 15.00"
          />
          <Field
            name="accounting_tracking_codes"
            label="Tracking Codes (comma-separated)"
            value={editing.accounting_tracking_codes?.join(', ') ?? ''}
            placeholder="e.g. cape-town, retail"
          />
          <Field
            name="accounting_description"
            label="Invoice Description Override"
            value={editing.accounting_description ?? ''}
          />
        </FieldGrid>
      </div>
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="edit-item-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .create-wrap { margin-bottom: var(--space-6); }

  .tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-3);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
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
