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
    SubmitButton, ErrorBanner
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'
  import type {
    SubscriptionLineEnriched,
    SubscriptionStatus,
    SubscriptionFrequency
  } from '$lib/services/subscription-lines.service'

  function toDateInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function toDateTimeLocalInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  type StatusTone = 'default' | 'success' | 'warning' | 'info' | 'danger'
  const STATUS_TONE: Record<SubscriptionStatus, StatusTone> = {
    draft:      'default',
    option:     'info',
    pending:    'warning',
    signed:     'success',
    paused:     'default',
    ended:      'default',
    cancelled:  'default',
    expired:    'default',
    superseded: 'default'
  }

  const STATUSES: SubscriptionStatus[] = [
    'draft', 'option', 'pending', 'signed', 'paused', 'ended', 'cancelled', 'expired', 'superseded'
  ]
  const FREQUENCIES: SubscriptionFrequency[] = ['monthly', 'quarterly', 'annually', 'custom']

  let { data, form } = $props()
  let editing = $state<SubscriptionLineEnriched | null>(null)
  let sourceKind = $state<'item' | 'license'>('item')
  let currentStatus = $state<SubscriptionStatus>('draft')
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { editing = null }
  })

  $effect(() => {
    if (editing) {
      sourceKind = editing.license_id ? 'license' : 'item'
      currentStatus = editing.status ?? 'draft'
    }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  function sourceLabel(sub: SubscriptionLineEnriched): string {
    if (sub.license_id) return `Licence: ${sub.license_item_name ?? '—'}`
    return sub.item_name ?? '—'
  }

  const columns: Column<SubscriptionLineEnriched>[] = [
    { key: 'organisation_name', label: 'Organisation', sortable: true, width: '18%', get: s => s.organisation_name ?? '' },
    { key: 'source', label: 'Source', sortable: true, width: '22%', get: s => sourceLabel(s) },
    { key: 'base_rate', label: 'Rate', sortable: true, width: '14%', align: 'right', mono: true, get: s => s.base_rate },
    { key: 'frequency', label: 'Frequency', sortable: true, width: '11%', muted: true, hideBelow: 'md' },
    { key: 'status', label: 'Status', sortable: true, width: '12%' },
    { key: 'started_at', label: 'Started', sortable: true, width: '11%', date: true, hideBelow: 'sm' }
  ]

  const filters: Filter<SubscriptionLineEnriched>[] = [
    { key: 'option', label: 'Option', test: s => s.status === 'option' },
    { key: 'pending', label: 'Pending', test: s => s.status === 'pending' },
    { key: 'signed', label: 'Signed', test: s => s.status === 'signed' },
    { key: 'ended', label: 'Ended', test: s => s.status === 'ended' },
    { key: 'cancelled', label: 'Cancelled', test: s => s.status === 'cancelled' },
    { key: 'all', label: 'All' }
  ]

  function newDraft(): any {
    return {
      id: '',
      item_id: null,
      license_id: null,
      organisation_id: '',
      location_id: '',
      user_id: null,
      base_rate: 0,
      currency: 'ZAR',
      quantity: 1,
      frequency: 'monthly',
      interval_months: 1,
      status: 'draft',
      started_at: new Date().toISOString(),
      ended_at: null,
      next_invoice_at: null,
      proposed_at: null,
      expires_at: null,
      accepted_at: null,
      rejected_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      supersedes_subscription_line_id: null,
      version: 1,
      option_group_id: null,
      notes: null,
      item_name: null,
      license_item_name: null,
      organisation_name: null,
      location_name: null,
      user_name: null,
      wsm_id: null,
      created_at: '',
      updated_at: ''
    }
  }

  // Items and licences cascade off the selected location. When no location is
  // picked, the dropdowns are disabled with a hint prompting the user to pick
  // a location first. Switching location clears any previously-chosen item/licence.
  // Items are filtered to the selected location AND to item_types that can
  // be sold as direct subs (sellable_recurring=true AND requires_license=false).
  // Licence-required items (memberships, offices) come through the Licence path,
  // not the Item path — enforced by DB trigger too.
  const itemOptions = $derived(
    editing?.location_id
      ? [
          { value: '', label: 'Select item…' },
          ...data.items
            .filter((i: any) =>
              i.location_id === editing.location_id &&
              i.item_types?.sellable_recurring === true &&
              i.item_types?.requires_license === false
            )
            .map((i: any) => ({ value: i.id, label: i.name }))
        ]
      : [{ value: '', label: 'Pick a location first' }]
  )
  const licenseOptions = $derived(
    editing?.location_id
      ? [
          { value: '', label: 'Select licence…' },
          ...data.licenses
            .filter((l: any) => l.location_id === editing.location_id)
            .map((l: any) => ({ value: l.id, label: l.label }))
        ]
      : [{ value: '', label: 'Pick a location first' }]
  )

  $effect(() => {
    if (!editing) return
    // Clear item/licence when location changes and the current value no longer belongs
    const loc = editing.location_id
    if (editing.item_id) {
      const ok = data.items.some((i: any) => i.id === editing.item_id && i.location_id === loc)
      if (!ok) editing.item_id = null
    }
    if (editing.license_id) {
      const ok = data.licenses.some((l: any) => l.id === editing.license_id && l.location_id === loc)
      if (!ok) editing.license_id = null
    }
  })
  const orgOptions = $derived([
    { value: '', label: 'Select organisation…' },
    ...data.organisations.map((o: any) => ({ value: o.id, label: o.name }))
  ])
  const locationOptions = $derived([
    { value: '', label: 'Select location…' },
    ...data.locations.map((l: any) => ({ value: l.id, label: l.short_name ?? l.name }))
  ])
  const personOptions = $derived([
    { value: '', label: 'None' },
    ...data.persons.map((p: any) => ({ value: p.id, label: `${p.first_name} ${p.last_name}` }))
  ])
  const statusOptions = STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
  const frequencyOptions = FREQUENCIES.map(f => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) }))

  const supersedingLabel = $derived.by(() => {
    if (!editing?.supersedes_subscription_line_id) return null
    const id = editing.supersedes_subscription_line_id
    const hit = (data.subs as SubscriptionLineEnriched[]).find(s => s.id === id)
    if (!hit) return id.slice(0, 8)
    return `${sourceLabel(hit)} v${hit.version}`
  })
</script>

<PageHead title="Subscriptions" lede="Mini-contracts — every recurring billable thing has exactly one row.">
  {#if can('subscriptions', 'create')}
    <Button size="sm" onclick={() => editing = newDraft()}>+ Add Subscription</Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<DataTable
  data={data.subs as SubscriptionLineEnriched[]}
  {columns}
  {filters}
  table="subscription_lines"
  title="Subscriptions"
  lede="Mini-contracts — every recurring billable thing has exactly one row."
  searchFields={['organisation_name', 'item_name', 'license_item_name', 'user_name', 'location_name']}
  searchPlaceholder="Search organisation, item, licence…"
  csvFilename="subscriptions"
  empty="No subscriptions yet."
  timesToggle
  isActiveRow={(s) => s.id === editing?.id}
  onActivate={(s) => editing = s}
>
  {#snippet row(sub, ctx)}
    <td>{sub.organisation_name ?? '—'}</td>
    <td>{sourceLabel(sub)}</td>
    <td class="mono align-right">
      <span class="rate">{sub.base_rate.toLocaleString()}</span>
      <span class="currency">{sub.currency}</span>
    </td>
    <td class="muted hide-md">{sub.frequency ?? '—'}</td>
    <td>
      <Badge tone={STATUS_TONE[sub.status] ?? 'default'}>{sub.status}</Badge>
    </td>
    <td class="date hide-sm">
      <div>{new Date(sub.started_at).toLocaleDateString()}</div>
      {#if ctx.showTimes}
        <div class="date-time">{new Date(sub.started_at).toLocaleTimeString()}</div>
      {/if}
    </td>
  {/snippet}
  {#snippet pageActions()}
    {#if can('subscriptions', 'create')}
      <Button size="sm" onclick={() => editing = newDraft()}>+ Add Subscription</Button>
    {/if}
  {/snippet}
  {#snippet actions(sub)}
    {#if can('subscriptions', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = sub}>Edit</Button>
    {/if}
    {#if can('subscriptions', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: sub.id }}
        confirm={{
          title: 'Delete subscription?',
          message: `Permanently delete this subscription? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} width="720px" title={editing?.id ? 'Edit Subscription' : 'Add Subscription'} formId="sub-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action={editing.id ? '?/update' : '?/create'}
      id="sub-form"
      autocomplete="off"
      use:enhance={() => {
        saving = true
        return async ({ update }) => {
          await update({ reset: false })
          saving = false
        }
      }}
    >
      {#if editing.id}
        <input type="hidden" name="id" value={editing.id} />
      {/if}
      <input type="hidden" name="source_kind" value={sourceKind} />

      <h3 class="section-title">Source</h3>
      <div class="radio-row">
        <label class="radio">
          <input type="radio" name="source_kind_ui" value="item" checked={sourceKind === 'item'} onchange={() => sourceKind = 'item'} />
          <span>Item</span>
        </label>
        <label class="radio">
          <input type="radio" name="source_kind_ui" value="license" checked={sourceKind === 'license'} onchange={() => sourceKind = 'license'} />
          <span>Licence</span>
        </label>
      </div>
      <FieldGrid cols={2}>
        <Field label="Location" required>
          <Select name="location_id" bind:value={editing.location_id} options={locationOptions} required />
        </Field>
        {#if sourceKind === 'item'}
          <Field label="Item" required>
            <Select name="item_id" bind:value={editing.item_id} options={itemOptions} required />
          </Field>
        {:else}
          <Field label="Licence" required>
            <Select name="license_id" bind:value={editing.license_id} options={licenseOptions} required />
          </Field>
        {/if}
        <Field label="Organisation" required>
          <Select name="organisation_id" bind:value={editing.organisation_id} options={orgOptions} required />
        </Field>
        <Field label="User">
          <Select name="user_id" bind:value={editing.user_id} options={personOptions} />
        </Field>
      </FieldGrid>

      <h3 class="section-title">Commercial</h3>
      <FieldGrid cols={3}>
        <Field name="base_rate" label="Base Rate" type="number" value={String(editing.base_rate ?? 0)} required />
        <Field name="currency" label="Currency" value={editing.currency ?? 'ZAR'} required />
        <Field name="quantity" label="Quantity" type="number" value={String(editing.quantity ?? 1)} />
        <Field label="Frequency">
          <Select name="frequency" value={editing.frequency ?? ''} options={[{ value: '', label: 'None' }, ...frequencyOptions]} />
        </Field>
        <Field name="interval_months" label="Interval (months)" type="number" value={String(editing.interval_months ?? 1)} />
      </FieldGrid>

      <h3 class="section-title">Lifecycle</h3>
      <FieldGrid cols={3}>
        <Field name="started_at" label="Started" type="date" value={toDateInput(editing.started_at)} required />
        <Field name="ended_at" label="Ended" type="date" value={toDateInput(editing.ended_at)} />
        <Field name="next_invoice_at" label="Next Invoice" type="date" value={toDateInput(editing.next_invoice_at)} />
      </FieldGrid>

      <h3 class="section-title">Proposal</h3>
      <FieldGrid cols={2}>
        <Field name="proposed_at" label="Proposed" type="datetime-local" value={toDateTimeLocalInput(editing.proposed_at)} />
        <Field name="expires_at" label="Expires" type="datetime-local" value={toDateTimeLocalInput(editing.expires_at)} />
        <Field name="accepted_at" label="Accepted" type="datetime-local" value={toDateTimeLocalInput(editing.accepted_at)} />
        <Field name="rejected_at" label="Rejected" type="datetime-local" value={toDateTimeLocalInput(editing.rejected_at)} />
      </FieldGrid>

      <h3 class="section-title">Status</h3>
      <FieldGrid cols={2}>
        <Field label="Status">
          <Select name="status" bind:value={currentStatus} options={statusOptions} />
        </Field>
        {#if currentStatus === 'cancelled'}
          <Field name="cancelled_at" label="Cancelled" type="datetime-local" value={toDateTimeLocalInput(editing.cancelled_at)} />
          <Field name="cancellation_reason" label="Cancellation Reason" value={editing.cancellation_reason ?? ''} />
        {/if}
      </FieldGrid>

      <h3 class="section-title">Versioning</h3>
      <FieldGrid cols={2}>
        <Field name="version_display" label="Version (read-only)" value={String(editing.version ?? 1)} readonly />
        <Field label="Supersedes">
          {#if editing.supersedes_subscription_line_id}
            <a class="supersedes-link" href={`#${editing.supersedes_subscription_line_id}`}>
              {supersedingLabel}
            </a>
          {:else}
            <div class="none">None</div>
          {/if}
        </Field>
      </FieldGrid>

      <h3 class="section-title">Notes</h3>
      <FieldGrid cols={1}>
        <Field name="notes" label="Notes" value={editing.notes ?? ''} />
      </FieldGrid>
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    {#if editing && editing.id}
      <form
        method="POST"
        action="?/convertToInvoice"
        style="display:contents"
        onsubmit={(e) => { if (!confirm('Create a draft invoice from this subscription?')) e.preventDefault() }}
      >
        <input type="hidden" name="id" value={editing.id} />
        <input type="hidden" name="status" value={currentStatus} />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={currentStatus !== 'signed'}
          title={currentStatus !== 'signed' ? `Only signed subs can be invoiced (current status: ${currentStatus})` : 'Create a draft invoice from this sub'}
        >Invoice now</Button>
      </form>
    {/if}
    <Button type="submit" form="sub-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }
  .muted { color: var(--text-muted); }
  .mono { font-family: var(--font-mono); }
  .align-right { text-align: right; }
  .rate { color: var(--text); }
  .currency { color: var(--text-muted); margin-left: 4px; font-size: var(--text-xs); }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }

  .radio-row {
    display: flex;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
  }
  .radio {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text);
    cursor: pointer;
  }
  .radio input { accent-color: var(--accent); }

  .supersedes-link {
    color: var(--accent);
    font-size: var(--text-sm);
    text-decoration: underline;
  }
  .none {
    color: var(--text-muted);
    font-size: var(--text-sm);
    padding: 0.4rem 0;
  }

  @media (max-width: 640px) { .hide-sm { display: none; } }
  @media (max-width: 900px) { .hide-md { display: none; } }
</style>
