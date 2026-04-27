<script lang="ts">
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    Button,
    PageHead,
    Toast,
    Card,
    Field,
    FieldGrid,
    Select,
    Badge,
    Copyable, ErrorBanner
  } from '$lib/components/ui'
  import { fmtMoney, fmtMoneyWithCurrency } from '$lib/utils/money'

  let { data, form } = $props()

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  let saving = $state(false)
  let editingLineId = $state<string | null>(null)
  let addingLine = $state(false)
  let statusMenuOpen = $state(false)

  // Universal keyboard nav — single-page form (no tabs):
  //   ⌘/Ctrl+Enter — save the main invoice form
  //   ←            — back to the list
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const f = document.getElementById('save-invoice-form') as HTMLFormElement | null
        if (f) { e.preventDefault(); f.requestSubmit() }
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft') return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      goto('/invoices')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  $effect(() => {
    if (form?.success) {
      saving = false
      editingLineId = null
      addingLine = false
      statusMenuOpen = false
    }
  })

  const inv = $derived(data.invoice as any)
  const lines = $derived(data.lines as any[])
  const org = $derived(inv.organisations)

  function fmtDate(v: string | null): string {
    if (!v) return '—'
    const d = new Date(v); if (isNaN(d.getTime())) return '—'
    return d.toISOString().slice(0, 10)
  }
  function toDateInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v); if (isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  }
  const money = (n: number | null | undefined, c: string) => fmtMoneyWithCurrency(n, c)
  const num = (n: number | null | undefined) => fmtMoney(n ?? 0)

  function statusTone(s: string): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    if (s === 'paid') return 'success'
    if (s === 'sent' || s === 'authorised') return 'info'
    if (s === 'draft' || s === 'quote') return 'default'
    if (s === 'cancelled') return 'danger'
    return 'default'
  }

  const statusOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'authorised', label: 'Authorised' },
    { value: 'sent', label: 'Sent' },
    { value: 'paid', label: 'Paid' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'quote', label: 'Quote' }
  ]

  const currencyOptions = [
    { value: 'ZAR', label: 'South African Rand (ZAR)' },
    { value: 'USD', label: 'US Dollar (USD)' },
    { value: 'EUR', label: 'Euro (EUR)' },
    { value: 'GBP', label: 'British Pound (GBP)' },
    { value: 'KES', label: 'Kenyan Shilling (KES)' },
    { value: 'NGN', label: 'Nigerian Naira (NGN)' }
  ]

  const locationOptions = $derived(
    (data.locations as any[]).map(l => ({ value: l.id, label: l.short_name ?? l.name }))
  )

  const itemOptionsForLocation = $derived(
    (loc: string | null) => (data.items as any[])
      .filter((i: any) => !loc || i.location_id === loc)
      .map((i: any) => ({ value: i.id, label: i.name }))
  )

  const totals = $derived.by(() => {
    let sub = 0, vat = 0, disc = 0
    for (const l of lines) {
      const q = Number(l.quantity ?? 1)
      const up = Number(l.unit_price ?? 0)
      const d = Number(l.discount ?? 0)
      const t = Number(l.tax_amount ?? 0)
      sub += q * up - d
      vat += t
      disc += d
    }
    return { sub, vat, disc, total: sub + vat }
  })
</script>

<PageHead title="Edit Invoice" lede={org?.name ?? ''}>
  <Button variant="ghost" size="sm" href={`/organisations/${inv.organisation_id}?tab=invoices`}>← Back to Organisation</Button>
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<form id="save-invoice-form" method="POST" action="?/save" use:enhance={() => {
  saving = true
  return async ({ update }) => { await update({ reset: false }); saving = false }
}}>

  <!-- INVOICE DETAILS -->
  <Card padding="lg">
    <div class="block-head">
      <h2>Invoice Details</h2>
      <div class="status-ctrl">
        <Badge tone={statusTone(inv.status)}>{String(inv.status).toUpperCase()}</Badge>
        <button type="button" class="change-status" onclick={() => statusMenuOpen = !statusMenuOpen}>
          Change Status ▾
        </button>
        {#if statusMenuOpen}
          <div class="status-menu">
            {#each statusOptions as s}
              <form method="POST" action="?/changeStatus" use:enhance={() => {
                saving = true
                return async ({ update }) => { await update(); saving = false }
              }}>
                <input type="hidden" name="status" value={s.value} />
                <button type="submit" class="status-item">{s.label}</button>
              </form>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="details-grid">
      <div class="details-col">
        <Field label="Contact">
          <div class="ro-input"><Copyable value={org?.name ?? ''}>{org?.name ?? '—'}</Copyable></div>
        </Field>
        <Field name="reference" label="Reference" value={inv.reference ?? ''} />
        <Field label="Currency">
          <Select name="currency" value={inv.currency ?? 'ZAR'} options={currencyOptions} />
        </Field>
        <Field label="Location">
          <Select name="location_id" value={inv.location_id ?? ''}
            options={[{ value: '', label: '—' }, ...locationOptions]} />
        </Field>
      </div>

      <div class="details-col">
        <Field name="issued_at" label="Issue date" type="date" value={toDateInput(inv.issued_at)} />
        <Field name="due_at" label="Due date" type="date" value={toDateInput(inv.due_at)} />
        <div class="note muted">
          Note: Due date does not affect pro-rata. It's based on issue date and days left in that month.
        </div>
        <Field label="Invoice Number">
          <div class="ro-input mono">{inv.reference ?? `INV-${inv.id.slice(0, 4).toUpperCase()}`}</div>
        </Field>
        <Field label="Invoice ID">
          <div class="ro-input mono"><Copyable value={inv.id} ellipsis /></div>
        </Field>
        {#if inv.accounting_external_id}
          <Field label="Invoice Branding Theme ID">
            <div class="ro-input mono"><Copyable value={inv.accounting_external_id} ellipsis /></div>
          </Field>
        {/if}

        <div class="fulfilment">
          <label class="ful-label">Fulfilment</label>
          <div class="ful-row">
            <span class="muted">Status:</span>
            <Badge tone={inv.status === 'paid' ? 'success' : 'default'}>
              {inv.status === 'paid' ? 'Fulfilled' : 'Not Fulfilled'}
            </Badge>
            {#if inv.paid_at}
              <span class="muted">Fulfilment Date: {fmtDate(inv.paid_at)}</span>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <input type="hidden" name="status" value={inv.status} />
  </Card>

  <!-- LINE ITEMS -->
  <Card padding="lg">
    <div class="block-head">
      <h2>Line Items</h2>
      {#if can('invoices', 'update')}
        <Button type="button" size="sm" variant="ghost" onclick={() => addingLine = !addingLine}>
          {addingLine ? 'Cancel' : '+ Add Item'}
        </Button>
      {/if}
    </div>

    <table class="lines-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th>Account</th>
          <th class="num">Amount (ex VAT)</th>
          <th class="num">Discount</th>
          <th class="num">VAT</th>
          <th class="num">Total (inc VAT)</th>
          <th class="row-actions"></th>
        </tr>
      </thead>
      <tbody>
        {#each lines as l (l.id)}
          {#if editingLineId === l.id}
            <tr class="edit-line-row">
              <td colspan="8">
                <form method="POST" action="?/updateLine" use:enhance={() => {
                  saving = true
                  return async ({ update }) => { await update({ reset: false }); saving = false }
                }}>
                  <input type="hidden" name="line_id" value={l.id} />
                  <div class="edit-line-grid">
                    <div class="ef">
                      <label>Location</label>
                      <Select name="location_id" value={inv.location_id ?? ''}
                        options={[{ value: '', label: '—' }, ...locationOptions]} />
                    </div>
                    <div class="ef desc-ef">
                      <label>Item</label>
                      <input value={l.item_name ?? 'Line item'} readonly class="ro-text" />
                    </div>
                    <div class="ef desc-ef full">
                      <label>Description</label>
                      <input name="description" value={l.description ?? ''} />
                    </div>
                    <div class="ef">
                      <label>Quantity</label>
                      <input type="number" name="quantity" value={l.quantity} step="0.01" />
                    </div>
                    <div class="ef">
                      <label>Price</label>
                      <input type="number" name="unit_price" value={l.unit_price} step="0.01" />
                    </div>
                    <div class="ef">
                      <label>Discount</label>
                      <input type="number" name="discount" value={l.discount} step="0.01" />
                    </div>
                    <div class="ef">
                      <label>VAT %</label>
                      <input type="number" name="tax_rate" value={l.tax_rate ?? 15} step="0.01" />
                    </div>
                    <div class="ef actions">
                      <Button type="submit" size="sm" loading={saving}>Save</Button>
                      <Button type="button" size="sm" variant="ghost" onclick={() => editingLineId = null}>Cancel</Button>
                    </div>
                  </div>
                </form>
              </td>
            </tr>
          {:else}
            <tr class="line-row" onclick={() => editingLineId = l.id}>
              <td>
                <div class="line-desc">
                  <span class="primary">{l.item_name ?? l.description ?? 'Line item'}</span>
                  {#if l.description && l.description !== l.item_name}
                    <span class="muted line-sub">{l.description}</span>
                  {/if}
                  {#if l.accounting_gl_code || l.accounting_item_code}
                    <span class="muted line-codes">{l.accounting_gl_code ?? ''} {l.accounting_item_code ? `· ${l.accounting_item_code}` : ''}</span>
                  {/if}
                </div>
              </td>
              <td class="num mono" data-label="Qty">{Number(l.quantity).toFixed(0)}</td>
              <td class="mono muted" data-label="Account">{l.accounting_gl_code ?? '—'}</td>
              <td class="num mono" data-label="Amount (ex VAT)">{money(Number(l.quantity) * Number(l.unit_price) - Number(l.discount ?? 0), inv.currency)}</td>
              <td class="num mono" data-label="Discount">{Number(l.discount ?? 0) === 0 ? '0%' : num(l.discount)}</td>
              <td class="num mono" data-label="VAT">{money(l.tax_amount, inv.currency)}</td>
              <td class="num mono" data-label="Total (inc VAT)">{money(l.total, inv.currency)}</td>
              <td class="row-actions">
                <form method="POST" action="?/removeLine" use:enhance>
                  <input type="hidden" name="line_id" value={l.id} />
                  <button type="submit" class="row-btn" onclick={(e) => e.stopPropagation()} aria-label="Remove">×</button>
                </form>
              </td>
            </tr>
          {/if}
        {:else}
          <tr><td colspan="8" class="empty-row">
            <div class="no-lines">
              <div class="no-lines-title">No line items yet</div>
              <div class="muted">Add items using the button above</div>
              {#if can('invoices', 'update')}
                <Button type="button" size="sm" onclick={() => addingLine = true}>+ Add First Item</Button>
              {/if}
            </div>
          </td></tr>
        {/each}
      </tbody>
    </table>

    {#if addingLine && can('invoices', 'update')}
      <form method="POST" action="?/addLine" use:enhance={() => {
        saving = true
        return async ({ update }) => { await update({ reset: true }); saving = false }
      }} class="add-line-form">
        <div class="edit-line-grid">
          <div class="ef desc-ef">
            <label>Item</label>
            <Select name="item_id" value="" options={itemOptionsForLocation(inv.location_id)} placeholder="Pick an item" />
          </div>
          <div class="ef desc-ef full">
            <label>Description (override)</label>
            <input name="description" placeholder="Defaults to item name" />
          </div>
          <div class="ef">
            <label>Qty</label>
            <input type="number" name="quantity" value="1" step="0.01" />
          </div>
          <div class="ef">
            <label>Price</label>
            <input type="number" name="unit_price" step="0.01" placeholder="base price" />
          </div>
          <div class="ef">
            <label>Discount</label>
            <input type="number" name="discount" value="0" step="0.01" />
          </div>
          <div class="ef actions">
            <Button type="submit" size="sm" loading={saving}>Add Line</Button>
            <Button type="button" size="sm" variant="ghost" onclick={() => addingLine = false}>Cancel</Button>
          </div>
        </div>
      </form>
    {/if}
  </Card>

  <!-- INVOICE SUMMARY -->
  <Card padding="lg">
    <h2 class="block-head-solo">Invoice Summary</h2>
    <div class="summary">
      <div class="summary-row">
        <span class="muted">Subtotal</span>
        <span class="mono">{money(totals.sub, inv.currency)}</span>
      </div>
      <div class="summary-row">
        <span class="muted">Total VAT</span>
        <span class="mono">{money(totals.vat, inv.currency)}</span>
      </div>
      {#if totals.disc > 0}
        <div class="summary-row">
          <span class="muted">Total Discount</span>
          <span class="mono">−{money(totals.disc, inv.currency)}</span>
        </div>
      {/if}
      <div class="summary-row total-final">
        <span>TOTAL</span>
        <span class="mono accent">{money(totals.total, inv.currency)}</span>
      </div>
      <div class="summary-note muted">
        Pro rata-base: {lines.length} line items. Pro rata discounts can only be changed while invoice is in Draft.
      </div>
    </div>
  </Card>

  <!-- FOOTER ACTION BAR -->
  <div class="action-bar">
    <div class="ab-left">
      <Button type="button" size="sm" variant="ghost">Copy Public Link</Button>
      <Button type="button" size="sm" variant="ghost">Open Public Link</Button>
      <Button type="button" size="sm" variant="ghost">Email Invoice</Button>
    </div>
    <div class="ab-right">
      <Button type="button" size="sm" variant="ghost">Open in Xero</Button>
      <Button type="button" size="sm" variant="ghost">Download PDF</Button>
      <Button type="button" size="sm" variant="ghost">Resync</Button>
      {#if can('invoices', 'update')}
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save Invoice'}</Button>
      {/if}
    </div>
  </div>
</form>

<style>
  .block-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: var(--space-4);
  }
  .block-head h2, .block-head-solo {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--accent);
    margin: 0 0 var(--space-4);
  }
  .block-head-solo { margin-bottom: var(--space-3); }

  .status-ctrl { position: relative; display: inline-flex; gap: var(--space-2); align-items: center; }
  .change-status {
    background: var(--warning-soft, #fef3c7);
    color: var(--warning, #d97706);
    border: 1px solid var(--warning, #d97706);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .status-menu {
    position: absolute; top: 110%; right: 0;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 10;
    min-width: 140px;
    padding: var(--space-1);
  }
  .status-item {
    display: block; width: 100%; text-align: left;
    background: transparent; border: none;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    color: var(--text); cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .status-item:hover { background: var(--surface-sunk); }

  .details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
  }
  .details-col { display: flex; flex-direction: column; gap: var(--space-3); }
  .note { font-size: var(--text-xs); line-height: 1.4; }

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

  .fulfilment { margin-top: var(--space-2); }
  .ful-label {
    font-size: 11px; font-weight: var(--weight-semibold);
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--label-color); display: block; margin-bottom: 4px;
  }
  .ful-row {
    display: flex; gap: var(--space-2); align-items: center;
    font-size: var(--text-sm);
  }

  .lines-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .lines-table thead th {
    text-align: left; padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--label-color);
    border-bottom: 1px solid var(--border);
    background: transparent;
  }
  .lines-table thead th.num { text-align: right; }
  .lines-table tbody td {
    padding: var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .lines-table tbody td.num { text-align: right; font-family: var(--font-mono); }
  .line-row { cursor: pointer; transition: background var(--motion-fast) var(--ease-out); }
  .line-row:hover { background: var(--surface-sunk); }
  .line-desc { display: flex; flex-direction: column; gap: 2px; }
  .line-sub, .line-codes { font-size: var(--text-xs); }
  .row-actions { width: 32px; }
  .row-btn {
    background: transparent; border: none;
    color: var(--text-muted); cursor: pointer;
    font-size: var(--text-lg); padding: 0;
  }
  .row-btn:hover { color: var(--danger); }

  .empty-row { border-bottom: none !important; padding: var(--space-8) !important; }
  .no-lines {
    text-align: center;
    display: flex; flex-direction: column; gap: var(--space-2);
    align-items: center;
    color: var(--text-muted);
  }
  .no-lines-title { font-size: var(--text-md); color: var(--text); }

  .edit-line-row td {
    padding: var(--space-4) !important;
    background: var(--surface-sunk);
  }
  .edit-line-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
  }
  .ef { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ef.desc-ef { grid-column: span 2; }
  .ef.full { grid-column: 1 / -1; }
  .ef label {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--label-color);
    font-weight: var(--weight-semibold);
  }
  .ef input, .ef :global(select), .ef textarea {
    padding: 0.4rem 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--text-sm);
    font-family: inherit;
    height: 32px;
  }
  .ef input.ro-text { background: var(--surface-sunk); color: var(--text-muted); }
  .ef.actions { flex-direction: row; gap: var(--space-2); grid-column: span 2; align-items: end; }

  .add-line-form {
    margin-top: var(--space-3);
    padding: var(--space-3);
    background: var(--surface-sunk);
    border-radius: var(--radius-sm);
  }

  .summary { display: flex; flex-direction: column; gap: var(--space-2); max-width: 380px; }
  .summary-row {
    display: flex; justify-content: space-between;
    font-size: var(--text-sm);
  }
  .summary-row.total-final {
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }
  .accent { color: var(--accent); }
  .summary-note { font-size: var(--text-xs); margin-top: var(--space-2); max-width: 380px; }

  .action-bar {
    display: flex; justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--border);
    margin-top: var(--space-2);
  }
  .ab-left, .ab-right { display: inline-flex; gap: var(--space-2); flex-wrap: wrap; }

  .primary { color: var(--text); font-weight: var(--weight-medium); }
  .muted { color: var(--text-muted); }
  .mono { font-family: var(--font-mono); }

  @media (max-width: 900px) {
    .details-grid { grid-template-columns: 1fr; }
    .edit-line-grid { grid-template-columns: repeat(2, 1fr); }
    .ef.desc-ef { grid-column: span 1; }
    .ef.actions { grid-column: span 2; }
  }

  @media (max-width: 640px) {
    .edit-line-grid { grid-template-columns: 1fr; }
    .ef.actions { grid-column: span 1; }
    .summary { max-width: none; }

    /* Line items: each tr becomes a card */
    .lines-table { display: block; }
    .lines-table thead { display: none; }
    .lines-table tbody { display: block; }
    .lines-table tbody tr.line-row {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "desc actions"
        "body body";
      gap: 6px 10px;
      padding: var(--space-3);
      margin-bottom: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
    }
    .lines-table tbody td {
      display: block;
      padding: 4px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    }
    .lines-table tbody td:first-child {
      grid-area: desc;
      padding: 0;
      border-bottom: none;
    }
    .lines-table tbody td.row-actions {
      grid-area: actions;
      padding: 0;
      border-bottom: none;
      width: auto;
    }
    .lines-table tbody td[data-label] { grid-column: 1 / -1; }
    .lines-table tbody td[data-label]::before {
      content: attr(data-label);
      display: block;
      font-size: 10px;
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 2px;
    }
    .lines-table tbody td.num { text-align: left; }
    .lines-table tbody tr.line-row td:last-of-type { border-bottom: none; }
    .lines-table tbody tr.edit-line-row { display: block; }
    .lines-table tbody tr.edit-line-row td { display: block; border: none; }
    .lines-table tbody tr.edit-line-row td[colspan] { padding: var(--space-3); }
  }
</style>
