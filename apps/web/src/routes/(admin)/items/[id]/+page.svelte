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
    Badge
  } from '$lib/components/ui'
  import { fmtMoneyWithCurrency } from '$lib/utils/money'

  type Family = 'space' | 'membership' | 'product' | 'service' | 'art' | 'asset'
  type FieldKind = 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'enum' | 'long_text'
  type FieldDef = { slug: string; label: string; kind: FieldKind; options?: string[]; unit?: string; noSeparator?: boolean }

  type TrackingCode = {
    id: string
    location_id: string
    category: string | null
    code: string
    name: string
    is_primary: boolean
    active: boolean
  }

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
    ]
  }

  let { data, form } = $props()

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const item = $derived(data.item as any)
  const family = $derived(data.family as Family | null)

  // Streamed lookups + item-specific async data. Initialise empty/null so the
  // shell paints immediately; populate when promises resolve.
  let itemTypes = $state<any[]>([])
  let locations = $state<any[]>([])
  let trackingCodes = $state<TrackingCode[]>([])
  let subscriptions = $state<any[]>([])

  let saving = $state(false)
  let itemTypeId = $state<string>(item.item_type_id)
  let locationId = $state<string>(item.location_id ?? '')
  let codeIds = $state<string[]>([])
  let details = $state<Record<string, string>>({})
  let name = $state<string>(item.name)
  let basePrice = $state<string>(item.base_price != null ? String(item.base_price) : '')
  let taxPercentage = $state<string>(item.accounting_tax_percentage != null ? String(item.accounting_tax_percentage) : '')

  function detailsToForm(row: Record<string, unknown> | null): Record<string, string> {
    const out: Record<string, string> = {}
    if (!row) return out
    for (const [k, v] of Object.entries(row)) {
      if (k === 'item_id' || k === 'created_at' || k === 'updated_at') continue
      if (v == null) continue
      out[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)
    }
    return out
  }

  // Re-hydrate form identity when navigation loads a new item
  $effect(() => {
    itemTypeId = item.item_type_id
    locationId = item.location_id ?? ''
    name = item.name
    basePrice = item.base_price != null ? String(item.base_price) : ''
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
    Promise.resolve(data.itemDetails).then(v => { details = detailsToForm(v ?? null) })
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
      .sort((a, b) => (a.family ?? 'zzz').localeCompare(b.family ?? 'zzz') || a.name.localeCompare(b.name))
      .map(t => ({ value: t.id, label: t.name, group: t.family ?? 'Other' }))
  )
  const locationOptions = $derived([
    { value: '', label: 'None' },
    ...locations.map(l => ({ value: l.id, label: l.name }))
  ])
  const yesNo = [
    { value: 'true',  label: 'Yes' },
    { value: 'false', label: 'No' }
  ]

  const currentFamily = $derived.by(() => {
    // Prefer the synchronously-loaded family from data; fall back to lookup
    // once itemTypes stream in (so changing the item type resolves properly).
    const t = itemTypes.find(it => it.id === itemTypeId)
    const f = (t?.family ?? family) as string | undefined
    return (f && (f in FAMILY_FIELDS)) ? (f as Family) : null
  })
  const currentFields = $derived<FieldDef[]>(currentFamily ? FAMILY_FIELDS[currentFamily] : [])

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
  function randomDetailsFor(family: Family): Record<string, string> {
    if (family === 'art') return randomArtDetails()
    const out: Record<string, string> = {}
    for (const f of FAMILY_FIELDS[family]) out[f.slug] = randomValueFor(f)
    return out
  }
</script>

<PageHead title={`Item: ${item.name}`} lede={item.item_types?.name ?? ''}>
  <Button variant="ghost" size="sm" href="/items">← Back</Button>
  {#if can('items', 'update')}
    <Button type="submit" form="update-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
  {/if}
</PageHead>

<Toast error={form?.error} success={form?.success} message={form?.message} />

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
          <div class="type-row">
            <Select name="item_type_id" value={itemTypeId} options={itemTypeOptions} required onchange={(v) => itemTypeId = v} />
            {#if currentFamily}
              <Badge tone="default">Family: {currentFamily}</Badge>
            {/if}
          </div>
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
        <Field label="Base Price">
          <input
            name="base_price"
            type="text"
            inputmode="decimal"
            value={fmtNum(basePrice)}
            oninput={(e) => onNumInput(e, (v) => basePrice = v)}
            placeholder="0.00"
            autocomplete="off"
          />
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
      {#if currentFamily && currentFields.length > 0}
        <div class="meta-head">
          <h3 class="section-title">{currentFamily} details</h3>
          <Button variant="ghost" size="sm" type="button"
            onclick={() => { if (currentFamily) details = randomDetailsFor(currentFamily) }}>
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
            {:else if (f.kind === 'number' || f.kind === 'integer') && !f.noSeparator}
              <Field label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                <input name={`detail_${f.slug}`} type="text" inputmode="decimal"
                  value={fmtNum(details[f.slug] ?? '')}
                  oninput={(e) => onNumInput(e, (v) => details[f.slug] = v)}
                  autocomplete="off" />
              </Field>
            {:else}
              <Field label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                <input name={`detail_${f.slug}`} type={fieldInputType(f.kind)}
                  value={details[f.slug] ?? ''}
                  oninput={(e) => { details[f.slug] = (e.currentTarget as HTMLInputElement).value }}
                  autocomplete="off" />
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
