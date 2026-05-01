<script lang="ts">
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { enhance } from '$app/forms'
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    Button,
    PageHead,
    Toast,
    Notice,
    DataTable,
    Card,
    KpiCard,
    FormCard,
    Field,
    FieldGrid,
    Select,
    Badge,
    Copyable,
    RecordLive,
    RecordHistory, ErrorBanner, SubmitButton, RowMenu
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'
  import { fmtMoney, fmtMoneyWithCurrency } from '$lib/utils/money'

  let { data, form } = $props()

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  let saving = $state(false)
  let addingTxnFor = $state<string | null>(null)
  let addingCustomer = $state(false)
  let editingSubId = $state<string | null>(null)

  // ── Licence add-form state ──────────────────────────────────────────
  // Cascading dropdowns: Item Type + Location filter the Membership/item
  // list. Picking an item populates location_id automatically, so the
  // submitted row stays internally consistent regardless of how the user
  // narrowed the search. Restricted to items whose item_type has
  // requires_license = true (memberships in current usage).
  // Inline expand-to-edit on the licences table. Clicking a row toggles
  // this id; the DataTable's `expanded` snippet renders the edit form
  // beneath the row. Resets to null on save success or Cancel.
  let expandedLicId = $state<string | null>(null)
  let showAddLicence = $state(false)
  let licTypeId = $state<string>('')
  let licLocationId = $state<string>('')
  let licItemId = $state<string>('')
  let licUserId = $state<string>('')
  let licStartedAt = $state<string>(new Date().toISOString().slice(0, 10))
  let licEndedAt = $state<string>('')
  let licNotes = $state<string>('')

  // ── New-member shortcut (WSM-style: name + email + licence in one go) ──
  // When true, the Add Licence form's Member dropdown is replaced with
  // three fields. The server action creates the person first, then runs
  // createLicence with the new person's id. Email collisions surface
  // through the existing error banner.
  let licNewMember = $state(false)
  let licNewFirstName = $state<string>('')
  let licNewLastName = $state<string>('')
  let licNewEmail = $state<string>('')

  type LicenceableItem = { id: string; name: string; item_type_id: string; location_id: string }
  const licenceableItems = $derived((data.licenceableItems as LicenceableItem[]) ?? [])
  const licenceableTypes = $derived((data.licenceableItemTypes as { id: string; name: string; slug: string }[]) ?? [])
  const filteredLicItems = $derived(
    licenceableItems.filter(i =>
      (!licTypeId || i.item_type_id === licTypeId) &&
      (!licLocationId || i.location_id === licLocationId)
    )
  )
  // Drop a stale item selection if the filters changed it out of view.
  $effect(() => {
    if (licItemId && !filteredLicItems.some(i => i.id === licItemId)) licItemId = ''
  })

  // Members of this org who don't yet hold any active licence here. Surfaced
  // below the licences table so the operator can spot gaps and add one in
  // a single click.
  const membersWithoutLicences = $derived.by(() => {
    const licensedIds = new Set((data.licences as any[]).map(l => l.user_id).filter(Boolean))
    return (data.members as any[]).filter(m => !licensedIds.has(m.id))
  })

  function resetLicForm() {
    licTypeId = ''
    licLocationId = ''
    licItemId = ''
    licUserId = ''
    licStartedAt = new Date().toISOString().slice(0, 10)
    licEndedAt = ''
    licNotes = ''
    licNewMember = false
    licNewFirstName = ''
    licNewLastName = ''
    licNewEmail = ''
    showAddLicence = false
  }

  // Open the Add Licence form pre-populated for a specific member.
  function addLicenceFor(memberId: string) {
    licTypeId = ''
    licLocationId = ''
    licItemId = ''
    licUserId = memberId
    licStartedAt = new Date().toISOString().slice(0, 10)
    licEndedAt = ''
    licNotes = ''
    showAddLicence = true
    queueMicrotask(() => {
      document.getElementById('org-add-licence-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  $effect(() => {
    if (form?.success) resetLicForm()
  })
  let addingProduct = $state(false)
  let addLocationId = $state<string>('')
  let addItemId = $state<string>('')
  let addBaseRate = $state<string>('')

  // Auto-fill the base rate from the chosen item; user can still overwrite.
  $effect(() => {
    if (!addItemId) { addBaseRate = ''; return }
    const it = (data.items as any[]).find(i => i.id === addItemId)
    if (!it) return
    addBaseRate = it.base_rate != null ? String(it.base_rate) : ''
  })

  // Selected sub IDs for "Create Invoice" / "Create Quote"
  let selectedSubIds = $state<Set<string>>(new Set())
  function toggleSubSelected(id: string) {
    const s = new Set(selectedSubIds)
    if (s.has(id)) s.delete(id); else s.add(id)
    selectedSubIds = s
  }
  function toggleAllSubs() {
    const all = (data.subs as any[]).map(s => s.id)
    if (selectedSubIds.size === all.length) selectedSubIds = new Set()
    else selectedSubIds = new Set(all)
  }

  $effect(() => {
    if (form?.success) {
      saving = false
      addingTxnFor = null
      addingCustomer = false
      editingSubId = null
      addingProduct = false
    }
  })

  // Default the add form's location to the home location; reset item when loc changes
  $effect(() => {
    if (addingProduct && !addLocationId && homeLocation) {
      addLocationId = homeLocation.id
    }
  })
  $effect(() => {
    // Clear stale item when location changes
    const options = itemOptionsForLocation(addLocationId || null)
    if (addItemId && !options.find(o => o.value === addItemId)) addItemId = ''
  })

  // ---------- tabs ----------

  const TABS = [
    { key: 'properties',    label: 'Properties' },
    { key: 'licences',      label: 'Licences' },
    { key: 'subscription',  label: 'Subscription' },
    { key: 'contract',      label: 'Contract' },
    { key: 'accounting',    label: 'Accounting' },
    { key: 'banking',       label: 'Banking' },
    { key: 'attachments',   label: 'Attachments' },
    { key: 'members',       label: 'Members' },
    { key: 'invoices',      label: 'Invoices' },
    { key: 'lifecycle',     label: 'Lifecycle' },
    { key: 'printing',      label: 'Printing' },
    { key: 'parking',       label: 'Parking' },
    { key: 'crm',           label: 'CRM ↗' }
  ] as const

  const activeTab = $derived(($page.url.searchParams.get('tab') ?? 'properties'))

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
          goto('/organisations')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------- helpers ----------

  function toDateInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  }

  function fmtDate(v: string | null): string {
    if (!v) return '—'
    const d = new Date(v)
    if (isNaN(d.getTime())) return '—'
    return d.toISOString().slice(0, 10)
  }

  const money = (value: number | null | undefined, currency: string) => fmtMoneyWithCurrency(value, currency)
  const num = (value: number | null | undefined) => fmtMoney(value ?? 0)

  function orgStatusTone(s: string): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    if (s === 'active') return 'success'
    if (s === 'prospect') return 'info'
    if (s === 'paused') return 'warning'
    if (s === 'offboarded' || s === 'inactive') return 'danger'
    return 'default'
  }

  function subStatusTone(s: string): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    if (s === 'signed' || s === 'active') return 'success'
    if (s === 'draft' || s === 'option' || s === 'pending') return 'info'
    if (s === 'paused') return 'warning'
    if (s === 'ended' || s === 'cancelled' || s === 'expired' || s === 'superseded') return 'danger'
    return 'default'
  }

  function invoiceStatusTone(s: string): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    if (s === 'paid') return 'success'
    if (s === 'sent' || s === 'authorised') return 'info'
    if (s === 'draft' || s === 'quote') return 'default'
    if (s === 'cancelled') return 'danger'
    return 'default'
  }

  function txnKindTone(k: string): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    if (k === 'topup') return 'success'
    if (k === 'draw') return 'info'
    if (k === 'refund') return 'warning'
    return 'default'
  }

  // ---------- derived ----------

  const org = $derived(data.organisation as any)
  const primaryAccCustomer = $derived(
    (data.accountingCustomers ?? []).find((c: any) => c.is_primary) ?? data.accountingCustomers?.[0] ?? null
  )

  // Subs enriched with Ex VAT / VAT / Incl VAT (per-row)
  const subsWithTotals = $derived.by(() => {
    return (data.subs as any[]).map(s => {
      const qty = Number(s.quantity ?? 1)
      const rate = Number(s.base_rate ?? 0)
      const discount = 0  // future: resolve from subscription_line_rules
      const exVat = rate * qty - discount
      const taxPct = Number(s.tax_percentage ?? 15)
      const vat = exVat * (taxPct / 100)
      const inclVat = exVat + vat
      return { ...s, _qty: qty, _rate: rate, _discount: discount, _exVat: exVat, _vat: vat, _inclVat: inclVat }
    })
  })

  const subsTotals = $derived.by(() => {
    let qty = 0, ex = 0, vat = 0, incl = 0
    for (const s of subsWithTotals as any[]) {
      qty += s._qty; ex += s._exVat; vat += s._vat; incl += s._inclVat
    }
    return { qty, ex, vat, incl }
  })

  // Home location = most common location across this org's active subs
  const homeLocation = $derived.by(() => {
    const counts = new Map<string, { id: string; name: string; n: number }>()
    for (const s of (data.subs as any[])) {
      if (!s.location_id || !s.location_name) continue
      const e = counts.get(s.location_id) ?? { id: s.location_id, name: s.location_name, n: 0 }
      e.n += 1
      counts.set(s.location_id, e)
    }
    const sorted = [...counts.values()].sort((a, b) => b.n - a.n)
    return sorted[0] ?? null
  })

  // Derived currency from org or first location
  const currency = $derived(org.billing_currency ?? (data.locations?.[0] as any)?.currency ?? 'ZAR')

  const homeLocationShort = $derived(
    homeLocation
      ? ((data.locations as any[]).find(l => l.id === homeLocation.id)?.short_name ?? homeLocation.name)
      : null
  )
  const pageLede = $derived(
    homeLocationShort
      ? `${org.short_name ?? org.name} at ${homeLocationShort}`
      : (org.short_name ?? '')
  )

  // ---------- option arrays ----------

  const orgStatusOptions = [
    { value: 'prospect', label: 'Prospect' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'offboarded', label: 'Offboarded' },
    { value: 'inactive', label: 'Inactive' }
  ]
  const orgTypeOptions = [
    { value: 'member', label: 'Member' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'supplier', label: 'Supplier' },
    { value: 'partner', label: 'Partner' },
    { value: 'internal', label: 'Internal' }
  ]
  const currencyOptions = [
    { value: 'ZAR', label: 'ZAR' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
    { value: 'GBP', label: 'GBP' },
    { value: 'KES', label: 'KES' },
    { value: 'NGN', label: 'NGN' }
  ]
  const providerOptions = [
    { value: 'xero', label: 'Xero' },
    { value: 'sage', label: 'Sage' },
    { value: 'msd', label: 'MSD' },
    { value: 'quickbooks', label: 'QuickBooks' }
  ]
  const txnKindOptions = [
    { value: 'topup', label: 'Top-up' },
    { value: 'draw', label: 'Draw' },
    { value: 'refund', label: 'Refund' },
    { value: 'adjustment', label: 'Adjustment' }
  ]

  const personOptions = $derived([
    { value: '', label: 'Unset' },
    ...(data.persons as any[]).map(p => ({
      value: p.id,
      label: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || p.id
    }))
  ])

  const locationOptions = $derived(
    (data.locations as any[]).map(l => ({ value: l.id, label: l.short_name ?? l.name }))
  )

  const subsellableItems = $derived.by(() => {
    return (data.items as any[]).filter((i: any) => i.item_types?.sellable_recurring)
  })
  const itemOptionsForLocation = $derived.by(() => {
    return (loc: string | null) => {
      const all = subsellableItems as any[]
      return all
        .filter((i: any) => !loc || i.location_id === loc)
        .map((i: any) => {
          const rate = i.base_rate
          const suffix = rate != null && Number.isFinite(Number(rate))
            ? ` (${fmtMoney(Number(rate))})`
            : ''
          return { value: i.id, label: `${i.name}${suffix}` }
        })
    }
  })

  // ---------- licence table ----------

  type LicenceRow = {
    id: string
    item_name: string | null
    user_name: string | null
    location_name: string | null
    base_rate: number | null
    currency: string | null
    started_at: string | null
    ended_at: string | null
  }

  const licenceColumns: Column<LicenceRow>[] = [
    { key: 'location_name', label: 'Location', sortable: true, width: '16%' },
    { key: 'item_name', label: 'Description', sortable: true, width: '26%' },
    { key: 'user_name', label: 'Member', sortable: true, width: '22%' },
    { key: 'base_rate', label: 'Rate', sortable: true, width: '12%', align: 'right', mono: true,
      get: l => Number(l.base_rate ?? 0),
      render: l => l.base_rate != null ? money(Number(l.base_rate), l.currency ?? currency) : '—' },
    { key: 'started_at', label: 'Started', sortable: true, width: '12%', date: true },
    { key: 'ended_at', label: 'Ended', sortable: true, width: '12%', date: true, hideBelow: 'sm' }
  ]

  // ---------- invoice table (WSM Invoices expandable) ----------

  type InvoiceRow = {
    id: string
    reference: string | null
    kind: string
    direction: string
    status: string
    total: number
    currency: string
    issued_at: string | null
    due_at: string | null
    updated_at: string | null
    amount_due: number
    amount_paid: number
  }

  const invoiceColumns: Column<InvoiceRow>[] = [
    { key: 'updated_at', label: 'Last Updated', sortable: true, width: '16%', date: true },
    { key: 'issued_at', label: 'Date', sortable: true, width: '11%', date: true },
    { key: 'due_at', label: 'Due Date', sortable: true, width: '11%', date: true, hideBelow: 'sm' },
    { key: 'reference', label: 'Invoice #', sortable: true, width: '14%', mono: true },
    { key: 'title', label: 'Reference', width: '20%', muted: true, hideBelow: 'md',
      get: (i: any) => i.title ?? '' },
    { key: 'status', label: 'Status', width: '10%' },
    { key: 'total', label: 'Invoice Total', sortable: true, width: '9%', align: 'right', mono: true,
      get: i => Number(i.total), render: (i: any) => money(i.total, i.currency) },
    { key: 'amount_due', label: 'Amount Due', sortable: true, width: '9%', align: 'right', mono: true,
      get: i => Number(i.amount_due), render: (i: any) => money(i.amount_due, i.currency) }
  ]

  const invoiceFilters: Filter<InvoiceRow>[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft', test: i => i.status === 'draft' },
    { key: 'sent', label: 'Sent', test: i => i.status === 'sent' || i.status === 'authorised' },
    { key: 'paid', label: 'Paid', test: i => i.status === 'paid' },
    { key: 'outstanding', label: 'Outstanding', test: i => Number(i.amount_due ?? 0) > 0 && i.status !== 'cancelled' }
  ]

  const invoiceKpis = $derived.by(() => {
    const invoices = data.invoices as InvoiceRow[]
    const c = org?.billing_currency ?? 'ZAR'
    let totalInvoiced = 0, outstanding = 0, paid = 0, draft = 0
    for (const i of invoices) {
      if (i.status === 'cancelled') continue
      totalInvoiced += Number(i.total ?? 0)
      outstanding += Number(i.amount_due ?? 0)
      paid += Number(i.amount_paid ?? 0)
      if (i.status === 'draft') draft += Number(i.total ?? 0)
    }
    return { totalInvoiced, outstanding, paid, draft, currency: c }
  })

  // ---------- member table ----------

  type MemberRow = { id: string; first_name: string; last_name: string; email: string | null; job_title: string | null; status: string }
  const memberColumns: Column<MemberRow>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '26%', get: m => `${m.first_name} ${m.last_name}` },
    { key: 'email', label: 'Email', width: '32%', muted: true, ellipsis: true },
    { key: 'job_title', label: 'Job Title', width: '22%', muted: true, hideBelow: 'md' },
    { key: 'status', label: 'Status', width: '12%' }
  ]

  // ---------- delete ----------
  let confirmDelete = $state(false)
</script>

<RecordLive tableName="organisations" recordId={org.id} viewerId={data.viewerId ?? null} label="organisation" />

<PageHead title={`Organisation: ${org.name}`} lede={pageLede}>
  <Button variant="ghost" size="sm" href="/organisations">← Back</Button>
  {#if activeTab === 'properties' && can('organisations', 'update')}
    <Button type="submit" form="update-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
  {/if}
  {#if can('organisations', 'delete')}
    <Button variant="danger" size="sm" onclick={() => confirmDelete = true}>Delete</Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

{#if org.status === 'prospect'}
  <Notice tone="warning">
    {#snippet children()}
      <strong>Please Note:</strong> Organisation is a prospect and cannot be onboarded until it is set to pending.
    {/snippet}
    {#snippet action()}
      <form method="POST" action="?/setStatus" use:enhance>
        <input type="hidden" name="status" value="pending" />
        <button type="submit" class="btn-set-status">Set to Pending</button>
      </form>
    {/snippet}
  </Notice>
{/if}
{#if org.hidden}
  <Notice tone="danger">
    {#snippet children()}<strong>Please Note:</strong> Organisation is Hidden.{/snippet}
  </Notice>
{/if}

<nav class="tabs" aria-label="Organisation sections">
  {#each TABS as t}
    <a class="tab" class:is-active={activeTab === t.key} href={tabHref(t.key)}>{t.label}</a>
  {/each}
</nav>

<div class="tab-body">
  {#if activeTab === 'properties'}
    <!-- PROPERTIES -->
    <FormCard action="?/update" id="update-form"
      onSubmit={() => { saving = true }}
      onResult={() => { saving = false }}>

      <div class="two-col">
        <div class="col">
          <FieldGrid cols={1}>
            <Field name="name" label="Name" value={org.name} required />
            <Field label="ID">
              <div class="ro-input"><Copyable value={org.id}>{org.id}</Copyable></div>
            </Field>
            <Field name="legal_name" label="Legal Name" value={org.legal_name ?? ''} />
            <Field name="short_name" label="Short Name" value={org.short_name ?? ''} />
            <Field name="slug" label="UHID" value={org.slug ?? ''} />
            <Field label="Home Location">
              <div class="ro-input muted">{homeLocation?.name ?? 'Derived from active subscriptions'}</div>
            </Field>
            <Field name="industry" label="Industry Sector" value={org.industry ?? ''} />
            <Field label="Status">
              <Select name="status" value={org.status ?? 'active'} options={orgStatusOptions} />
            </Field>
            <Field label="Type">
              <Select name="type" value={org.type ?? 'member'} options={orgTypeOptions} />
            </Field>
            <Field label="Billing Currency">
              <Select name="billing_currency" value={org.billing_currency ?? 'ZAR'} options={currencyOptions} />
            </Field>
          </FieldGrid>
        </div>

        <div class="col">
          <FieldGrid cols={1}>
            <Field label="Primary Member">
              <div class="ro-input muted">Derived from licences</div>
            </Field>
            <Field label="Signatory Member">
              <Select name="signatory_person_id" value={org.signatory_person_id ?? ''} options={personOptions} />
            </Field>
            <Field name="email" label="Primary Email" type="email" value={org.email ?? ''} />
            <Field name="phone" label="Phone" value={org.phone ?? ''} />
            <Field name="website" label="Website" value={org.website ?? ''} />
            <Field label="Parent Organisation">
              <Select name="parent_organisation_id" value={org.parent_organisation_id ?? ''}
                options={[
                  { value: '', label: 'None' },
                  ...(data.organisations as any[]).map(o => ({ value: o.id, label: o.name }))
                ]} />
            </Field>
            <Field label="Xero Customer ID">
              {#if primaryAccCustomer}
                <div class="ro-input mono"><Copyable value={primaryAccCustomer.accounting_external_customer_id} ellipsis /></div>
              {:else}
                <div class="ro-input muted">Not linked — add on Accounting tab</div>
              {/if}
            </Field>
            <Field name="vat_number" label="VAT #" value={org.vat_number ?? ''} />
            <Field name="company_registration_number" label="Company Reg #" value={org.company_registration_number ?? ''} />
          </FieldGrid>
        </div>
      </div>

      <h3 class="section-title">Lifecycle</h3>
      <FieldGrid cols={3}>
        <Field name="started_at" label="Started" type="date" value={toDateInput(org.started_at)} />
        <Field name="onboarded_at" label="Onboarded" type="date" value={toDateInput(org.onboarded_at)} />
        <Field name="offboarded_at" label="Offboarded" type="date" value={toDateInput(org.offboarded_at)} />
      </FieldGrid>

      <h3 class="section-title">Accounting Address</h3>
      <FieldGrid cols={2}>
        <Field name="accounting_email" label="Accounting Email" type="email" value={org.accounting_email ?? ''} full />
        <Field name="accounting_address_line_1" label="Address Line 1" value={org.accounting_address_line_1 ?? ''} />
        <Field name="accounting_address_line_2" label="Address Line 2" value={org.accounting_address_line_2 ?? ''} />
        <Field name="accounting_city" label="City" value={org.accounting_city ?? ''} />
        <Field name="accounting_postal_code" label="Postal Code" value={org.accounting_postal_code ?? ''} />
        <Field name="accounting_country_code" label="Country Code" value={org.accounting_country_code ?? ''} placeholder="e.g. ZA" />
      </FieldGrid>

      <h3 class="section-title">Delivery Address</h3>
      <FieldGrid cols={2}>
        <Field name="delivery_address_line_1" label="Address Line 1" value={org.delivery_address_line_1 ?? ''} />
        <Field name="delivery_address_line_2" label="Address Line 2" value={org.delivery_address_line_2 ?? ''} />
        <Field name="delivery_city" label="City" value={org.delivery_city ?? ''} />
        <Field name="delivery_postal_code" label="Postal Code" value={org.delivery_postal_code ?? ''} />
        <Field name="delivery_country_code" label="Country Code" value={org.delivery_country_code ?? ''} placeholder="e.g. ZA" />
      </FieldGrid>

      {#snippet actions()}
        <span class="meta-info">
          <Badge tone={orgStatusTone(org.status)}>{org.status}</Badge>
          <Badge tone="info">{org.type}</Badge>
          {#if org.wsm_id}<span class="wsm">WSM: {org.wsm_id}</span>{/if}
        </span>
      {/snippet}
    </FormCard>

    <RecordHistory aggregateRoot="organisations" id={org?.id} label="organisation history" />

  {:else if activeTab === 'licences'}
    <!-- LICENCES -->
    <div class="lic-tab-toolbar">
      {#if can('subscriptions', 'create')}
        <Button size="sm" onclick={() => (showAddLicence = !showAddLicence)}>
          {showAddLicence ? 'Cancel' : '+ Add Licence'}
        </Button>
      {/if}
    </div>

    {#if showAddLicence && can('subscriptions', 'create')}
      <Card padding="md">
        <form
          method="POST"
          action="?/addLicence"
          id="org-add-licence-form"
          use:enhance={() => {
            saving = true
            return async ({ update }) => { await update({ reset: false }); saving = false }
          }}
        >
          <FieldGrid cols={3}>
            <Field label="Item Type">
              <Select
                value={licTypeId}
                onchange={(v) => (licTypeId = v)}
                placeholder="All licence types"
                options={[{ value: '', label: 'All licence types' }, ...licenceableTypes.map(t => ({ value: t.id, label: t.name }))]}
              />
            </Field>
            <Field label="Location">
              <Select
                value={licLocationId}
                onchange={(v) => (licLocationId = v)}
                placeholder="All locations"
                options={[{ value: '', label: 'All locations' }, ...(data.locations as any[]).map(l => ({ value: l.id, label: l.short_name ?? l.name }))]}
              />
            </Field>
            <Field label="Membership / item *">
              <Select
                name="item_id"
                value={licItemId}
                onchange={(v) => (licItemId = v)}
                placeholder={filteredLicItems.length === 0 ? 'No matching items' : 'Pick an item'}
                options={filteredLicItems.map(i => ({ value: i.id, label: i.name }))}
              />
            </Field>
          </FieldGrid>
          <FieldGrid cols={3}>
            {#if !licNewMember}
              <Field label="Member *">
                <div class="member-picker">
                  <Select
                    name="user_id"
                    value={licUserId}
                    onchange={(v) => (licUserId = v)}
                    placeholder="Pick a member"
                    options={((data.members as any[]) ?? []).map(p => ({ value: p.id, label: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || p.id }))}
                  />
                  <button type="button" class="link-btn" onclick={() => { licNewMember = true; licUserId = '' }}>+ New member</button>
                </div>
              </Field>
            {:else}
              <Field label="New member">
                <div class="member-picker">
                  <span class="muted small">Will be created in this org.</span>
                  <button type="button" class="link-btn" onclick={() => { licNewMember = false; licNewFirstName = ''; licNewLastName = ''; licNewEmail = '' }}>Pick existing instead</button>
                </div>
              </Field>
            {/if}
            <Field name="started_at" label="Start *" type="date" value={licStartedAt} oninput={(v) => (licStartedAt = v)} />
            <Field name="ended_at" label="End (optional)" type="date" value={licEndedAt} oninput={(v) => (licEndedAt = v)} />
          </FieldGrid>
          {#if licNewMember}
            <FieldGrid cols={3}>
              <Field name="new_member_first_name" label="First name *" value={licNewFirstName} oninput={(v) => (licNewFirstName = v)} />
              <Field name="new_member_last_name" label="Last name *" value={licNewLastName} oninput={(v) => (licNewLastName = v)} />
              <Field name="new_member_email" label="Email *" type="email" value={licNewEmail} oninput={(v) => (licNewEmail = v)} />
            </FieldGrid>
          {/if}
          <FieldGrid cols={1}>
            <Field name="notes" label="Notes" value={licNotes} oninput={(v) => (licNotes = v)} />
          </FieldGrid>

          <!-- location_id is taken from the picked item so the row is
               internally consistent regardless of which location the
               user used as a filter. -->
          <input
            type="hidden"
            name="location_id"
            value={
              filteredLicItems.find(i => i.id === licItemId)?.location_id
              ?? licLocationId
              ?? ''
            }
          />

          <div class="lic-form-actions">
            <Button type="button" size="sm" variant="ghost" onclick={() => (showAddLicence = false)}>Cancel</Button>
            <Button
              type="submit"
              size="sm"
              loading={saving}
              disabled={
                !licItemId
                || !licStartedAt
                || (licNewMember
                    ? (!licNewFirstName.trim() || !licNewLastName.trim() || !licNewEmail.trim())
                    : !licUserId)
              }
            >
              {saving ? 'Adding…' : 'Add licence'}
            </Button>
          </div>
        </form>
      </Card>
    {/if}

    <DataTable
      data={data.licences as LicenceRow[]}
      columns={licenceColumns}
      table="org-licences"
      searchFields={['item_name', 'user_name', 'location_name']}
      searchPlaceholder="Search item, member, location…"
      csvFilename={`org-${org.slug ?? org.id}-licences`}
      empty="No licences yet — click + Add Licence above."
      onRowClick={(l) => (expandedLicId = expandedLicId === l.id ? null : l.id)}
      isExpandedRow={(l) => l.id === expandedLicId}
    >
      {#snippet row(l: any)}
        <td>{l.location_name ?? '—'}</td>
        <td>
          <Badge tone="info">Licence</Badge>
          <span class="primary">{l.item_name ?? '—'}</span>
        </td>
        <td>{l.user_name ?? '—'}</td>
        <td class="num mono">{l.base_rate != null ? money(Number(l.base_rate), l.currency ?? currency) : '—'}</td>
        <td class="date">{fmtDate(l.started_at)}</td>
        <td class="date hide-sm">{fmtDate(l.ended_at)}</td>
      {/snippet}
      {#snippet expanded(l: any)}
        <form
          method="POST"
          action="?/updateLicence"
          use:enhance={() => {
            saving = true
            return async ({ update, result }) => {
              await update({ reset: false })
              saving = false
              if (result.type === 'success') expandedLicId = null
            }
          }}
        >
          <input type="hidden" name="id" value={l.id} />
          <FieldGrid cols={3}>
            <Field label="Member">
              <Select
                name="user_id"
                value={l.user_id ?? ''}
                options={(data.members as any[]).map(m => ({
                  value: m.id,
                  label: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || m.id
                }))}
              />
            </Field>
            <Field name="started_at" label="Start" type="date" value={l.started_at?.slice(0, 10) ?? ''} />
            <Field name="ended_at" label="End (optional)" type="date" value={l.ended_at?.slice(0, 10) ?? ''} />
          </FieldGrid>
          <FieldGrid cols={1}>
            <Field name="notes" label="Notes" value={l.notes ?? ''} />
          </FieldGrid>
          <div class="lic-edit-actions">
            <Button type="button" size="sm" variant="ghost" onclick={() => (expandedLicId = null)}>Cancel</Button>
            {#if can('subscriptions', 'delete')}
              <SubmitButton
                action="?/removeLicence"
                label="End licence"
                pendingLabel="Ending…"
                variant="danger"
                size="sm"
                fields={{ id: l.id }}
                confirm={{
                  title: 'End licence?',
                  message: `Remove this licence for ${l.item_name ?? 'this item'}? It will disappear from the list.`,
                  variant: 'danger'
                }}
              />
            {/if}
            <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      {/snippet}
    </DataTable>

    {#if membersWithoutLicences.length > 0}
      <Card padding="md">
        <div class="without-lic-head">
          <h3 class="without-lic-title">Members without a licence</h3>
          <span class="without-lic-count">{membersWithoutLicences.length}</span>
        </div>
        <ul class="without-lic-list">
          {#each membersWithoutLicences as m}
            <li>
              <span class="primary">{`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || m.id}</span>
              <span class="muted">{m.job_title ?? ''}</span>
              {#if can('subscriptions', 'create')}
                <Button size="sm" variant="ghost" onclick={() => addLicenceFor(m.id)}>+ Add Licence</Button>
              {/if}
            </li>
          {/each}
        </ul>
      </Card>
    {/if}

  {:else if activeTab === 'subscription'}
    <!-- SUBSCRIPTION (WSM-style rich table) -->
    <section class="section">
      <h2 class="section-head">Subscription</h2>

      <div class="group-actions">
        <Select name="__group_actions" value=""
          options={[
            { value: '', label: 'Group Actions' },
            { value: 'pause', label: 'Pause Selected' },
            { value: 'end', label: 'End Selected' },
            { value: 'delete', label: 'Delete Selected' }
          ]}
          onchange={() => { /* stub */ }} />
      </div>

      <div class="table-wrap">
        <table class="sub-table">
          <thead>
            <tr>
              <th class="check-col">
                <input type="checkbox"
                  checked={selectedSubIds.size > 0 && selectedSubIds.size === (data.subs as any[]).length}
                  onchange={toggleAllSubs} />
              </th>
              <th>Location</th>
              <th>Description</th>
              <th>Member</th>
              <th>Subscription Start/End</th>
              <th class="num">Qty</th>
              <th class="num">Price</th>
              <th class="num">Discount</th>
              <th class="num">Ex VAT</th>
              <th class="num">Incl VAT</th>
              <th class="row-actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {#each subsWithTotals as s (s.id)}
              {#if editingSubId === s.id}
                <!-- INLINE EDIT ROW -->
                <tr class="edit-row">
                  <td colspan="11">
                    <form method="POST" action="?/updateSub" use:enhance={() => {
                      saving = true
                      return async ({ update }) => { await update({ reset: false }); saving = false }
                    }}>
                      <input type="hidden" name="id" value={s.id} />
                      <div class="edit-grid">
                        <div class="ef loc">
                          <label>Location</label>
                          <Select name="location_id" value={s.location_id} options={locationOptions} />
                        </div>
                        <div class="ef desc">
                          <label>Description</label>
                          <input name="description_display" value={s.description_title} readonly class="ro-text" />
                          <textarea name="notes" rows="2" placeholder="Notes…">{s.notes ?? ''}</textarea>
                        </div>
                        <div class="ef member">
                          <label>Member</label>
                          <Select name="user_id" value={s.user_id ?? ''} options={personOptions} />
                        </div>
                        <div class="ef dates">
                          <label>From</label>
                          <input type="date" name="started_at" value={toDateInput(s.started_at)} />
                          <label>To</label>
                          <input type="date" name="ended_at" value={toDateInput(s.ended_at)} />
                        </div>
                        <div class="ef num-field">
                          <label>Qty</label>
                          <input type="number" name="quantity" value={s._qty} step="0.01" />
                        </div>
                        <div class="ef num-field">
                          <label>Price</label>
                          <input type="number" name="base_rate" value={s._rate} step="0.01" />
                        </div>
                        <div class="ef num-field">
                          <label>Discount</label>
                          <input type="number" value="0" step="0.01" disabled />
                        </div>
                        <div class="ef actions">
                          <Button type="submit" size="sm" loading={saving}>Save</Button>
                          <Button type="button" variant="ghost" size="sm" onclick={() => editingSubId = null}>Cancel</Button>
                        </div>
                      </div>
                    </form>
                  </td>
                </tr>
              {:else}
                <tr class="sub-row" class:selected={selectedSubIds.has(s.id)}>
                  <td class="check-col">
                    <input type="checkbox" checked={selectedSubIds.has(s.id)}
                      onchange={() => toggleSubSelected(s.id)} />
                  </td>
                  <td data-label="Location">{s.location_name ?? '—'}</td>
                  <td data-label="Description">
                    <div class="desc-cell">
                      <div class="desc-head">
                        <Badge tone={s.source_kind === 'License' ? 'info' : 'success'}>{s.source_kind}</Badge>
                        <span class="primary">{s.description_title}</span>
                      </div>
                      {#if s.notes}
                        <div class="desc-sub muted">{s.notes}</div>
                      {/if}
                    </div>
                  </td>
                  <td data-label="Member">
                    {#if s.member_name}
                      <span class="primary">{s.member_name}</span>
                      {#if homeLocation}<Badge tone="default">{homeLocation.name}</Badge>{/if}
                    {:else}
                      <span class="muted">—</span>
                    {/if}
                  </td>
                  <td class="date" data-label="Start / End">{fmtDate(s.started_at)} / {s.ended_at ? fmtDate(s.ended_at) : '∞'}</td>
                  <td class="num mono" data-label="Qty">{s._qty}</td>
                  <td class="num mono" data-label="Price">{num(s._rate)}</td>
                  <td class="num mono" data-label="Discount">{num(s._discount)}</td>
                  <td class="num mono" data-label="Ex VAT">{num(s._exVat)}</td>
                  <td class="num mono" data-label="Incl VAT">{num(s._inclVat)}</td>
                  <td class="row-actions-col">
                    <button class="row-btn" onclick={() => editingSubId = s.id} aria-label="Edit">⋮</button>
                  </td>
                </tr>
              {/if}
            {:else}
              <tr><td colspan="11" class="empty-row">No subscription lines yet.</td></tr>
            {/each}
          </tbody>
          {#if subsWithTotals.length > 0}
            <tfoot>
              <tr class="totals-row">
                <td colspan="5" class="total-label">Totals</td>
                <td class="num mono">{subsTotals.qty}</td>
                <td class="num mono"></td>
                <td class="num mono"></td>
                <td class="num mono">{num(subsTotals.ex)}</td>
                <td class="num mono">{num(subsTotals.incl)}</td>
                <td></td>
              </tr>
            </tfoot>
          {/if}
        </table>
      </div>

      <!-- Add row buttons -->
      <div class="sub-add-bar">
        {#if addingProduct}
          <form method="POST" action="?/createSub" use:enhance={() => {
            saving = true
            return async ({ update }) => { await update({ reset: true }); saving = false }
          }} class="add-product-form">
            <Select name="location_id" bind:value={addLocationId} options={locationOptions} placeholder="Location" />
            <Select name="item_id" bind:value={addItemId} options={itemOptionsForLocation(addLocationId || null)} placeholder="Item" />
            <Select name="user_id" value="" options={personOptions} placeholder="Member" />
            <input type="date" name="started_at" value={new Date().toISOString().slice(0, 10)} />
            <input type="number" name="quantity" value="1" step="0.01" placeholder="Qty" />
            <input type="number" name="base_rate" bind:value={addBaseRate} step="0.01" placeholder="Price" />
            <Button type="submit" size="sm" loading={saving}>Add</Button>
            <Button type="button" variant="ghost" size="sm" onclick={() => { addingProduct = false; addLocationId = ''; addItemId = '' }}>Cancel</Button>
          </form>
        {:else}
          {#if can('subscriptions', 'create')}
            <Button variant="ghost" size="sm" onclick={() => addingProduct = true}>+ Add a product</Button>
            <Button variant="ghost" size="sm">+ Add an ad hoc line item</Button>
            <Button variant="ghost" size="sm">+ Add a deposit</Button>
          {/if}
        {/if}
      </div>

      <!-- Create invoice section -->
      <div class="create-invoice-block">
        <h3 class="ci-head">Create invoice</h3>
        <div class="ci-meta muted">
          {selectedSubIds.size === 0
            ? 'All line items selected'
            : `${selectedSubIds.size} of ${(data.subs as any[]).length} line items selected`}
        </div>
        <div class="ci-actions">
          <form method="POST" action="?/createInvoiceFromSubs" use:enhance={() => {
            saving = true
            return async ({ update }) => { await update(); saving = false }
          }}>
            {#each (selectedSubIds.size === 0 ? (data.subs as any[]).map(s => s.id) : [...selectedSubIds]) as id}
              <input type="hidden" name="sub_id" value={id} />
            {/each}
            <input type="hidden" name="kind" value="invoice" />
            <Button type="submit" size="sm" loading={saving}>Create Invoice</Button>
          </form>
          <form method="POST" action="?/createInvoiceFromSubs" use:enhance={() => {
            saving = true
            return async ({ update }) => { await update(); saving = false }
          }}>
            {#each (selectedSubIds.size === 0 ? (data.subs as any[]).map(s => s.id) : [...selectedSubIds]) as id}
              <input type="hidden" name="sub_id" value={id} />
            {/each}
            <input type="hidden" name="kind" value="quote" />
            <Button type="submit" size="sm" variant="ghost" loading={saving}>Create Quote</Button>
          </form>
        </div>
      </div>
    </section>

  {:else if activeTab === 'invoices'}
    <!-- INVOICES -->
    <div class="kpi-row">
      <KpiCard label="Total Invoiced" value={money(invoiceKpis.totalInvoiced, invoiceKpis.currency)} />
      <KpiCard label="Outstanding" value={money(invoiceKpis.outstanding, invoiceKpis.currency)} tone="warning" />
      <KpiCard label="Paid" value={money(invoiceKpis.paid, invoiceKpis.currency)} tone="positive" />
      <KpiCard label="Draft" value={money(invoiceKpis.draft, invoiceKpis.currency)} tone="info" />
    </div>

    <div class="inv-bar">
      {#if can('invoices', 'create')}
        <form method="POST" action="?/createBlankInvoice" use:enhance={() => {
          saving = true
          return async ({ update }) => { await update(); saving = false }
        }}>
          <Button type="submit" size="sm" loading={saving}>New Invoice</Button>
        </form>
      {/if}
      <Button size="sm" variant="ghost" onclick={() => window.location.reload()}>Get Invoices</Button>
    </div>

    <DataTable
      data={data.invoices as InvoiceRow[]}
      columns={invoiceColumns}
      filters={invoiceFilters}
      table="org-invoices"
      searchFields={['reference', 'status', 'kind', 'direction', 'title']}
      searchPlaceholder="Search #, status, reference…"
      csvFilename={`org-${org.slug ?? org.id}-invoices`}
      empty="No invoices yet."
      onRowClick={(i) => goto(`/invoices/${i.id}/edit`)}
    >
      {#snippet row(i: any)}
        <td class="date">{fmtDate(i.updated_at ?? i.created_at)}</td>
        <td class="date">{fmtDate(i.issued_at)}</td>
        <td class="date hide-sm">{fmtDate(i.due_at)}</td>
        <td class="mono"><Copyable value={i.reference ?? i.id.slice(0, 8)}><span class="primary">{i.reference ?? '—'}</span></Copyable></td>
        <td class="muted hide-md">{i.title ?? '—'}</td>
        <td><Badge tone={invoiceStatusTone(i.status)}>{i.status}</Badge></td>
        <td class="num mono">{money(i.total, i.currency)}</td>
        <td class="num mono">{money(i.amount_due, i.currency)}</td>
      {/snippet}
    </DataTable>

  {:else if activeTab === 'contract'}
    <!-- CONTRACT (existing simple list) -->
    <DataTable
      data={data.contracts}
      columns={[
        { key: 'reference', label: 'Reference', sortable: true, width: '22%', mono: true },
        { key: 'type', label: 'Type', width: '18%', muted: true },
        { key: 'signed_at', label: 'Signed', sortable: true, width: '14%', date: true, hideBelow: 'sm' },
        { key: 'status', label: 'Status', width: '12%' },
        { key: 'started_at', label: 'Started', sortable: true, width: '14%', date: true, hideBelow: 'md' },
        { key: 'ended_at', label: 'Ended', sortable: true, width: '14%', date: true, hideBelow: 'md' }
      ]}
      table="org-contracts"
      searchFields={['reference', 'type', 'status']}
      searchPlaceholder="Search reference, type…"
      empty="No contracts yet."
      onRowClick={(c: any) => goto(`/contracts?id=${c.id}`)}
    />

  {:else if activeTab === 'accounting'}
    <!-- ACCOUNTING (existing rich view) -->
    <section class="sub-section">
      <div class="sub-head">
        <h2>External Accounting Customers</h2>
        {#if can('organisations', 'update')}
          <Button size="sm" onclick={() => addingCustomer = !addingCustomer}>
            {addingCustomer ? 'Cancel' : '+ Link Customer'}
          </Button>
        {/if}
      </div>

      {#if addingCustomer && can('organisations', 'update')}
        <FormCard action="?/addAccountingCustomer" id="add-customer-form"
          onSubmit={() => { saving = true }} onResult={() => { saving = false }}>
          <FieldGrid cols={4}>
            <Field label="Provider">
              <Select name="provider" value="xero" options={providerOptions} />
            </Field>
            <Field name="accounting_external_tenant_id" label="Tenant ID" required />
            <Field name="accounting_external_customer_id" label="Customer ID" required />
            <Field name="accounting_external_customer_code" label="Customer Code" />
          </FieldGrid>
          <label class="checkbox-field">
            <input type="checkbox" name="is_primary" />
            <span>Primary customer record</span>
          </label>
          {#snippet actions()}
            <Button type="submit" size="sm" loading={saving}>{saving ? 'Linking…' : 'Link Customer'}</Button>
          {/snippet}
        </FormCard>
      {/if}

      <Card padding="md">
        {#if data.accountingCustomers.length === 0}
          <div class="empty-box">No external accounting customers linked yet.</div>
        {:else}
          <table class="simple-table">
            <thead><tr>
              <th>Provider</th><th>Tenant</th><th>Customer ID</th><th>Code</th><th>Primary</th><th>Connected</th>
            </tr></thead>
            <tbody>
              {#each data.accountingCustomers as c}
                <tr>
                  <td><Badge tone="info">{c.provider}</Badge></td>
                  <td class="mono ellipsis-cell"><Copyable value={c.accounting_external_tenant_id} ellipsis /></td>
                  <td class="mono"><Copyable value={c.accounting_external_customer_id} /></td>
                  <td class="mono muted">{c.accounting_external_customer_code ?? '—'}</td>
                  <td>{c.is_primary ? 'Yes' : '—'}</td>
                  <td class="date">{fmtDate(c.connected_at)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </Card>
    </section>

    <section class="sub-section">
      <div class="sub-head"><h2>Wallets</h2></div>
      {#if data.wallets.length === 0}
        <Card padding="md"><div class="empty-box">No wallets.</div></Card>
      {:else}
        {#each data.wallets as w}
          {@const txns = (data.walletTxnsByWalletId[w.id] ?? [])}
          <Card padding="md">
            <div class="wallet-head">
              <div class="wallet-title">
                <Badge tone="info">{w.currency}</Badge>
                <span class="wallet-balance mono">{money(w.balance, w.currency)}</span>
              </div>
              {#if can('wallets', 'update')}
                <Button variant="ghost" size="sm"
                  onclick={() => addingTxnFor = addingTxnFor === w.id ? null : w.id}>
                  {addingTxnFor === w.id ? 'Cancel' : '+ Transaction'}
                </Button>
              {/if}
            </div>
            {#if addingTxnFor === w.id}
              <form method="POST" action="?/addWalletTransaction" class="inline-txn-form"
                use:enhance={() => { saving = true; return async ({ update }) => { await update({ reset: true }); saving = false } }}>
                <input type="hidden" name="wallet_id" value={w.id} />
                <FieldGrid cols={3}>
                  <Field label="Kind"><Select name="kind" value="topup" options={txnKindOptions} /></Field>
                  <Field name="amount" label="Amount (signed)" type="number" required />
                  <Field name="notes" label="Notes" />
                </FieldGrid>
                <div class="inline-txn-actions">
                  <Button type="submit" size="sm" loading={saving}>Add</Button>
                </div>
              </form>
            {/if}
            <div class="txn-block">
              <div class="txn-block-head muted">Recent transactions ({txns.length})</div>
              {#if txns.length === 0}
                <div class="empty-box sm">No transactions yet.</div>
              {:else}
                <div class="txn-list">
                  {#each txns as t}
                    <div class="txn-row">
                      <div class="txn-main">
                        <Badge tone={txnKindTone(t.kind)}>{t.kind}</Badge>
                        <span class="txn-notes muted">{t.notes ?? ''}</span>
                      </div>
                      <div class="txn-meta">
                        <span class="mono txn-amount" class:negative={Number(t.amount) < 0}>
                          {Number(t.amount) >= 0 ? '+' : ''}{money(t.amount, w.currency)}
                        </span>
                        <span class="mono muted txn-balance">= {money(t.balance_after, w.currency)}</span>
                        <span class="muted txn-date">{fmtDate(t.created_at)}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </Card>
        {/each}
      {/if}
    </section>

  {:else if activeTab === 'members'}
    <!-- MEMBERS -->
    <DataTable
      data={data.members as MemberRow[]}
      columns={memberColumns}
      table="org-members"
      searchFields={['first_name', 'last_name', 'email', 'job_title']}
      searchPlaceholder="Search name, email…"
      empty="No members yet."
      onRowClick={(m) => goto(`/people?id=${m.id}`)}
    >
      {#snippet row(m: any)}
        <td><Copyable value={`${m.first_name} ${m.last_name}`}><span class="primary">{m.first_name} {m.last_name}</span></Copyable></td>
        <td class="muted ellipsis-cell"><Copyable value={m.email ?? ''} ellipsis /></td>
        <td class="muted hide-md">{m.job_title ?? '—'}</td>
        <td><Badge tone={m.status === 'active' ? 'success' : m.status === 'offboarded' ? 'danger' : 'default'}>{m.status}</Badge></td>
      {/snippet}
      {#snippet pageActions()}
        {#if can('persons', 'create')}
          <Button size="sm" href={`/people?new=1&org=${org.id}`}>+ Add Member</Button>
        {/if}
      {/snippet}
    </DataTable>

  {:else if activeTab === 'lifecycle'}
    <!-- LIFECYCLE -->
    <Card padding="lg">
      <h3 class="pane-title">Organisation lifecycle</h3>
      <p class="pane-sub">Sign-ups, onboarding milestones, engagement signals, renewals, churn risk. Lives here so the CRM (external, ERPNext) can stay focused on leads + sales while operational health stays in-platform.</p>
      <div class="placeholder">
        <div class="placeholder-icon">✶</div>
        <div>
          <div class="placeholder-title">Lifecycle — coming soon</div>
          <p class="placeholder-body">
            Planned: join date, active licence count, last invoice, last check-in,
            subscription-value trend, churn-risk score, renewal window, NPS.
          </p>
        </div>
      </div>
    </Card>

  {:else if activeTab === 'crm'}
    <!-- CRM — external (ERPNext) -->
    <Card padding="lg">
      <h3 class="pane-title">CRM</h3>
      <p class="pane-sub">Leads, sales pipeline, and contact history live in the external CRM (ERPNext). This tab deep-links into the matching customer record.</p>
      <div class="placeholder">
        <div class="placeholder-icon">↗</div>
        <div>
          <div class="placeholder-title">ERPNext integration — coming soon</div>
          <p class="placeholder-body">
            Once the ERPNext base URL and API key are configured, this tab will
            show a summary card (stage, open opportunities, last activity) and an
            "Open in ERPNext" button that lands on the mapped customer record.
          </p>
        </div>
      </div>
    </Card>

  {:else}
    <!-- Placeholder tabs (Banking, Attachments, Printing, Parking) -->
    <Card padding="lg">
      <div class="empty-box">Coming soon.</div>
    </Card>
  {/if}
</div>

{#if confirmDelete && can('organisations', 'delete')}
  <div class="modal-backdrop" onclick={() => confirmDelete = false} role="presentation"></div>
  <div class="modal" role="alertdialog" aria-modal="true">
    <h3>Delete organisation?</h3>
    <p>Permanently delete <strong>{org.name}</strong>? This cannot be undone.</p>
    <div class="modal-actions">
      <Button variant="ghost" size="sm" onclick={() => confirmDelete = false}>Cancel</Button>
      <form method="POST" action="?/delete" use:enhance>
        <Button type="submit" variant="danger" size="sm">Delete organisation</Button>
      </form>
    </div>
  </div>
{/if}

<style>
  .btn-set-status {
    background: var(--accent, #59a370);
    color: #ffffff;
    border: 1px solid var(--accent, #59a370);
    padding: 0.4rem 1rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: var(--radius-sm, 4px);
  }
  .btn-set-status:hover {
    background: var(--accent-hover, #4e9363);
    border-color: var(--accent-hover, #4e9363);
  }

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

  @media (max-width: 640px) {
    .two-col { grid-template-columns: 1fr; gap: var(--space-3); }
  }

  .tab-body { display: flex; flex-direction: column; gap: var(--space-4); }

  .two-col {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: var(--space-5); margin-bottom: var(--space-2);
  }
  .col { min-width: 0; }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }

  .ro-input {
    padding: 0.4rem 0.6rem;
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-sm);
    height: 32px;
    display: flex; align-items: center;
  }
  .ro-input.mono { font-family: var(--font-mono); font-size: var(--text-xs); }

  .meta-info {
    display: inline-flex; gap: var(--space-2); align-items: center;
    margin-left: auto; color: var(--text-muted); font-size: var(--text-xs);
  }
  .wsm { font-family: var(--font-mono); }

  .checkbox-field {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-sm); color: var(--text); margin-top: var(--space-2);
  }
  .checkbox-field input { width: 16px; height: 16px; accent-color: var(--accent); }

  /* SUBSCRIPTION TAB */
  .section { display: flex; flex-direction: column; gap: var(--space-3); }
  .section-head {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    color: var(--heading-color);
    margin: 0;
  }
  .group-actions { max-width: 200px; }

  .table-wrap {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    overflow-x: auto;
  }
  .sub-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  @media (max-width: 640px) {
    .simple-table { min-width: 560px; }

    /* Sub-table: each row becomes a card stacked vertically. */
    .table-wrap { overflow-x: visible; border: none; background: transparent; box-shadow: none; }
    .sub-table { min-width: 0; display: block; }
    .sub-table thead { display: none; }
    .sub-table tbody, .sub-table tfoot { display: block; }
    .sub-table tr {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-areas:
        "check title actions"
        "body body body";
      gap: 6px 10px;
      padding: var(--space-3);
      margin-bottom: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
    }
    .sub-table tr.selected { background: var(--accent-soft); }
    .sub-table td {
      display: block;
      padding: 4px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    }
    .sub-table td[data-label]::before {
      content: attr(data-label);
      display: block;
      font-size: 10px;
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 2px;
    }
    /* Header row inside the card: checkbox + location + actions */
    .sub-table td.check-col { grid-area: check; padding: 0; border-bottom: none; }
    .sub-table td.row-actions-col { grid-area: actions; padding: 0; border-bottom: none; }
    /* The Location cell is the 2nd td (first `data-label`) — promote it to title */
    .sub-table td[data-label="Location"] {
      grid-area: title;
      padding: 0;
      font-weight: var(--weight-semibold);
      font-size: 1rem;
      border-bottom: none;
    }
    .sub-table td[data-label="Location"]::before { display: none; }
    /* Everything else flows as the card body */
    .sub-table td[data-label]:not([data-label="Location"]) {
      grid-column: 1 / -1;
    }
    .sub-table td:last-of-type, .sub-table tr > td[data-label]:last-of-type { border-bottom: none; }
    .sub-table td.num { text-align: left; }

    /* Edit-row keeps full-width; breaking it out of the card is fine */
    .sub-table tr.edit-row {
      display: block;
      padding: var(--space-3);
      grid-template-columns: none;
      grid-template-areas: none;
    }
    .sub-table tr.edit-row td[colspan] {
      display: block;
      border: none;
      padding: 0;
    }

    /* Empty placeholder row */
    .sub-table tr:has(td.empty-row) {
      display: block;
      padding: var(--space-3);
    }

    /* Totals row: keep simple, span all */
    .sub-table tfoot tr.totals-row {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;
      padding: var(--space-3);
      background: var(--surface-sunk);
    }
    .sub-table tfoot tr.totals-row td {
      display: inline;
      padding: 0;
      border: none;
    }
    .sub-table tfoot tr.totals-row td[colspan] { flex-basis: 100%; font-weight: var(--weight-semibold); }
    .sub-table tfoot tr.totals-row td::before { display: none; }
  }
  .sub-table thead th {
    background: var(--accent);
    color: white;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: none;
    letter-spacing: 0;
  }
  .sub-table thead th.num { text-align: right; }
  .sub-table thead th.check-col { width: 32px; padding: 0 var(--space-2); }
  .sub-table thead th.row-actions-col { width: 32px; padding: 0; }
  .sub-table tbody td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .sub-table tbody td.num { text-align: right; }
  .sub-table tbody td.check-col { width: 32px; padding: 0 var(--space-2); }
  .sub-table tbody td.row-actions-col { width: 32px; padding: 0; }
  .sub-row.selected { background: var(--accent-soft); }
  .sub-row:hover { background: var(--surface-sunk); }
  .sub-row input[type="checkbox"] { width: 14px; height: 14px; accent-color: var(--accent); }

  .desc-cell { display: flex; flex-direction: column; gap: 2px; }
  .desc-head { display: inline-flex; gap: var(--space-2); align-items: center; }
  .desc-sub { font-size: var(--text-xs); }

  .row-btn {
    background: transparent; border: none;
    color: var(--text-muted); cursor: pointer;
    padding: var(--space-1);
    font-size: var(--text-md);
  }
  .row-btn:hover { color: var(--text); }

  .empty-row { text-align: center; color: var(--text-muted); padding: var(--space-5); font-size: var(--text-sm); }

  tfoot .totals-row {
    background: var(--surface-sunk);
    font-weight: var(--weight-semibold);
  }
  tfoot .totals-row td { border-bottom: none; padding: var(--space-2) var(--space-3); }
  .total-label { text-align: right; color: var(--text-muted); }

  .edit-row td {
    padding: var(--space-3) !important;
    background: var(--surface-sunk);
  }
  .edit-grid {
    display: grid;
    grid-template-columns: 160px 1fr 160px 180px 80px 90px 90px auto;
    gap: var(--space-2);
    align-items: end;
  }
  .ef { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ef label {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: var(--tracking-wide, 0.08em);
    color: var(--label-color);
    font-weight: var(--weight-semibold);
  }
  .ef input, .ef textarea, .ef :global(select) {
    padding: 0.4rem 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--text-sm);
    font-family: inherit;
  }
  .ef input.ro-text { background: var(--surface-sunk); color: var(--text-muted); }
  .ef .actions { flex-direction: row; gap: var(--space-2); }

  .sub-add-bar {
    display: flex; gap: var(--space-2); padding: var(--space-2);
    background: var(--surface-sunk); border-radius: var(--radius-sm);
    flex-wrap: wrap;
  }
  .add-product-form {
    display: grid;
    grid-template-columns: 160px 1fr 160px 130px 80px 90px auto auto;
    gap: var(--space-2); align-items: center; width: 100%;
  }
  .add-product-form input, .add-product-form :global(select) {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    font-size: var(--text-sm);
    height: 30px;
  }

  .create-invoice-block {
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    display: flex; flex-direction: column; gap: var(--space-2);
  }
  .ci-head { font-size: var(--text-md); margin: 0; color: var(--heading-color); font-weight: var(--weight-semibold); }
  .ci-meta { font-size: var(--text-xs); }
  .ci-actions { display: flex; gap: var(--space-2); }

  /* INVOICES TAB */
  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); }
  .inv-bar { display: flex; gap: var(--space-2); margin-bottom: var(--space-2); }

  /* ACCOUNTING TAB (existing bits) */
  .sub-section { display: flex; flex-direction: column; gap: var(--space-2); }
  .sub-head {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: var(--space-1);
  }
  .sub-head h2 {
    font-size: var(--text-md); font-weight: var(--weight-semibold);
    color: var(--heading-color); margin: 0;
  }
  .empty-box {
    padding: var(--space-3); background: var(--surface-sunk);
    border-radius: var(--radius-sm); color: var(--text-muted);
    font-size: var(--text-sm); text-align: center;
  }
  .pane-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    margin: 0 0 var(--space-1);
    color: var(--text);
  }
  .pane-sub {
    margin: 0 0 var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
    max-width: 640px;
  }
  .placeholder {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-4);
    background: var(--surface-sunk);
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    color: var(--text-muted);
  }
  .placeholder-icon {
    font-size: 22px;
    color: var(--accent);
    opacity: 0.6;
    line-height: 1;
    flex-shrink: 0;
  }
  .placeholder-title {
    font-weight: var(--weight-semibold);
    color: var(--text);
    font-size: var(--text-sm);
    margin-bottom: 4px;
  }
  .placeholder-body {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .empty-box.sm { padding: var(--space-2); }
  .simple-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .simple-table th {
    text-align: left; padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs); font-weight: var(--weight-semibold);
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--label-color); border-bottom: 2px solid var(--border);
    background: var(--surface-sunk);
  }
  .simple-table td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border); vertical-align: middle;
  }
  .simple-table tr:last-child td { border-bottom: none; }
  .simple-table td.mono { font-family: var(--font-mono); font-size: var(--text-xs); }
  .simple-table td.muted { color: var(--text-muted); }
  .simple-table td.date { color: var(--text-muted); white-space: nowrap; }
  .ellipsis-cell { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .wallet-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: var(--space-3);
  }
  .wallet-title { display: inline-flex; align-items: center; gap: var(--space-3); }
  .wallet-balance { font-size: var(--text-lg); font-weight: var(--weight-bold); color: var(--text); }
  .inline-txn-form {
    padding: var(--space-3); background: var(--surface-sunk);
    border-radius: var(--radius-sm); margin-bottom: var(--space-3);
  }
  .inline-txn-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
  .txn-block { display: flex; flex-direction: column; gap: var(--space-2); }
  .txn-block-head {
    font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em;
  }
  .txn-list { display: flex; flex-direction: column; gap: var(--space-1); }
  .txn-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-sunk); border-radius: var(--radius-sm);
    font-size: var(--text-sm); gap: var(--space-3);
  }
  .txn-main { display: flex; gap: var(--space-2); align-items: center; min-width: 0; flex: 1; }
  .txn-notes { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txn-meta { display: inline-flex; gap: var(--space-3); align-items: center; flex-shrink: 0; }
  .txn-amount { color: var(--success); font-weight: var(--weight-medium); }
  .txn-amount.negative { color: var(--danger); }
  .txn-balance, .txn-date { font-size: var(--text-xs); }

  /* Global td helpers */
  :global(td.date) { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  :global(td.mono) { font-family: var(--font-mono); }
  :global(td.num) { text-align: right; }
  :global(td.align-right) { text-align: right; }
  .primary { color: var(--text); font-weight: var(--weight-medium); }
  .muted { color: var(--text-muted); }

  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4);
    z-index: 200; animation: fadeIn 150ms var(--ease-out);
  }
  .modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: var(--surface-raised); border: 1px solid var(--border);
    border-radius: var(--radius-md); box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    padding: var(--space-5); min-width: 360px; max-width: 520px; z-index: 201;
  }
  .modal h3 {
    font-size: var(--text-md); font-weight: var(--weight-semibold);
    color: var(--heading-color); margin: 0 0 var(--space-2);
  }
  .modal p {
    color: var(--text-muted); font-size: var(--text-sm);
    margin: 0 0 var(--space-4); line-height: var(--line-normal);
  }
  .modal-actions {
    display: flex; gap: var(--space-2); justify-content: flex-end; align-items: center;
  }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

  @media (max-width: 1100px) {
    .edit-grid { grid-template-columns: 1fr 1fr; }
    .add-product-form { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 900px) {
    .two-col { grid-template-columns: 1fr; }
    .kpi-row { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 640px) {
    .kpi-row { grid-template-columns: 1fr; }
    :global(.hide-sm) { display: none; }
  }
  @media (max-width: 900px) {
    :global(.hide-md) { display: none; }
  }

  .lic-tab-toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-3);
  }
  .lic-form-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-3);
  }
  .lic-edit-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-3);
    align-items: center;
  }
  .member-picker {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .link-btn {
    background: transparent;
    border: none;
    color: var(--accent, #2d6a35);
    font-size: var(--text-sm);
    cursor: pointer;
    padding: 0;
    text-align: left;
    align-self: flex-start;
  }
  .link-btn:hover { text-decoration: underline; }
  .without-lic-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .without-lic-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .without-lic-count {
    background: var(--surface-sunk, #f0eee6);
    color: var(--text-muted, #5a7060);
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .without-lic-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .without-lic-list li {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--surface-sunk, #f0eee6);
  }
  .without-lic-list li:last-child { border-bottom: none; }
</style>
