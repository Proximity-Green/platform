<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import {
    Button,
    PageHead,
    Toast,
    DataTable,
    Drawer,
    FormCard,
    FieldGrid,
    Field,
    Select,
    Copyable,
    SubmitButton,
    Badge
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'

  type Space = {
    id: string
    wsm_id: string | null
    location_id: string
    location: { id: string; name: string; slug: string } | null
    name: string
    code: string | null
    description: string | null
    capacity: number | null
    area_sqm: number | null
    floor: string | null
    active: boolean
    metadata: Record<string, unknown> | null
    created_at: string
  }

  type LocationRef = { id: string; name: string; slug: string; status?: string }

  let { data, form } = $props()
  let showCreate = $state(false)
  let editing = $state<Space | null>(null)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { editing = null; showCreate = false }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const columns: Column<Space>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '22%' },
    { key: 'code', label: 'Code', width: '10%', mono: true, muted: true, hideBelow: 'sm' },
    { key: 'location', label: 'Location', sortable: true, width: '20%',
      get: s => s.location?.name ?? '' },
    { key: 'floor', label: 'Floor', width: '8%', muted: true, hideBelow: 'md' },
    { key: 'capacity', label: 'Capacity', width: '10%', align: 'right', hideBelow: 'md',
      get: s => s.capacity, render: s => s.capacity != null ? String(s.capacity) : '—' },
    { key: 'area_sqm', label: 'Area (sqm)', width: '10%', align: 'right', hideBelow: 'md',
      get: s => s.area_sqm, render: s => s.area_sqm != null ? String(s.area_sqm) : '—' },
    { key: 'active', label: 'Active', width: '8%' }
  ]

  const locationFilters: Filter<Space>[] = $derived([
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active', test: s => s.active },
    { key: 'inactive', label: 'Inactive', test: s => !s.active },
    ...(data.locations as LocationRef[]).map(l => ({
      key: `loc_${l.id}`,
      label: l.short_name ?? l.name,
      test: (s: Space) => s.location_id === l.id
    }))
  ])
</script>

<PageHead title="Spaces" lede="Bookable units inside each location — desks, offices, rooms.">
  {#if can('locations', 'create')}
    <Button size="sm" onclick={() => { showCreate = !showCreate }}>
      {showCreate ? 'Cancel' : '+ Add Space'}
    </Button>
  {/if}
</PageHead>

<Toast error={form?.error} success={form?.success} message={form?.message} />

{#if showCreate && can('locations', 'create')}
  <div class="create-wrap">
    <FormCard
      action="?/create"
      id="create-form"
      onSubmit={() => { saving = true }}
      onResult={() => { saving = false }}
    >
      <FieldGrid cols={4}>
        <Field label="Location" required>
          <Select
            name="location_id"
            placeholder="Choose location…"
            required
            options={(data.locations as LocationRef[]).map(l => ({ value: l.id, label: l.short_name ?? l.name }))}
          />
        </Field>
        <Field name="name" label="Name" required />
        <Field name="code" label="Code" placeholder="e.g. 4A" />
        <Field name="floor" label="Floor" />
      </FieldGrid>
      {#snippet actions()}
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Create Space'}</Button>
      {/snippet}
    </FormCard>
  </div>
{/if}

<DataTable
  data={data.spaces as Space[]}
  {columns}
  filters={locationFilters}
  table="spaces"
  title="Spaces"
  lede="Bookable units inside each location — desks, offices, rooms."
  searchFields={['name', 'code', 'floor', 'description', 'location.name']}
  searchPlaceholder="Search name, code, floor…"
  csvFilename="spaces"
  empty="No spaces yet."
  timesToggle
  isActiveRow={(s) => s.id === editing?.id}
  onActivate={(s) => editing = s}
>
  {#snippet row(space, _ctx)}
    <td class="name-cell">
      <Copyable value={space.name}>
        <span class="name">{space.name}</span>
      </Copyable>
      {#if space.description}
        <div class="desc">{space.description}</div>
      {/if}
    </td>
    <td class="mono muted hide-sm">{space.code ?? '—'}</td>
    <td class="muted">{space.location?.name ?? '—'}</td>
    <td class="muted hide-md">{space.floor ?? '—'}</td>
    <td class="align-right hide-md">{space.capacity ?? '—'}</td>
    <td class="align-right hide-md">{space.area_sqm ?? '—'}</td>
    <td>
      {#if space.active}
        <Badge tone="success">active</Badge>
      {:else}
        <Badge tone="danger">inactive</Badge>
      {/if}
    </td>
  {/snippet}
  {#snippet pageActions()}
    {#if can('locations', 'create')}
      <Button size="sm" onclick={() => { showCreate = !showCreate }}>
        {showCreate ? 'Cancel' : '+ Add Space'}
      </Button>
    {/if}
  {/snippet}
  {#snippet actions(space)}
    {#if can('locations', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = space}>Edit</Button>
    {/if}
    {#if can('locations', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: space.id }}
        confirm={{
          title: 'Delete space?',
          message: `Permanently delete ${space.name}? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title="Edit Space" formId="edit-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action="?/update"
      id="edit-form"
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
        <Field label="Location" required>
          <Select
            name="location_id"
            value={editing.location_id}
            required
            options={(data.locations as LocationRef[]).map(l => ({ value: l.id, label: l.short_name ?? l.name }))}
          />
        </Field>
        <Field name="name" label="Name" value={editing.name} required />
        <Field name="code" label="Code" value={editing.code ?? ''} />
        <Field name="floor" label="Floor" value={editing.floor ?? ''} />
      </FieldGrid>
      <FieldGrid cols={1}>
        <Field name="description" label="Description" value={editing.description ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Capacity</h3>
      <FieldGrid cols={2}>
        <Field name="capacity" label="Capacity" type="number" value={editing.capacity != null ? String(editing.capacity) : ''} />
        <Field name="area_sqm" label="Area (sqm)" value={editing.area_sqm != null ? String(editing.area_sqm) : ''} />
      </FieldGrid>

      <h3 class="section-title">Status</h3>
      <FieldGrid cols={2}>
        <label class="checkbox-field">
          <input type="checkbox" name="active" checked={editing.active} />
          <span>Active</span>
        </label>
      </FieldGrid>
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="edit-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .create-wrap { margin-bottom: var(--space-6); }
  .name-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name { font-weight: var(--weight-medium); color: var(--text); }
  .desc {
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text);
    padding-top: 18px;
  }
  .checkbox-field input { width: 16px; height: 16px; accent-color: var(--accent); }

  @media (max-width: 640px) { .hide-sm { display: none; } }
  @media (max-width: 900px) { .hide-md { display: none; } }
</style>
