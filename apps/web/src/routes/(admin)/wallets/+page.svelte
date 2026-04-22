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
    Copyable,
    SubmitButton
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'
  import { fmtMoneyWithCurrency } from '$lib/utils/money'

  type Wallet = {
    id: string
    organisation_id: string
    currency: string
    balance: number
    created_at: string
    updated_at: string
    organisation_name: string | null
    transaction_count: number
  }

  type WalletTxn = {
    id: string
    wallet_id: string
    invoice_id: string | null
    kind: 'topup' | 'draw' | 'refund' | 'adjustment'
    amount: number
    balance_after: number
    notes: string | null
    created_at: string
  }

  let { data, form } = $props()
  let editing = $state<Wallet | null>(null)
  let saving = $state(false)
  let addingTxn = $state(false)

  $effect(() => {
    if (form?.success) {
      addingTxn = false
      // keep the drawer open after a successful txn so users can see updates
    }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const money = (value: number | null | undefined, currency: string) => fmtMoneyWithCurrency(value, currency)

  function txnKindTone(k: WalletTxn['kind']): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    switch (k) {
      case 'topup': return 'success'
      case 'draw': return 'info'
      case 'refund': return 'warning'
      case 'adjustment': return 'default'
      default: return 'default'
    }
  }

  const wallets: Wallet[] = data.wallets as Wallet[]

  const currencies = $derived([...new Set(wallets.map(w => w.currency))].sort())

  const columns: Column<Wallet>[] = [
    { key: 'organisation_name', label: 'Organisation', sortable: true, width: '50%' },
    { key: 'currency', label: 'Currency', sortable: true, width: '20%', mono: true },
    { key: 'balance', label: 'Balance', sortable: true, width: '30%', align: 'right', get: (w) => Number(w.balance) }
  ]

  const filters: Filter<Wallet>[] = $derived([
    { key: 'all', label: 'All' },
    ...currencies.map(c => ({ key: `cur_${c}`, label: c, test: (w: Wallet) => w.currency === c }))
  ])

  const txnKindOptions = [
    { value: 'topup', label: 'Top-up' },
    { value: 'draw', label: 'Draw' },
    { value: 'refund', label: 'Refund' },
    { value: 'adjustment', label: 'Adjustment' }
  ]

  const txnsFor = $derived.by(() => {
    if (!editing) return [] as WalletTxn[]
    const map = data.txnsByWalletId as Record<string, WalletTxn[]>
    return map?.[editing.id] ?? []
  })
</script>

<PageHead title="Wallets" lede="Org wallet balances and transactions — top-ups, draws, refunds, adjustments." />

<Toast error={form?.error} success={form?.success} message={form?.message} />

<DataTable
  data={wallets}
  {columns}
  {filters}
  table="wallets"
  title="Wallets"
  lede="Org wallet balances and transactions."
  searchFields={['organisation_name', 'currency']}
  searchPlaceholder="Search organisation, currency…"
  csvFilename="wallets"
  empty="No wallets yet."
  isActiveRow={(w) => w.id === editing?.id}
  onActivate={(w) => editing = w}
>
  {#snippet row(wallet)}
    <td>
      <Copyable value={wallet.organisation_name ?? wallet.organisation_id}>
        <span class="org">{wallet.organisation_name ?? '—'}</span>
      </Copyable>
    </td>
    <td class="mono">
      <Badge tone="info">{wallet.currency}</Badge>
    </td>
    <td class="align-right mono balance-cell">
      {money(wallet.balance, wallet.currency)}
    </td>
  {/snippet}
  {#snippet actions(wallet)}
    {#if can('wallets', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = wallet}>Open</Button>
    {/if}
    {#if can('wallets', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: wallet.id }}
        confirm={{
          title: 'Delete wallet?',
          message: `Permanently delete this ${wallet.currency} wallet? Transactions will be orphaned.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title="Wallet" width="560px" onClose={() => { editing = null; addingTxn = false }}>
  {#if editing}
    <h3 class="section-title">Details</h3>
    <div class="wallet-summary">
      <div class="summary-row">
        <span class="muted">Organisation</span>
        <strong>{editing.organisation_name ?? editing.organisation_id}</strong>
      </div>
      <div class="summary-row">
        <span class="muted">Currency</span>
        <Badge tone="info">{editing.currency}</Badge>
      </div>
      <div class="summary-row">
        <span class="muted">Balance</span>
        <strong class="balance-big mono">{money(editing.balance, editing.currency)}</strong>
      </div>
      <div class="summary-row">
        <span class="muted">Transactions</span>
        <span class="mono">{editing.transaction_count}</span>
      </div>
    </div>

    {#if can('wallets', 'update')}
      <h3 class="section-title">Add Transaction</h3>
      {#if addingTxn}
        <form
          method="POST"
          action="?/addTransaction"
          id="txn-form"
          autocomplete="off"
          use:enhance={() => {
            saving = true
            return async ({ update }) => {
              await update({ reset: true })
              saving = false
            }
          }}
        >
          <input type="hidden" name="wallet_id" value={editing.id} />
          <FieldGrid cols={2}>
            <Field label="Kind">
              <Select name="kind" value="topup" options={txnKindOptions} />
            </Field>
            <Field name="amount" label="Amount (signed)" type="number" placeholder="e.g. 100 or -50" required />
            <Field name="notes" label="Notes" full />
          </FieldGrid>
          <div class="txn-actions">
            <Button variant="ghost" size="sm" onclick={() => addingTxn = false} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" loading={saving}>{saving ? 'Adding…' : 'Add Transaction'}</Button>
          </div>
        </form>
      {:else}
        <Button size="sm" onclick={() => addingTxn = true}>+ Top-up / Adjustment</Button>
      {/if}
    {/if}

    <h3 class="section-title">Transactions ({txnsFor.length})</h3>
    {#if txnsFor.length === 0}
      <div class="empty-txns">No transactions yet.</div>
    {:else}
      <div class="txns">
        {#each txnsFor as txn}
          <div class="txn-row">
            <div class="txn-main">
              <Badge tone={txnKindTone(txn.kind)}>{txn.kind}</Badge>
              <span class="txn-notes">{txn.notes ?? ''}</span>
            </div>
            <div class="txn-meta">
              <span class="txn-amount mono" class:negative={Number(txn.amount) < 0}>
                {Number(txn.amount) >= 0 ? '+' : ''}{money(txn.amount, editing.currency)}
              </span>
              <span class="txn-balance mono muted">
                = {money(txn.balance_after, editing.currency)}
              </span>
              <span class="txn-date muted">{new Date(txn.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => { editing = null; addingTxn = false }}>Close</Button>
  {/snippet}
</Drawer>

<style>
  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }

  .muted { color: var(--text-muted); }
  .org { color: var(--text); font-weight: var(--weight-medium); }

  .wallet-summary {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--surface-sunk);
    border-radius: var(--radius-sm);
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-sm);
  }
  .balance-big {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    color: var(--text);
  }
  .balance-cell { font-weight: var(--weight-medium); }

  .txn-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-2);
  }

  .empty-txns {
    padding: var(--space-3);
    background: var(--surface-sunk);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .txns { display: flex; flex-direction: column; gap: var(--space-1); }
  .txn-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-sunk);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    gap: var(--space-3);
  }
  .txn-main { display: flex; gap: var(--space-2); align-items: center; min-width: 0; flex: 1; }
  .txn-notes { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txn-meta {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-shrink: 0;
  }
  .txn-amount { color: var(--success); font-weight: var(--weight-medium); }
  .txn-amount.negative { color: var(--danger); }
  .txn-balance { font-size: var(--text-xs); }
  .txn-date { font-size: var(--text-xs); }

  :global(td.mono) { font-family: var(--font-mono); }
  :global(td.align-right) { text-align: right; }
</style>
