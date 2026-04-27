<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import {
    Button,
    PageHead,
    Toast,
    DataTable,
    Drawer,
    FieldGrid,
    Field,
    Select,
    Badge,
    KpiCard,
    Copyable,
    SubmitButton, ErrorBanner
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'
  import { fmtMoneyWithCurrency } from '$lib/utils/money'

  type Invoice = {
    id: string
    wsm_id: string | null
    kind: 'invoice' | 'credit_note' | 'quote'
    direction: 'customer' | 'supplier'
    status: 'quote' | 'draft' | 'authorised' | 'sent' | 'paid' | 'cancelled'
    parent_invoice_id: string | null
    organisation_id: string
    location_id: string | null
    reference: string | null
    title: string | null
    summary: string | null
    issued_at: string | null
    due_at: string | null
    sent_at: string | null
    paid_at: string | null
    currency: string
    tax_mode: 'inclusive' | 'exclusive'
    sub_total: number
    tax_total: number
    discount_total: number
    total: number
    amount_paid: number
    amount_due: number
    accounting_sync_status: string | null
    accounting_sync_at: string | null
    accounting_sync_error: string | null
    accounting_external_id: string | null
    notes: string | null
    created_at: string
    updated_at: string
    organisation_name: string | null
    location_name: string | null
    line_count: number
  }

  type InvoiceLine = {
    id: string
    invoice_id: string
    subscription_line_id: string | null
    item_id: string | null
    description: string
    quantity: number
    unit_price: number
    tax_rate: number | null
    tax_amount: number
    discount: number
    total: number
    currency: string
    exchange_rate: number | null
    accounting_gl_code: string | null
    accounting_item_code: string | null
    accounting_tax_code: string | null
    accounting_tracking_codes: string[] | null
  }

  let { data, form } = $props()
  let editing = $state<Invoice | null>(null)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { editing = null }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  function toDateInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function toDateTimeInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day}T${h}:${min}`
  }

  const money = (value: number | null | undefined, currency: string) => fmtMoneyWithCurrency(value, currency)

  function statusTone(s: Invoice['status']): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    switch (s) {
      case 'paid': return 'success'
      case 'sent': return 'info'
      case 'authorised': return 'info'
      case 'draft': return 'default'
      case 'quote': return 'warning'
      case 'cancelled': return 'danger'
      default: return 'default'
    }
  }

  function kindTone(k: Invoice['kind']): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    switch (k) {
      case 'invoice': return 'info'
      case 'credit_note': return 'warning'
      case 'quote': return 'default'
      default: return 'default'
    }
  }

  const invoices: Invoice[] = data.invoices as Invoice[]

  const totalInvoices = $derived(invoices.length)
  const outstanding = $derived(
    invoices
      .filter(i => i.status !== 'paid' && i.status !== 'cancelled' && i.kind !== 'quote')
      .reduce((acc, i) => acc + Number(i.amount_due ?? 0), 0)
  )
  const paid = $derived(
    invoices.filter(i => i.status === 'paid').reduce((acc, i) => acc + Number(i.total ?? 0), 0)
  )
  const draftCount = $derived(invoices.filter(i => i.status === 'draft').length)
  const primaryCurrency = $derived(invoices[0]?.currency ?? 'ZAR')

  const columns: Column<Invoice>[] = [
    { key: 'reference', label: 'Ref', sortable: true, width: '12%', mono: true },
    { key: 'organisation_name', label: 'Organisation', sortable: true, width: '22%' },
    { key: 'kind', label: 'Kind', width: '10%' },
    { key: 'direction', label: 'Direction', width: '10%', hideBelow: 'md' },
    { key: 'status', label: 'Status', width: '10%' },
    { key: 'total', label: 'Total', width: '14%', align: 'right', sortable: true, get: (i) => Number(i.total) },
    { key: 'issued_at', label: 'Issued', sortable: true, width: '12%', date: true, hideBelow: 'sm' }
  ]

  const filters: Filter<Invoice>[] = [
    { key: 'all', label: 'All' },
    { key: 'drafts', label: 'Drafts', test: i => i.status === 'draft' },
    { key: 'sent', label: 'Sent', test: i => i.status === 'sent' },
    { key: 'paid', label: 'Paid', test: i => i.status === 'paid' },
    { key: 'credit_notes', label: 'Credit Notes', test: i => i.kind === 'credit_note' },
    { key: 'quotes', label: 'Quotes', test: i => i.kind === 'quote' },
    { key: 'supplier', label: 'Supplier (AP)', test: i => i.direction === 'supplier' },
    { key: 'customer', label: 'Customer (AR)', test: i => i.direction === 'customer' }
  ]

  const kindOptions = [
    { value: 'invoice', label: 'Invoice' },
    { value: 'credit_note', label: 'Credit Note' },
    { value: 'quote', label: 'Quote' }
  ]
  const directionOptions = [
    { value: 'customer', label: 'Customer (AR)' },
    { value: 'supplier', label: 'Supplier (AP)' }
  ]
  const statusOptions = [
    { value: 'quote', label: 'Quote' },
    { value: 'draft', label: 'Draft' },
    { value: 'authorised', label: 'Authorised' },
    { value: 'sent', label: 'Sent' },
    { value: 'paid', label: 'Paid' },
    { value: 'cancelled', label: 'Cancelled' }
  ]
  const taxModeOptions = [
    { value: 'exclusive', label: 'Exclusive' },
    { value: 'inclusive', label: 'Inclusive' }
  ]

  const linesFor = $derived.by(() => {
    if (!editing) return [] as InvoiceLine[]
    const map = data.linesByInvoiceId as Record<string, InvoiceLine[]>
    return map?.[editing.id] ?? []
  })
</script>

<PageHead title="Invoices" lede="AR + AP unified — invoices, credit notes, and quotes across organisations." />

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<div class="kpi-grid">
  <KpiCard label="Total Invoices" value={String(totalInvoices)} />
  <KpiCard label="Outstanding" value={money(outstanding, primaryCurrency)} tone="warning" />
  <KpiCard label="Paid" value={money(paid, primaryCurrency)} tone="positive" />
  <KpiCard label="Draft" value={String(draftCount)} tone="info" />
</div>

<DataTable
  data={invoices}
  {columns}
  {filters}
  table="invoices"
  title="Invoices"
  lede="AR + AP unified — invoices, credit notes, and quotes across organisations."
  searchFields={['reference', 'organisation_name', 'title', 'wsm_id']}
  searchPlaceholder="Search reference, org, title…"
  csvFilename="invoices"
  empty="No invoices yet."
  timesToggle
  isActiveRow={(i) => i.id === editing?.id}
  onActivate={(i) => editing = i}
>
  {#snippet row(invoice, ctx)}
    <td class="mono">
      <Copyable value={invoice.reference ?? invoice.wsm_id ?? invoice.id.slice(0, 8)}>
        <span class="ref">{invoice.reference ?? invoice.wsm_id ?? '—'}</span>
      </Copyable>
    </td>
    <td>
      <span class="org">{invoice.organisation_name ?? '—'}</span>
      {#if invoice.location_name}
        <span class="muted sub">· {invoice.location_name}</span>
      {/if}
    </td>
    <td>
      <Badge tone={kindTone(invoice.kind)}>{invoice.kind.replace('_', ' ')}</Badge>
    </td>
    <td class="hide-md">
      <Badge tone={invoice.direction === 'customer' ? 'info' : 'warning'}>
        {invoice.direction === 'customer' ? 'AR' : 'AP'}
      </Badge>
    </td>
    <td>
      <Badge tone={statusTone(invoice.status)}>{invoice.status}</Badge>
    </td>
    <td class="align-right mono">
      {money(invoice.total, invoice.currency)}
    </td>
    <td class="date hide-sm">
      {#if invoice.issued_at}
        <div>{new Date(invoice.issued_at).toLocaleDateString()}</div>
        {#if ctx.showTimes}
          <div class="date-time">{new Date(invoice.issued_at).toLocaleTimeString()}</div>
        {/if}
      {:else}
        —
      {/if}
    </td>
  {/snippet}
  {#snippet actions(invoice)}
    {#if can('invoices', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = invoice}>Edit</Button>
    {/if}
    {#if can('invoices', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: invoice.id }}
        confirm={{
          title: 'Delete invoice?',
          message: `Permanently delete ${invoice.reference ?? 'this invoice'}? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title="Edit Invoice" width="640px" formId="edit-invoice-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action="?/update"
      id="edit-invoice-form"
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

      <h3 class="section-title">Identity</h3>
      <FieldGrid cols={2}>
        <Field label="Kind">
          <Select name="kind" value={editing.kind} options={kindOptions} />
        </Field>
        <Field label="Direction">
          <Select name="direction" value={editing.direction} options={directionOptions} />
        </Field>
        <Field label="Status">
          <Select name="status" value={editing.status} options={statusOptions} />
        </Field>
        <Field name="reference" label="Reference" value={editing.reference ?? ''} />
        <Field name="title" label="Title" value={editing.title ?? ''} />
        <Field name="summary" label="Summary" value={editing.summary ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Counterparty</h3>
      <FieldGrid cols={2}>
        <Field label="Organisation">
          <Select
            name="organisation_id"
            value={editing.organisation_id}
            options={data.organisations.map((o: any) => ({ value: o.id, label: o.name }))}
          />
        </Field>
        <Field label="Location">
          <Select
            name="location_id"
            value={editing.location_id ?? ''}
            placeholder="None"
            options={[{ value: '', label: 'None' }, ...data.locations.map((l: any) => ({ value: l.id, label: l.short_name ?? l.name }))]}
          />
        </Field>
      </FieldGrid>

      <h3 class="section-title">Dates</h3>
      <FieldGrid cols={2}>
        <Field name="issued_at" label="Issued" type="date" value={toDateInput(editing.issued_at)} />
        <Field name="due_at" label="Due" type="date" value={toDateInput(editing.due_at)} />
        <Field name="sent_at" label="Sent" type="datetime-local" value={toDateTimeInput(editing.sent_at)} />
        <Field name="paid_at" label="Paid" type="datetime-local" value={toDateTimeInput(editing.paid_at)} />
      </FieldGrid>

      <h3 class="section-title">Money</h3>
      <FieldGrid cols={2}>
        <Field name="currency" label="Currency" value={editing.currency} required />
        <Field label="Tax Mode">
          <Select name="tax_mode" value={editing.tax_mode} options={taxModeOptions} />
        </Field>
        <Field name="sub_total" label="Sub Total" type="number" value={String(editing.sub_total ?? 0)} />
        <Field name="tax_total" label="Tax Total" type="number" value={String(editing.tax_total ?? 0)} />
        <Field name="discount_total" label="Discount Total" type="number" value={String(editing.discount_total ?? 0)} />
        <Field name="total" label="Total" type="number" value={String(editing.total ?? 0)} />
      </FieldGrid>

      <h3 class="section-title">Accounting</h3>
      <FieldGrid cols={2}>
        <Field
          name="accounting_sync_status_display"
          label="Sync Status"
          value={editing.accounting_sync_status ?? ''}
          readonly
        />
        <Field
          name="accounting_external_id_display"
          label="External ID"
          value={editing.accounting_external_id ?? ''}
          readonly
        />
        <Field
          name="accounting_sync_at_display"
          label="Last Synced"
          value={editing.accounting_sync_at ? new Date(editing.accounting_sync_at).toLocaleString() : ''}
          readonly
        />
        <Field
          name="accounting_sync_error_display"
          label="Sync Error"
          value={editing.accounting_sync_error ?? ''}
          readonly
        />
      </FieldGrid>

      <h3 class="section-title">Notes</h3>
      <FieldGrid cols={1}>
        <Field name="notes" label="Notes" value={editing.notes ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Lines ({linesFor.length})</h3>
      {#if linesFor.length === 0}
        <div class="empty-lines">No invoice lines.</div>
      {:else}
        <div class="lines">
          {#each linesFor as line}
            <div class="line-row">
              <div class="line-main">
                <span class="line-desc">{line.description}</span>
                <span class="line-qty muted">× {Number(line.quantity)}</span>
              </div>
              <div class="line-money mono">
                {money(line.total, line.currency)}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="edit-invoice-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .ref { font-weight: var(--weight-medium); color: var(--text); }
  .org { color: var(--text); }
  .sub { margin-left: var(--space-1); font-size: var(--text-xs); }
  .muted { color: var(--text-muted); }
  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }

  .empty-lines {
    padding: var(--space-3);
    background: var(--surface-sunk);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .line-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-sunk);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .line-main { display: flex; gap: var(--space-2); align-items: baseline; min-width: 0; }
  .line-desc { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line-qty { font-family: var(--font-mono); font-size: var(--text-xs); }
  .line-money { font-weight: var(--weight-medium); color: var(--text); }

  :global(td.mono) { font-family: var(--font-mono); }
  :global(td.align-right) { text-align: right; }

  @media (max-width: 640px) { :global(.hide-sm) { display: none; } }
  @media (max-width: 900px) { :global(.hide-md) { display: none; } }
</style>
