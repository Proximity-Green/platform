<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import {
    Button,
    PageHead,
    Toast,
    FieldGrid,
    Field,
    Select,
    Badge,
    SubmitButton,
    RecordHistory, ErrorBanner
  } from '$lib/components/ui'

  type FieldKind = 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'enum' | 'long_text'
  type FieldDef = { slug: string; label: string; kind: FieldKind; options?: string[]; unit?: string; percentBump?: boolean }

  // Per-type metadata schema. Mirrors TYPE_FIELDS in items pages.
  const TYPE_FIELDS: Record<string, FieldDef[]> = {
    office: [
      { slug: 'area_sqm', label: 'Area', kind: 'number', unit: 'm²' },
      { slug: 'capacity', label: 'Capacity', kind: 'integer' },
      { slug: 'aesthetic', label: 'Aesthetic reason', kind: 'text' },
      { slug: 'aesthetic_impact', label: 'Aesthetic impact', kind: 'number', percentBump: true },
      { slug: 'safety_margin', label: 'Safety margin', kind: 'number', percentBump: true },
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
      { slug: 'year_created', label: 'Year created', kind: 'integer' },
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
      { slug: 'rate_per_hour', label: 'Rate / hour', kind: 'number' },
      { slug: 'rate_per_day', label: 'Rate / day', kind: 'number' }
    ]
  }

  let { data, form } = $props()
  const type = $derived(data.type as any)

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  // Form state
  let saving = $state(false)
  let slug = $state(type.slug)
  let name = $state(type.name)
  let description = $state(type.description ?? '')
  let pricingParamsRaw = $state(
    type.pricing_params ? JSON.stringify(type.pricing_params, null, 2) : ''
  )
  let requiresLicense = $state(type.requires_license)
  let sellableAdHoc = $state(type.sellable_ad_hoc)
  let sellableRecurring = $state(type.sellable_recurring)
  let applyProRata = $state(type.apply_pro_rata)

  $effect(() => {
    slug = type.slug
    name = type.name
    description = type.description ?? ''
    pricingParamsRaw = type.pricing_params ? JSON.stringify(type.pricing_params, null, 2) : ''
    requiresLicense = type.requires_license
    sellableAdHoc = type.sellable_ad_hoc
    sellableRecurring = type.sellable_recurring
    applyProRata = type.apply_pro_rata
  })

  // Items using this type — streamed
  let items = $state<any[]>([])
  $effect(() => { Promise.resolve(data.items).then(v => items = v ?? []) })

  // Tabs
  const TABS = [
    { key: 'identity', label: 'Identity' },
    { key: 'pricing',  label: 'Pricing' },
    { key: 'policy',   label: 'Policy' },
    { key: 'fields',   label: 'Fields' },
    { key: 'items',    label: 'Items' }
  ] as const
  const activeTab = $derived($page.url.searchParams.get('tab') ?? 'identity')

  function tabHref(key: string): string {
    const u = new URL($page.url)
    u.searchParams.set('tab', key)
    return u.pathname + u.search
  }

  // Keyboard nav (mirrors locations/[id]):
  //   ⌘/Ctrl+Enter — save the form
  //   →            — next tab
  //   ←            — previous tab, or back to list at the first tab
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const form = document.getElementById('type-form') as HTMLFormElement | null
        if (form) { e.preventDefault(); form.requestSubmit() }
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
        if (idx > 0) {
          goto(tabHref(TABS[idx - 1].key), { replaceState: true, noScroll: true, keepFocus: true })
        } else {
          goto('/item-types')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const currentFields = $derived<FieldDef[]>(TYPE_FIELDS[slug] ?? [])

  // Detail-table name follows from the type slug — no separate registry.
  const detailsTable = $derived(currentFields.length > 0 ? `${slug}_details` : null)

  // JSON editor state
  const paramsValidation = $derived.by(() => {
    if (!pricingParamsRaw.trim()) return { ok: true as const, parsed: null }
    try {
      const parsed = JSON.parse(pricingParamsRaw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false as const, error: 'Must be a JSON object' }
      }
      return { ok: true as const, parsed }
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? 'Invalid JSON' }
    }
  })


  // Recognises a formula-shaped string like:
  //   "area_sqm"*"aesthetic"*"safety_margin"
  //   area_sqm * (1 + aesthetic_impact) * start_price_per_m2
  // and wraps it as { "expression": "<normalised>" }. Returns null if it
  // doesn't look like a formula.
  function tryFormulaToJson(raw: string): string | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    // Skip if it's already a JSON object/array
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return null
    // Must contain at least one arithmetic operator
    if (!/[*+\-/]/.test(trimmed)) return null

    const expression = trimmed
      // strip quotes from quoted identifiers: "area_sqm" -> area_sqm
      .replace(/"([a-zA-Z_][a-zA-Z0-9_]*)"/g, '$1')
      // tighten whitespace around operators
      .replace(/\s*([*+\-/])\s*/g, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim()

    return JSON.stringify({ expression }, null, 2)
  }

  function formatJson() {
    // Try formula-to-JSON first, even if standard parse failed.
    const fromFormula = tryFormulaToJson(pricingParamsRaw)
    if (fromFormula) {
      pricingParamsRaw = fromFormula
      return
    }
    if (!paramsValidation.ok) return
    if (paramsValidation.parsed == null) {
      pricingParamsRaw = ''
      return
    }
    pricingParamsRaw = JSON.stringify(paramsValidation.parsed, null, 2)
  }

  // Tab-key support: insert two spaces instead of moving focus
  function onParamsKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = e.currentTarget as HTMLTextAreaElement
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = pricingParamsRaw.slice(0, start)
    const after = pricingParamsRaw.slice(end)
    pricingParamsRaw = before + '  ' + after
    queueMicrotask(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
  }

  function fmtMoney(n: number | null | undefined): string {
    if (n == null) return '—'
    return n.toLocaleString('en-US')
  }

  // Variables referenced in the pricing expression, intersected with the
  // type's known fields, in formula appearance order. Used to render the
  // pricing inputs alongside each item in the Items tab.
  const formulaVars = $derived.by(() => {
    const expr = (type.pricing_params as any)?.expression
    if (!expr) return [] as FieldDef[]
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const m of String(expr).matchAll(/[a-zA-Z_][a-zA-Z_0-9]*/g)) {
      const name = m[0]
      if (seen.has(name)) continue
      seen.add(name)
      ordered.push(name)
    }
    const fieldBy = new Map(currentFields.map(f => [f.slug, f]))
    return ordered.map(s => fieldBy.get(s)).filter((f): f is FieldDef => !!f)
  })

  function fmtDetail(value: unknown, f: FieldDef): string {
    if (value == null || value === '') return '—'
    if (f.percentBump) {
      const n = Number(value)
      if (!Number.isFinite(n)) return '—'
      return `${Math.round(n * 10000) / 100}%`
    }
    if (f.kind === 'number' || f.kind === 'integer') {
      const n = Number(value)
      if (!Number.isFinite(n)) return '—'
      return n.toLocaleString('en-US')
    }
    if (f.kind === 'boolean') return value ? 'yes' : 'no'
    return String(value)
  }

  // Rounding presets
  const ROUND_OPTIONS: { label: string; value: number | null }[] = [
    { label: 'none', value: null },
    { label: 'R1',   value: 1 },
    { label: 'R10',  value: 10 },
    { label: 'R50',  value: 50 },
    { label: 'R100', value: 100 }
  ]
  const currentRoundTo = $derived.by(() => {
    if (!paramsValidation.ok) return null
    const p = paramsValidation.parsed as any
    const r = p?.round_to
    return typeof r === 'number' ? r : null
  })
  function setRoundTo(value: number | null) {
    let parsed: Record<string, unknown> = {}
    if (paramsValidation.ok && paramsValidation.parsed) {
      parsed = { ...(paramsValidation.parsed as Record<string, unknown>) }
    } else if (pricingParamsRaw.trim() === '') {
      parsed = {}
    } else {
      return
    }
    if (value == null) delete parsed.round_to
    else parsed.round_to = value
    pricingParamsRaw = Object.keys(parsed).length === 0 ? '' : JSON.stringify(parsed, null, 2)
  }

  // Click a field slug to insert it as a JSON string at the cursor.
  let copiedSlug = $state<string | null>(null)
  function insertField(f: FieldDef) {
    const ta = document.getElementById('pricing-params') as HTMLTextAreaElement | null
    const insertion = `"${f.slug}"`
    if (ta) {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const before = pricingParamsRaw.slice(0, start)
      const after = pricingParamsRaw.slice(end)
      pricingParamsRaw = before + insertion + after
      queueMicrotask(() => {
        ta.focus()
        const pos = start + insertion.length
        ta.setSelectionRange(pos, pos)
      })
    } else {
      pricingParamsRaw = pricingParamsRaw + insertion
    }
    // Also copy to clipboard for convenience
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(f.slug).catch(() => {})
    }
    copiedSlug = f.slug
    setTimeout(() => { if (copiedSlug === f.slug) copiedSlug = null }, 1000)
  }
</script>

<PageHead title={`Item Type: ${type.name}`} lede={type.description ?? ''}>
  <Button variant="ghost" size="sm" href="/item-types">← Back</Button>
  {#if can('items', 'delete') && items.length === 0}
    <SubmitButton
      action="?/delete"
      label="Delete"
      pendingLabel="Deleting…"
      variant="danger"
      size="sm"
      confirm={{
        title: 'Delete item type?',
        message: `Permanently delete ${type.name}? Cannot undo.`,
        variant: 'danger'
      }}
    />
  {/if}
  {#if can('items', 'update')}
    <Button
      type="submit"
      form="type-form"
      size="sm"
      loading={saving}
      disabled={!paramsValidation.ok}
      title={paramsValidation.ok ? '' : 'Pricing Params JSON is invalid — fix or click Format'}
    >
      {saving ? 'Saving…' : 'Save Changes'}
    </Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<nav class="tabs" role="tablist">
  {#each TABS as t}
    <a
      role="tab"
      aria-selected={activeTab === t.key}
      class="tab"
      class:is-active={activeTab === t.key}
      href={tabHref(t.key)}
      data-sveltekit-noscroll
    >
      {t.label}
    </a>
  {/each}
</nav>

<form
  method="POST"
  action="?/update"
  id="type-form"
  autocomplete="off"
  onsubmit={(e) => { if (!paramsValidation.ok) { e.preventDefault(); goto(tabHref('pricing'), { replaceState: true, noScroll: true }) } }}
  use:enhance={() => {
    saving = true
    return async ({ update }) => {
      await update({ reset: false })
      saving = false
    }
  }}
>
  <!-- ── IDENTITY ── -->
  <div class="pane" class:is-active={activeTab === 'identity'}>
    <!-- Slug is the technical handle used by code (formula references,
         routing, type-table mapping). Kept as a hidden input so save still
         works, but not surfaced visually — most admins never need it. -->
    <input type="hidden" name="slug" value={slug} />
    <FieldGrid cols={1}>
      <Field name="name" label="Name" value={name} required oninput={(v) => name = v} />
    </FieldGrid>
    <FieldGrid cols={1}>
      <Field name="description" label="Description" value={description} oninput={(v) => description = v} />
    </FieldGrid>
  </div>

  <!-- ── PRICING ── -->
  <div class="pane" class:is-active={activeTab === 'pricing'}>
    <FieldGrid cols={1}>
      <Field label="Inputs from">
        <div class="readonly mono">{detailsTable ?? 'items.base_rate'}</div>
      </Field>
    </FieldGrid>

    <p class="hint">
      Set <span class="mono">expression</span> to a formula referencing field slugs (click chips below to insert).
      Optional <span class="mono">round_to</span> rounds the result up to the nearest multiple. Empty params → falls back to <span class="mono">items.base_rate</span>.
    </p>

    <div class="params-row">
      <div class="params-row-left">
        <label class="params-label" for="pricing-params">Pricing Params (JSON)</label>
        {#if !pricingParamsRaw.trim()}
          <span class="status-chip neutral">empty</span>
        {:else if paramsValidation.ok}
          <span class="status-chip ok">✓ valid</span>
        {:else}
          <span class="status-chip bad" title={paramsValidation.error}>✗ invalid</span>
        {/if}
      </div>
      <div class="params-actions">
        {#if pricingParamsRaw.trim()}
          <Button variant="ghost" size="sm" type="button" onclick={formatJson}>
            Format
          </Button>
        {/if}
      </div>
    </div>

    <div class="json-editor" class:has-error={!paramsValidation.ok && pricingParamsRaw.trim().length > 0}>
      <textarea
        id="pricing-params"
        name="pricing_params"
        class="json-input"
        rows="10"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        placeholder={'{\n  "expression": "area_sqm * (1 + aesthetic_impact) * start_price_per_m2",\n  "round_to": 10\n}'}
        bind:value={pricingParamsRaw}
        onkeydown={onParamsKeydown}
      ></textarea>
    </div>

    <div class="json-status">
      {#if !pricingParamsRaw.trim()}
        <span class="muted small">Empty — strategy will use defaults baked into the engine.</span>
      {:else if paramsValidation.ok}
        <span class="ok small">✓ Valid JSON</span>
      {:else}
        <span class="error small">✗ {paramsValidation.error}</span>
      {/if}
    </div>

    <div class="round-row">
      <span class="round-label">round_to</span>
      <div class="round-tags">
        {#each ROUND_OPTIONS as r (r.label)}
          <button
            type="button"
            class="round-tag"
            class:is-active={currentRoundTo === r.value}
            onclick={() => setRoundTo(r.value)}
            title={r.value == null ? 'No rounding' : `Round up to nearest ${r.value}`}
          >
            {r.label}
          </button>
        {/each}
      </div>
    </div>

    {#if currentFields.length > 0}
      <div class="field-ref">
        <div class="field-ref-head">
          <span class="field-ref-label">
            Available fields from <span class="mono">{slug}_details</span>
          </span>
          <span class="muted small">click to insert into JSON</span>
        </div>
        <div class="field-tags">
          {#each currentFields as f (f.slug)}
            <button
              type="button"
              class="field-tag"
              class:copied={copiedSlug === f.slug}
              onclick={() => insertField(f)}
              title={`${f.label} · ${f.kind}${f.unit ? ' (' + f.unit + ')' : ''}`}
            >
              <span class="ft-slug">{f.slug}</span>
              <span class="ft-kind">{f.kind}</span>
              {#if copiedSlug === f.slug}<span class="ft-copied">✓</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- ── POLICY ── -->
  <div class="pane" class:is-active={activeTab === 'policy'}>
    <FieldGrid cols={4}>
      <label class="checkbox-field">
        <input type="checkbox" name="requires_license" bind:checked={requiresLicense} />
        <span>Requires Licence</span>
      </label>
      <label class="checkbox-field">
        <input type="checkbox" name="sellable_ad_hoc" bind:checked={sellableAdHoc} />
        <span>Sellable Ad-hoc</span>
      </label>
      <label class="checkbox-field">
        <input type="checkbox" name="sellable_recurring" bind:checked={sellableRecurring} />
        <span>Sellable Recurring</span>
      </label>
      <label class="checkbox-field">
        <input type="checkbox" name="apply_pro_rata" bind:checked={applyProRata} />
        <span>Apply Pro-rata</span>
      </label>
    </FieldGrid>
  </div>

  <!-- ── FIELDS (read-only schema view) ── -->
  <div class="pane" class:is-active={activeTab === 'fields'}>
    {#if currentFields.length === 0}
      <p class="empty">No metadata fields for this item type. (No <span class="mono">{slug}_details</span> table.)</p>
    {:else}
      <p class="hint">
        Schema for <span class="mono">{slug}_details</span> — {currentFields.length} field{currentFields.length === 1 ? '' : 's'}.
      </p>
      <table class="schema">
        <thead>
          <tr>
            <th>Slug</th>
            <th>Label</th>
            <th>Type</th>
            <th>Options / Unit</th>
          </tr>
        </thead>
        <tbody>
          {#each currentFields as f (f.slug)}
            <tr>
              <td class="mono">{f.slug}</td>
              <td>{f.label}</td>
              <td><Badge tone="default">{f.kind}</Badge></td>
              <td class="mono muted small">
                {#if f.options}{f.options.join(', ')}{:else if f.unit}{f.unit}{:else}—{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- ── ITEMS USING THIS TYPE ── -->
  <div class="pane" class:is-active={activeTab === 'items'}>
    <h3 class="section-title">Items using this type ({items.length})</h3>
    {#if items.length === 0}
      <p class="empty">No items currently use this type.</p>
    {:else}
      <div class="items-tbl-wrap">
        <table class="items-tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              {#each formulaVars as f (f.slug)}
                <th class="align-right" title={f.label}>{f.slug}</th>
              {/each}
              <th class="align-right">Base Rate</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each items as i (i.id)}
              <tr>
                <td>{i.name}</td>
                <td class="muted small">{i.locations?.short_name ?? i.locations?.name ?? '—'}</td>
                {#each formulaVars as f (f.slug)}
                  <td class="mono align-right">{fmtDetail(i.details?.[f.slug], f)}</td>
                {/each}
                <td class="mono align-right">{fmtMoney(i.base_rate)}</td>
                <td>
                  {#if i.active}<Badge tone="success">active</Badge>{:else}<Badge tone="default">inactive</Badge>{/if}
                </td>
                <td><a href={`/items/${i.id}`}>Edit →</a></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</form>

<RecordHistory table="item_types" id={type?.id} />

<style>
  .tabs {
    display: flex;
    gap: var(--space-4);
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-4);
    padding: 0;
    background: transparent;
  }
  .tab {
    display: inline-block;
    padding: var(--space-2) 0;
    color: var(--text-muted);
    text-decoration: none;
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    border-radius: 0;
    box-shadow: none;
  }
  .tab:hover { color: var(--text); }
  .tab.is-active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    background: transparent;
  }

  .pane { display: none; padding-top: var(--space-2); }
  .pane.is-active { display: block; }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: 0 0 var(--space-2);
  }

  .empty { color: var(--text-muted); font-size: var(--text-sm); }
  .hint  { color: var(--text-muted); font-size: var(--text-xs); margin: 0 0 var(--space-3); }
  .muted { color: var(--text-muted); }
  .small { font-size: var(--text-xs); }
  .mono  { font-family: var(--font-mono); }
  .align-right { text-align: right; }

  .readonly {
    padding: var(--space-2) var(--space-3);
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-sm);
    min-height: 38px;
    display: flex;
    align-items: center;
    text-transform: none;       /* defeat any inherited uppercase */
    letter-spacing: 0;
    font-weight: var(--weight-normal, 400);
  }

  .strategy-panel {
    margin: var(--space-3) 0;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .desc {
    color: var(--text);
    font-size: var(--text-xs);
    line-height: 1.5;
    margin: 0 0 var(--space-2);
  }
  .outputs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .outputs .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
    margin-right: 4px;
  }

  .params-row {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
    margin: var(--space-3) 0 var(--space-1);
  }
  .params-row-left { display: inline-flex; align-items: center; gap: var(--space-2); }
  .params-actions { display: inline-flex; gap: var(--space-2); }

  .status-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    border: 1px solid transparent;
    text-transform: none;
    letter-spacing: 0;
  }
  .status-chip.ok      { background: var(--success-soft, #d4edda); color: var(--success, #2d6a35); border-color: var(--success, #2d6a35); }
  .status-chip.bad     { background: #fdecea;                       color: var(--danger,  #c0392b); border-color: var(--danger,  #c0392b); }
  .status-chip.neutral { background: var(--surface-sunk, #fafafa);  color: var(--text-muted);       border-color: var(--border); }
  .params-label {
    font-size: var(--text-xs);
    color: var(--label-color);
    font-weight: var(--weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .json-editor {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-sunk, #fafafa);
    overflow: hidden;
  }
  .json-editor:focus-within { outline: 2px solid var(--accent); border-color: var(--accent); }
  .json-editor.has-error { border-color: var(--danger, #c0392b); }
  .json-editor.has-error:focus-within { outline-color: var(--danger, #c0392b); }
  .json-input {
    display: block;
    width: 100%;
    border: none;
    background: transparent;
    padding: var(--space-2) var(--space-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text);
    resize: vertical;
    tab-size: 2;
  }
  .json-input:focus { outline: none; }

  .json-status {
    margin-top: var(--space-1);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
  }
  .ok    { color: var(--success, #2d6a35); }
  .error { color: var(--danger, #c0392b); }

  .round-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding: 6px 10px;
    background: var(--surface-sunk, #fafafa);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .round-label {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: var(--text-muted);
  }
  .round-tags {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .round-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    transition: background-color 120ms, border-color 120ms, color 120ms;
  }
  .round-tag:hover {
    background: var(--accent-soft, #e6f0e8);
    border-color: var(--accent);
  }
  .round-tag.is-active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent, #fff);
  }

  .field-ref {
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-sunk, #fafafa);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .field-ref-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .field-ref-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
  }
  .field-ref-label .mono { text-transform: none; letter-spacing: 0; font-weight: var(--weight-normal, 400); }

  .field-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .field-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    transition: background-color 120ms, border-color 120ms;
  }
  .field-tag:hover {
    background: var(--accent-soft, #e6f0e8);
    border-color: var(--accent);
  }
  .field-tag.copied {
    background: var(--success-soft, #d4edda);
    border-color: var(--success, #2d6a35);
  }
  .ft-slug { font-weight: var(--weight-medium); }
  .ft-kind { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
  .ft-copied { color: var(--success, #2d6a35); font-weight: var(--weight-semibold); }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text);
    padding-top: 18px;
  }
  .checkbox-field input { width: 16px; height: 16px; accent-color: var(--accent); }

  .items-tbl-wrap { overflow-x: auto; }

  .schema, .items-tbl {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    font-size: var(--text-sm);
    background: var(--surface);
  }
  .schema th, .items-tbl th {
    text-align: left;
    padding: 8px 12px;
    background: var(--surface-sunk, #fafafa);
    border-bottom: 1px solid var(--border);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
  }
  .schema th.align-right, .items-tbl th.align-right { text-align: right; }
  .schema td, .items-tbl td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .schema tbody tr:last-child td,
  .items-tbl tbody tr:last-child td { border-bottom: none; }
  .schema tbody tr:hover,
  .items-tbl tbody tr:hover { background: var(--surface-sunk, #fafafa); }
  .items-tbl a { color: var(--accent); text-decoration: none; font-size: var(--text-sm); }
  .items-tbl a:hover { text-decoration: underline; }

</style>
