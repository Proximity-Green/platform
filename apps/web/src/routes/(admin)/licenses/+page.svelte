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
    SubmitButton
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'
  import type { LicenseEnriched } from '$lib/services/licenses.service'

  function toDateInput(v: string | null): string {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  let { data, form } = $props()
  let editing = $state<LicenseEnriched | null>(null)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { editing = null }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  function isActive(l: LicenseEnriched): boolean {
    if (!l.ended_at) return true
    return new Date(l.ended_at).getTime() > Date.now()
  }

  const columns: Column<LicenseEnriched>[] = [
    { key: 'organisation_name', label: 'Organisation', sortable: true, width: '20%', get: l => l.organisation_name ?? '' },
    { key: 'item_name', label: 'Item', sortable: true, width: '22%', get: l => l.item_name ?? '' },
    { key: 'user_name', label: 'User', sortable: true, width: '18%', muted: true, get: l => l.user_name ?? '', hideBelow: 'md' },
    { key: 'location_name', label: 'Location', sortable: true, width: '14%', muted: true, get: l => l.location_name ?? '', hideBelow: 'md' },
    { key: 'started_at', label: 'Started', sortable: true, width: '13%', date: true, hideBelow: 'sm' },
    { key: 'ended_at', label: 'Ended', sortable: true, width: '13%', date: true, hideBelow: 'sm' }
  ]

  const filters: Filter<LicenseEnriched>[] = [
    { key: 'active', label: 'Active', test: isActive },
    { key: 'ended', label: 'Ended', test: l => !isActive(l) },
    { key: 'all', label: 'All' }
  ]

  const itemOptions = $derived([
    { value: '', label: 'Select item…' },
    ...data.items.map((i: any) => ({ value: i.id, label: i.name }))
  ])
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
</script>

<PageHead title="Licences" lede="Access-right instances granted to a person or organisation at a space for a period.">
  {#if can('subscriptions', 'create')}
    <Button size="sm" onclick={() => editing = { id: '', item_id: '', organisation_id: '', location_id: '', user_id: null, started_at: new Date().toISOString(), ended_at: null, notes: null } as any}>+ Add Licence</Button>
  {/if}
</PageHead>

<Toast error={form?.error} success={form?.success} message={form?.message} />

<DataTable
  data={data.licenses as LicenseEnriched[]}
  {columns}
  {filters}
  table="licenses"
  title="Licences"
  lede="Access-right instances granted to a person or organisation at a space for a period."
  searchFields={['item_name', 'organisation_name', 'user_name', 'location_name']}
  searchPlaceholder="Search organisation, item, user, location…"
  csvFilename="licences"
  empty="No licences yet."
  timesToggle
  isActiveRow={(l) => l.id === editing?.id}
  onActivate={(l) => editing = l}
>
  {#snippet row(license, ctx)}
    <td>{license.organisation_name ?? '—'}</td>
    <td>{license.item_name ?? '—'}</td>
    <td class="muted hide-md">{license.user_name ?? '—'}</td>
    <td class="muted hide-md">{license.location_name ?? '—'}</td>
    <td class="date hide-sm">
      <div>{new Date(license.started_at).toLocaleDateString()}</div>
      {#if ctx.showTimes}
        <div class="date-time">{new Date(license.started_at).toLocaleTimeString()}</div>
      {/if}
    </td>
    <td class="date hide-sm">
      {#if license.ended_at}
        <div>{new Date(license.ended_at).toLocaleDateString()}</div>
        {#if ctx.showTimes}
          <div class="date-time">{new Date(license.ended_at).toLocaleTimeString()}</div>
        {/if}
      {:else}
        <span class="muted">—</span>
      {/if}
    </td>
  {/snippet}
  {#snippet pageActions()}
    {#if can('subscriptions', 'create')}
      <Button size="sm" onclick={() => editing = { id: '', item_id: '', organisation_id: '', location_id: '', user_id: null, started_at: new Date().toISOString(), ended_at: null, notes: null } as any}>+ Add Licence</Button>
    {/if}
  {/snippet}
  {#snippet actions(license)}
    {#if can('subscriptions', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = license}>Edit</Button>
    {/if}
    {#if can('subscriptions', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: license.id }}
        confirm={{
          title: 'Delete licence?',
          message: `Permanently delete this licence? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title={editing?.id ? 'Edit Licence' : 'Add Licence'} formId="license-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action={editing.id ? '?/update' : '?/create'}
      id="license-form"
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

      <h3 class="section-title">Identity</h3>
      <FieldGrid cols={2}>
        <Field label="Item" required>
          <Select name="item_id" value={editing.item_id ?? ''} options={itemOptions} required />
        </Field>
        <Field label="Organisation" required>
          <Select name="organisation_id" value={editing.organisation_id ?? ''} options={orgOptions} required />
        </Field>
        <Field label="Location" required>
          <Select name="location_id" value={editing.location_id ?? ''} options={locationOptions} required />
        </Field>
        <Field label="User">
          <Select name="user_id" value={editing.user_id ?? ''} options={personOptions} />
        </Field>
      </FieldGrid>

      <h3 class="section-title">Lifecycle</h3>
      <FieldGrid cols={2}>
        <Field name="started_at" label="Started" type="date" value={toDateInput(editing.started_at)} required />
        <Field name="ended_at" label="Ended" type="date" value={toDateInput(editing.ended_at)} />
      </FieldGrid>

      <h3 class="section-title">Notes</h3>
      <FieldGrid cols={1}>
        <Field name="notes" label="Notes" value={editing.notes ?? ''} />
      </FieldGrid>
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="license-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }
  .muted { color: var(--text-muted); }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }

  @media (max-width: 640px) { .hide-sm { display: none; } }
  @media (max-width: 900px) { .hide-md { display: none; } }
</style>
