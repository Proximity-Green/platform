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

  type Contract = {
    id: string
    wsm_id: string | null
    organisation_id: string
    type: 'contract' | 'flexi_agreement' | 'addendum' | 'master_services_agreement'
    reference: string | null
    title: string | null
    filename: string | null
    document_url: string | null
    signed_at: string | null
    signed_by_person_id: string | null
    started_at: string | null
    ended_at: string | null
    status: 'draft' | 'active' | 'expired' | 'terminated'
    notes: string | null
    created_at: string
    updated_at: string
    organisation_name: string | null
    signer_name: string | null
    linked_sub_count: number
  }

  let { data, form } = $props()
  let editing = $state<Contract | null>(null)
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

  function statusTone(s: Contract['status']): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    switch (s) {
      case 'active': return 'success'
      case 'draft': return 'default'
      case 'expired': return 'warning'
      case 'terminated': return 'danger'
      default: return 'default'
    }
  }

  function typeLabel(t: Contract['type']): string {
    switch (t) {
      case 'master_services_agreement': return 'MSA'
      case 'flexi_agreement': return 'Flexi'
      case 'addendum': return 'Addendum'
      default: return 'Contract'
    }
  }

  const money = (value: number | null | undefined, currency: string) => fmtMoneyWithCurrency(value, currency)

  const contracts: Contract[] = data.contracts as Contract[]

  const columns: Column<Contract>[] = [
    { key: 'reference', label: 'Ref', sortable: true, width: '14%', mono: true },
    { key: 'type', label: 'Type', width: '12%' },
    { key: 'organisation_name', label: 'Organisation', sortable: true, width: '22%' },
    { key: 'signed_at', label: 'Signed', sortable: true, width: '12%', date: true, hideBelow: 'sm' },
    { key: 'status', label: 'Status', width: '10%' },
    { key: 'started_at', label: 'Started', sortable: true, width: '12%', date: true, hideBelow: 'md' },
    { key: 'ended_at', label: 'Ended', sortable: true, width: '12%', date: true, hideBelow: 'md' }
  ]

  const filters: Filter<Contract>[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft', test: c => c.status === 'draft' },
    { key: 'active', label: 'Active', test: c => c.status === 'active' },
    { key: 'expired', label: 'Expired', test: c => c.status === 'expired' },
    { key: 'terminated', label: 'Terminated', test: c => c.status === 'terminated' }
  ]

  const typeOptions = [
    { value: 'contract', label: 'Contract' },
    { value: 'flexi_agreement', label: 'Flexi Agreement' },
    { value: 'addendum', label: 'Addendum' },
    { value: 'master_services_agreement', label: 'Master Services Agreement' }
  ]
  const statusOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'expired', label: 'Expired' },
    { value: 'terminated', label: 'Terminated' }
  ]

  const linkedSubsFor = $derived.by(() => {
    if (!editing) return [] as any[]
    const map = data.linksByContractId as Record<string, any[]>
    return map?.[editing.id] ?? []
  })
</script>

<PageHead title="Contracts" lede="Umbrella legal docs that wrap many subscription lines — MSAs, flexi agreements, addenda." />

<Toast error={form?.error} success={form?.success} message={form?.message} />

<DataTable
  data={contracts}
  {columns}
  {filters}
  table="contracts"
  title="Contracts"
  lede="Umbrella legal docs that wrap many subscription lines."
  searchFields={['reference', 'organisation_name', 'title', 'filename', 'wsm_id']}
  searchPlaceholder="Search reference, org, title…"
  csvFilename="contracts"
  empty="No contracts yet."
  timesToggle
  isActiveRow={(c) => c.id === editing?.id}
  onActivate={(c) => editing = c}
>
  {#snippet row(contract, ctx)}
    <td class="mono">
      <Copyable value={contract.reference ?? contract.wsm_id ?? contract.id.slice(0, 8)}>
        <span class="ref">{contract.reference ?? contract.wsm_id ?? '—'}</span>
      </Copyable>
    </td>
    <td>
      <Badge tone="info">{typeLabel(contract.type)}</Badge>
    </td>
    <td>{contract.organisation_name ?? '—'}</td>
    <td class="date hide-sm">
      {#if contract.signed_at}
        <div>{new Date(contract.signed_at).toLocaleDateString()}</div>
        {#if ctx.showTimes}
          <div class="date-time">{new Date(contract.signed_at).toLocaleTimeString()}</div>
        {/if}
      {:else}
        —
      {/if}
    </td>
    <td>
      <Badge tone={statusTone(contract.status)}>{contract.status}</Badge>
    </td>
    <td class="date hide-md">
      {contract.started_at ? new Date(contract.started_at).toLocaleDateString() : '—'}
    </td>
    <td class="date hide-md">
      {contract.ended_at ? new Date(contract.ended_at).toLocaleDateString() : '—'}
    </td>
  {/snippet}
  {#snippet actions(contract)}
    {#if can('contracts', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = contract}>Edit</Button>
    {/if}
    {#if can('contracts', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: contract.id }}
        confirm={{
          title: 'Delete contract?',
          message: `Permanently delete ${contract.reference ?? 'this contract'}? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title="Edit Contract" width="620px" formId="edit-contract-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action="?/update"
      id="edit-contract-form"
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
        <Field label="Type">
          <Select name="type" value={editing.type} options={typeOptions} />
        </Field>
        <Field name="reference" label="Reference" value={editing.reference ?? ''} />
        <Field name="title" label="Title" value={editing.title ?? ''} />
        <Field name="filename" label="Filename" value={editing.filename ?? ''} />
        <Field name="document_url" label="Document URL" value={editing.document_url ?? ''} full />
      </FieldGrid>

      <h3 class="section-title">Organisation</h3>
      <FieldGrid cols={1}>
        <Field label="Organisation (read-only)">
          <Select
            name="organisation_id_display"
            value={editing.organisation_id}
            options={data.organisations.map((o: any) => ({ value: o.id, label: o.name }))}
            disabled
          />
        </Field>
      </FieldGrid>

      <h3 class="section-title">Signatories</h3>
      <FieldGrid cols={2}>
        <Field label="Signed By">
          <Select
            name="signed_by_person_id"
            value={editing.signed_by_person_id ?? ''}
            placeholder="None"
            options={[
              { value: '', label: 'None' },
              ...data.persons.map((p: any) => ({
                value: p.id,
                label: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.id
              }))
            ]}
          />
        </Field>
        <Field name="signed_at" label="Signed At" type="date" value={toDateInput(editing.signed_at)} />
      </FieldGrid>

      <h3 class="section-title">Lifecycle</h3>
      <FieldGrid cols={2}>
        <Field name="started_at" label="Started" type="date" value={toDateInput(editing.started_at)} />
        <Field name="ended_at" label="Ended" type="date" value={toDateInput(editing.ended_at)} />
        <Field label="Status">
          <Select name="status" value={editing.status} options={statusOptions} />
        </Field>
      </FieldGrid>

      <h3 class="section-title">Notes</h3>
      <FieldGrid cols={1}>
        <Field name="notes" label="Notes" value={editing.notes ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Linked Subscriptions ({linkedSubsFor.length})</h3>
      {#if linkedSubsFor.length === 0}
        <div class="empty-links">No subscription lines linked.</div>
      {:else}
        <div class="links">
          {#each linkedSubsFor as link}
            {@const sub = link.subscription_lines}
            <div class="link-row">
              <div class="link-main">
                <span class="link-desc">{sub?.description ?? link.subscription_line_id}</span>
                {#if sub?.quantity != null}
                  <span class="link-qty muted">× {Number(sub.quantity)}</span>
                {/if}
              </div>
              {#if sub?.unit_price != null && sub?.currency}
                <div class="link-money mono">
                  {money(sub.unit_price, sub.currency)}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="edit-contract-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .ref { font-weight: var(--weight-medium); color: var(--text); }
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

  .empty-links {
    padding: var(--space-3);
    background: var(--surface-sunk);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .links { display: flex; flex-direction: column; gap: var(--space-1); }
  .link-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-sunk);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }
  .link-main { display: flex; gap: var(--space-2); align-items: baseline; min-width: 0; }
  .link-desc { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .link-qty { font-family: var(--font-mono); font-size: var(--text-xs); }
  .link-money { font-weight: var(--weight-medium); color: var(--text); }

  :global(td.mono) { font-family: var(--font-mono); }

  @media (max-width: 640px) { :global(.hide-sm) { display: none; } }
  @media (max-width: 900px) { :global(.hide-md) { display: none; } }
</style>
