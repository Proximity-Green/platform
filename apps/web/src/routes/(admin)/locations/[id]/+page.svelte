<script lang="ts">
  import { page } from '$app/stores'
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    Button,
    PageHead,
    Toast,
    Card,
    FormCard,
    Field,
    FieldGrid,
    Select,
    Badge,
    Copyable,
    RecordHistory,
    ErrorBanner
  } from '$lib/components/ui'

  let { data, form } = $props()

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  let saving = $state(false)
  let addingCode = $state(false)
  let editingCodeId = $state<string | null>(null)

  // New-tracking-code form state. Name auto-derives from code as "<CODE> at <short>"
  // until the user manually edits Name; from then on, we leave it alone.
  let newTcCode = $state('')
  let newTcName = $state('')
  let newTcNameTouched = $state(false)
  function resetNewTcFields() {
    newTcCode = ''
    newTcName = ''
    newTcNameTouched = false
  }

  $effect(() => {
    if (form?.success) {
      saving = false
      addingCode = false
      editingCodeId = null
      resetNewTcFields()
    }
  })

  const TABS = [
    { key: 'properties', label: 'Properties' },
    { key: 'contact',    label: 'Contact' },
    { key: 'accounting', label: 'Accounting' },
    { key: 'stationery', label: 'Stationery' },
    { key: 'tracking',   label: 'Tracking Codes' }
  ] as const

  const statusOptions = [
    { value: 'active',   label: 'Active' },
    { value: 'paused',   label: 'Paused' },
    { value: 'closed',   label: 'Closed' },
    { value: 'planned',  label: 'Planned' },
    { value: 'inactive', label: 'Inactive' }
  ]
  const currencyOptions = [
    { value: 'ZAR', label: 'ZAR' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
    { value: 'GBP', label: 'GBP' },
    { value: 'KES', label: 'KES' },
    { value: 'NGN', label: 'NGN' }
  ]
  const areaUnitOptions = [
    { value: 'sqm', label: 'Square metres' },
    { value: 'sqft', label: 'Square feet' }
  ]
  const billingDatePatternOptions = [
    { value: 'advance_dated', label: 'Advance-dated (1st of month)' },
    { value: 'arrears', label: 'Arrears (end of month)' }
  ]
  const timezoneOptions = [
    { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg' },
    { value: 'Africa/Nairobi', label: 'Africa/Nairobi' },
    { value: 'Africa/Lagos', label: 'Africa/Lagos' },
    { value: 'Europe/London', label: 'Europe/London' },
    { value: 'UTC', label: 'UTC' }
  ]

  function toDateInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  }

  const activeTab = $derived(($page.url.searchParams.get('tab') ?? 'properties'))

  // Keyboard navigation:
  //   ⌘/Ctrl+Enter — save the form (anywhere, even inside an input)
  //   →             — next tab (when not in a text input)
  //   ←             — previous tab, or back to list at the first tab
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      // ⌘/Ctrl+Enter: save from anywhere — don't skip when focus is in a field
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const form = document.getElementById('update-form') as HTMLFormElement | null
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
          goto('/locations')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function tabHref(key: string): string {
    const u = new URL($page.url)
    u.searchParams.set('tab', key)
    return u.pathname + u.search
  }

  function fmtDate(v: string | null): string {
    if (!v) return '—'
    const d = new Date(v)
    if (isNaN(d.getTime())) return '—'
    return d.toISOString().slice(0, 10)
  }

  function statusTone(s: string): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    if (s === 'active') return 'success'
    if (s === 'paused' || s === 'planned') return 'warning'
    if (s === 'closed' || s === 'inactive') return 'danger'
    return 'default'
  }

  const loc = $derived(data.location as any)

  type TrackingCode = {
    id: string
    location_id: string
    category: string | null
    code: string
    name: string
    accounting_external_category_id: string | null
    accounting_external_option_id: string | null
    is_primary: boolean
    active: boolean
    notes: string | null
  }

  const codes = $derived(data.trackingCodes as TrackingCode[])

  function groupByCategory(rows: TrackingCode[]): { category: string; isUncategorised: boolean; rows: TrackingCode[] }[] {
    const map = new Map<string, TrackingCode[]>()
    for (const r of rows) {
      const k = r.category ?? ''
      ;(map.get(k) ?? map.set(k, []).get(k)!).push(r)
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (!a) return 1
        if (!b) return -1
        return a.localeCompare(b)
      })
      .map(([category, rows]) => ({
        category: category || 'Uncategorised',
        isUncategorised: !category,
        rows
      }))
  }
</script>

<PageHead title={`Location: ${loc.name}`} lede={loc.short_name ?? ''}>
  <Button variant="ghost" size="sm" href="/locations">← Back</Button>
  {#if activeTab !== 'tracking' && can('locations', 'update')}
    <Button type="submit" form="update-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<nav class="tabs" aria-label="Location sections">
  {#each TABS as t}
    <a class="tab" class:is-active={activeTab === t.key} href={tabHref(t.key)}>{t.label}</a>
  {/each}
</nav>

<div class="tab-body">
  {#if activeTab !== 'tracking'}
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
      <!-- ── PROPERTIES ── -->
      <div class="pane" class:is-active={activeTab === 'properties'}>
        <h3 class="section-title">Identity</h3>
        <FieldGrid cols={2}>
          <Field name="name" label="Name" value={loc.name} required />
          <input type="hidden" name="slug" value={loc.slug} />
          <Field name="short_name" label="Short Name" value={loc.short_name ?? ''} />
          <Field label="Legal Entity">
            <Select name="legal_entity_id" value={loc.legal_entity_id ?? ''}
              placeholder="None"
              options={[{ value: '', label: 'None' }, ...(data.legalEntities as any[]).map(e => ({ value: e.id, label: e.name }))]} />
          </Field>
        </FieldGrid>
        <FieldGrid cols={1}>
          <Field name="description" label="Description" value={loc.description ?? ''} />
        </FieldGrid>

        <h3 class="section-title">Commercial</h3>
        <FieldGrid cols={2}>
          <Field label="Area Unit">
            <Select name="area_unit" value={loc.area_unit ?? 'sqm'} options={areaUnitOptions} />
          </Field>
          <Field name="commercial_tax_percentage" label="Tax %" value={loc.commercial_tax_percentage != null ? String(loc.commercial_tax_percentage) : ''} />
          <Field name="commercial_app_discount_percentage" label="App Discount %" value={loc.commercial_app_discount_percentage != null ? String(loc.commercial_app_discount_percentage) : ''} />
          <Field label="Billing Date Pattern">
            <Select name="billing_date_pattern" value={loc.billing_date_pattern ?? 'advance_dated'} options={billingDatePatternOptions} />
          </Field>
        </FieldGrid>

        <h3 class="section-title">Lifecycle</h3>
        <FieldGrid cols={2}>
          <Field label="Status">
            <Select name="status" value={loc.status ?? 'active'} options={statusOptions} />
          </Field>
          <label class="checkbox-field">
            <input type="checkbox" name="headquarters" checked={loc.headquarters} />
            <span>Headquarters</span>
          </label>
          <Field name="started_at" label="Started" type="date" value={toDateInput(loc.started_at)} />
          <Field name="closed_at" label="Closed" type="date" value={toDateInput(loc.closed_at)} />
        </FieldGrid>
      </div>

      <!-- ── CONTACT ── -->
      <div class="pane" class:is-active={activeTab === 'contact'}>
        <h3 class="section-title">Location Manager</h3>
        <FieldGrid cols={2}>
          <Field label="Community Manager">
            <Select name="community_manager_person_id" value={loc.community_manager_person_id ?? ''}
              placeholder="None"
              options={[{ value: '', label: 'None' }, ...(data.persons as any[]).map(p => ({ value: p.id, label: `${p.first_name} ${p.last_name}` }))]} />
          </Field>
        </FieldGrid>

        <h3 class="section-title">Emails &amp; Phones</h3>
        <FieldGrid cols={2}>
          <Field name="email" label="Email" type="email" value={loc.email ?? ''} />
          <Field name="phone" label="Phone" value={loc.phone ?? ''} />
          <Field name="website" label="Website" value={loc.website ?? ''} />
        </FieldGrid>

        <h3 class="section-title">Address</h3>
        <FieldGrid cols={2}>
          <Field name="address_line_1" label="Address Line 1" value={loc.address_line_1 ?? ''} />
          <Field name="address_line_2" label="Address Line 2" value={loc.address_line_2 ?? ''} />
          <Field name="suburb" label="Suburb" value={loc.suburb ?? ''} />
          <Field name="city" label="City" value={loc.city ?? ''} />
          <Field name="postal_code" label="Postal Code" value={loc.postal_code ?? ''} />
          <Field name="country_code" label="Country Code" value={loc.country_code ?? ''} placeholder="e.g. ZA" />
          <Field name="latitude" label="Latitude" value={loc.latitude != null ? String(loc.latitude) : ''} />
          <Field name="longitude" label="Longitude" value={loc.longitude != null ? String(loc.longitude) : ''} />
          <Field label="Timezone">
            <Select name="timezone" value={loc.timezone ?? 'Africa/Johannesburg'} options={timezoneOptions} />
          </Field>
        </FieldGrid>

        <h3 class="section-title">Access</h3>
        <FieldGrid cols={1}>
          <Field name="access_instructions" label="Access Instructions" value={loc.access_instructions ?? ''} />
        </FieldGrid>
      </div>

      <!-- ── ACCOUNTING ── -->
      <div class="pane" class:is-active={activeTab === 'accounting'}>
        <h3 class="section-title">External Tenant</h3>
        <FieldGrid cols={2}>
          <Field
            name="accounting_external_tenant_id"
            label="Accounting External Tenant ID"
            value={loc.accounting_external_tenant_id ?? ''}
            placeholder="e.g. Xero tenant id"
          />
          <Field label="Currency">
            <Select name="currency" value={loc.currency ?? 'ZAR'} options={currencyOptions} />
          </Field>
          <Field name="accounting_tax_type" label="Tax Type" value={loc.accounting_tax_type ?? ''} />
        </FieldGrid>

        <h3 class="section-title">Codes</h3>
        <FieldGrid cols={2}>
          <Field name="accounting_gl_code" label="GL Code" value={loc.accounting_gl_code ?? ''} />
          <Field name="accounting_item_code" label="Item Code" value={loc.accounting_item_code ?? ''} />
          <Field name="accounting_tax_code" label="Tax Code" value={loc.accounting_tax_code ?? ''} />
        </FieldGrid>

        <h3 class="section-title">Banking</h3>
        <FieldGrid cols={2}>
          <Field name="banking_account_number" label="Banking Account #" value={loc.banking_account_number ?? ''} />
          <Field name="banking_bank_code" label="Bank Code" value={loc.banking_bank_code ?? ''} />
        </FieldGrid>
      </div>

      <!-- ── STATIONERY ── -->
      <div class="pane" class:is-active={activeTab === 'stationery'}>
        <h3 class="section-title">Invoice Branding</h3>
        <FieldGrid cols={2}>
          <Field name="accounting_stationery_id" label="Stationery ID" value={loc.accounting_stationery_id ?? ''} />
          <Field name="accounting_branding_theme" label="Branding Theme" value={loc.accounting_branding_theme ?? ''} />
        </FieldGrid>

        <h3 class="section-title">Imagery</h3>
        <FieldGrid cols={2}>
          <Field name="logo_url" label="Logo URL" value={loc.logo_url ?? ''} />
          <Field name="hero_image_url" label="Hero Image URL" value={loc.hero_image_url ?? ''} />
          <Field name="map_image_url" label="Map Image URL" value={loc.map_image_url ?? ''} />
          <Field name="map_link" label="Map Link" value={loc.map_link ?? ''} />
          <Field name="background_colour" label="Background Colour" value={loc.background_colour ?? ''} placeholder="#hex or css" />
        </FieldGrid>
      </div>
    </form>

  {:else if activeTab === 'tracking'}
    <section class="tc-section">
      <div class="tc-toolbar">
        <div class="tc-lede muted">
          One primary per location. Non-primary codes are the sub-locations items can be tagged with.
        </div>
        {#if can('locations', 'update')}
          <Button size="sm" onclick={() => addingCode = !addingCode}>
            {addingCode ? 'Cancel' : '+ Add tracking code'}
          </Button>
        {/if}
      </div>

      {#if addingCode && can('locations', 'update')}
        <FormCard action="?/addTrackingCode" id="add-tc-form"
          onSubmit={() => { saving = true }}
          onResult={() => { saving = false }}>
          <FieldGrid cols={3}>
            <Field name="category" label="Category" value="Location" placeholder="e.g. Region" />
            <Field name="code" label="Code" required placeholder="e.g. WC"
                   value={newTcCode}
                   oninput={(v) => {
                     newTcCode = v
                     if (!newTcNameTouched) {
                       const here = loc.short_name ?? loc.name
                       newTcName = v ? `${v} at ${here}` : ''
                     }
                   }} />
            <Field name="name" label="Name" required placeholder="e.g. Western Cape"
                   value={newTcName}
                   oninput={(v) => { newTcName = v; newTcNameTouched = true }} />
            <Field name="accounting_external_category_id" label="External Category ID" placeholder="accounting-provider-specific" />
            <Field name="accounting_external_option_id" label="External Option ID" placeholder="accounting-provider-specific" />
          </FieldGrid>
          <label class="checkbox-field">
            <input type="checkbox" name="is_primary" />
            <span>Primary for this location</span>
          </label>
          {#snippet actions()}
            <Button type="submit" size="sm" loading={saving}>{saving ? 'Adding…' : 'Add tracking code'}</Button>
            <Button type="button" variant="ghost" size="sm" onclick={() => addingCode = false}>Cancel</Button>
          {/snippet}
        </FormCard>
      {/if}

      {#if codes.length === 0}
        <Card padding="md">
          <div class="empty-box">No tracking codes yet for this location.</div>
        </Card>
      {:else}
          {#each groupByCategory(codes) as group}
            <div class="cat-group">
              <h3 class="cat-head" class:is-uncat={group.isUncategorised}>{group.category}</h3>
              <div class="tc-table-wrap">
                <table class="tc-table">
                  {#if !(group.rows.length === 1 && editingCodeId === group.rows[0].id)}
                    <thead>
                      <tr>
                        <th class="primary-col" aria-label="Primary"></th>
                        <th class="code-col">Code</th>
                        <th>Name</th>
                        <th class="hide-md">Category ID</th>
                        <th class="hide-md">Option ID</th>
                        <th class="active-col">Active</th>
                        <th class="row-actions-col"></th>
                        <th class="row-actions-col"></th>
                      </tr>
                    </thead>
                  {/if}
                  <tbody>
                    {#each group.rows as r (r.id)}
                      {#if editingCodeId === r.id}
                        <tr class="edit-row">
                          <td colspan="8">
                            <form method="POST" action="?/updateTrackingCode" use:enhance={() => {
                              saving = true
                              return async ({ update }) => { await update({ reset: false }); saving = false }
                            }}>
                              <input type="hidden" name="id" value={r.id} />
                              <div class="edit-grid">
                                <label>
                                  <span>Category</span>
                                  <input name="category" value={r.category ?? ''} placeholder="e.g. Region" />
                                </label>
                                <label>
                                  <span>Code *</span>
                                  <input name="code" value={r.code} required />
                                </label>
                                <label class="span2">
                                  <span>Name *</span>
                                  <input name="name" value={r.name} required />
                                </label>
                                <label>
                                  <span>External Category ID</span>
                                  <input name="accounting_external_category_id" value={r.accounting_external_category_id ?? ''} />
                                </label>
                                <label>
                                  <span>External Option ID</span>
                                  <input name="accounting_external_option_id" value={r.accounting_external_option_id ?? ''} />
                                </label>
                              </div>
                              <div class="edit-actions">
                                <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                                <Button type="button" size="sm" variant="ghost" onclick={() => editingCodeId = null}>Cancel</Button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      {:else}
                        <tr class:inactive={!r.active}>
                          <td class="primary-col">
                            {#if r.is_primary}
                              <span class="star" title="Primary">★</span>
                            {:else if can('locations', 'update')}
                              <form method="POST" action="?/setPrimary" use:enhance={() => {
                                saving = true
                                return async ({ update }) => { await update({ reset: false }); saving = false }
                              }}>
                                <input type="hidden" name="id" value={r.id} />
                                <button type="submit" class="star-btn" title="Set primary" aria-label="Set primary">☆</button>
                              </form>
                            {:else}
                              <span class="star-muted">☆</span>
                            {/if}
                          </td>
                          <td class="code-col mono">{r.code}</td>
                          <td>
                            <span class="primary">{r.name}</span>
                            {#if r.is_primary}<Badge tone="info">Primary</Badge>{/if}
                          </td>
                          <td class="mono ellipsis-cell hide-md">
                            {#if r.accounting_external_category_id}
                              <Copyable value={r.accounting_external_category_id} ellipsis />
                            {:else}
                              <span class="muted">—</span>
                            {/if}
                          </td>
                          <td class="mono ellipsis-cell hide-md">
                            {#if r.accounting_external_option_id}
                              <Copyable value={r.accounting_external_option_id} ellipsis />
                            {:else}
                              <span class="muted">—</span>
                            {/if}
                          </td>
                          <td class="active-col">
                            {#if can('locations', 'update')}
                              <form method="POST" action="?/toggleActive" use:enhance={() => {
                                saving = true
                                return async ({ update }) => { await update({ reset: false }); saving = false }
                              }}>
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="active" value={String(r.active)} />
                                <button type="submit" class="toggle" class:on={r.active}
                                  aria-label={r.active ? 'Deactivate' : 'Activate'}
                                  title={r.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
                                  <span class="dot"></span>
                                </button>
                              </form>
                            {:else}
                              <Badge tone={r.active ? 'success' : 'default'}>{r.active ? 'Yes' : 'No'}</Badge>
                            {/if}
                          </td>
                          <td class="row-actions-col">
                            {#if can('locations', 'update')}
                              <button type="button" class="edit-btn" aria-label="Edit" title="Edit"
                                onclick={() => editingCodeId = r.id}>✎</button>
                            {/if}
                          </td>
                          <td class="row-actions-col">
                            {#if can('locations', 'update')}
                              <form method="POST" action="?/deleteTrackingCode" use:enhance={() => {
                                saving = true
                                return async ({ update }) => { await update({ reset: false }); saving = false }
                              }}>
                                <input type="hidden" name="id" value={r.id} />
                                <button type="submit" class="del-btn" aria-label="Delete" title="Delete">×</button>
                              </form>
                            {/if}
                          </td>
                        </tr>
                      {/if}
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/each}
      {/if}
    </section>
  {/if}
</div>

<RecordHistory table="locations" id={loc?.id} />

<style>
  .tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-4);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
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
  .pane + .pane { margin-top: 0; }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-child { margin-top: 0; }
  .checkbox-field {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-sm); color: var(--text); margin-top: var(--space-2);
  }
  .checkbox-field input { width: 16px; height: 16px; accent-color: var(--accent); }

  .ro-input {
    padding: 0.4rem 0.6rem;
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-sm);
    min-height: 32px;
    display: flex; align-items: center;
  }
  .ro-input.mono { font-family: var(--font-mono); font-size: var(--text-xs); }

  .checkbox-field {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-sm); color: var(--text); margin-top: var(--space-2);
  }
  .checkbox-field input { width: 16px; height: 16px; accent-color: var(--accent); }

  .tc-section { display: flex; flex-direction: column; gap: var(--space-3); }

  .tc-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-3); flex-wrap: wrap;
  }
  .tc-lede { font-size: var(--text-xs); max-width: 520px; }

  .cat-group { display: flex; flex-direction: column; gap: var(--space-1); }
  .cat-head {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--label-color);
    margin: 0;
    padding: var(--space-1) 0;
  }
  .cat-head.is-uncat { color: var(--text-subtle); font-style: italic; text-transform: none; letter-spacing: 0; }

  .tc-table-wrap {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    overflow-x: auto;
  }
  .tc-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  @media (max-width: 640px) {
    .tc-table { min-width: 520px; }
  }
  .tc-table thead th {
    background: var(--surface-sunk);
    text-align: left;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--label-color);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }
  .tc-table tbody td {
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .tc-table tbody tr:last-child td { border-bottom: none; }
  .tc-table tbody tr:hover { background: var(--surface-sunk); }
  .tc-table tbody tr.inactive td { opacity: 0.55; }

  .primary-col { width: 32px; text-align: center; padding: 0 var(--space-1); }
  .code-col { width: 110px; }
  .active-col { width: 64px; text-align: center; }
  .row-actions-col { width: 32px; padding: 0; text-align: center; }

  .star { color: var(--accent); font-size: var(--text-md); }
  .star-btn, .del-btn, .edit-btn {
    background: transparent; border: none; cursor: pointer;
    color: var(--text-subtle); font-size: var(--text-md);
    padding: var(--space-1);
  }
  .star-btn:hover { color: var(--accent); }
  .star-muted { color: var(--text-subtle); }
  .edit-btn:hover { color: var(--accent); }
  .del-btn:hover { color: var(--danger); }

  .edit-row td {
    padding: var(--space-3) !important;
    background: var(--surface-sunk);
  }
  .edit-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: var(--space-2) var(--space-3);
    margin-bottom: var(--space-3);
  }
  .edit-grid label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .edit-grid label.span2 { grid-column: span 2; }
  .edit-grid label span {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--label-color);
    font-weight: var(--weight-semibold);
  }
  .edit-grid input {
    padding: 0.4rem 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--text-sm);
    height: 32px;
  }
  .edit-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

  @media (max-width: 900px) {
    .edit-grid { grid-template-columns: 1fr 1fr; }
    .edit-grid label.span2 { grid-column: span 2; }
  }

  .toggle {
    display: inline-flex; align-items: center;
    width: 32px; height: 18px;
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    cursor: pointer; padding: 1px;
    transition: background var(--motion-fast), border-color var(--motion-fast);
  }
  .toggle .dot {
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--text-subtle);
    transition: transform var(--motion-fast), background var(--motion-fast);
  }
  .toggle.on { background: var(--success-soft); border-color: var(--success); }
  .toggle.on .dot { background: var(--success); transform: translateX(14px); }

  .ellipsis-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mono { font-family: var(--font-mono); font-size: var(--text-xs); }
  .primary { color: var(--text); font-weight: var(--weight-medium); margin-right: var(--space-2); }
  .muted { color: var(--text-muted); }

  .empty-box {
    padding: var(--space-3); background: var(--surface-sunk);
    border-radius: var(--radius-sm); color: var(--text-muted);
    font-size: var(--text-sm); text-align: center;
  }

  @media (max-width: 900px) {
    :global(.hide-md) { display: none; }
  }
</style>
