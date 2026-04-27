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
    Badge,
    SubmitButton, ErrorBanner
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'
  import type { Space, SpaceFilter } from '$lib/services/spaces.service'

  type ItemTypeRef = { id: string; slug: string; name: string }
  type LocationRef  = { id: string; name: string; short_name: string | null }

  let { data, form } = $props()
  let editing = $state<Space | null>(null)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { editing = null }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  function newDraft(): Space {
    return {
      id: '',
      name: '',
      description: null,
      filter: {},
      manual_item_ids: null,
      active: true,
      created_at: '',
      updated_at: ''
    }
  }

  function summariseFilter(f: SpaceFilter | null | undefined): string {
    if (!f) return '—'
    const parts: string[] = []
    if (f.item_type_slugs?.length) parts.push(`type ∈ ${f.item_type_slugs.join(',')}`)
    if (f.location_ids?.length)    parts.push(`@${f.location_ids.length} loc${f.location_ids.length > 1 ? 's' : ''}`)
    if (f.capacity_min != null)    parts.push(`cap ≥ ${f.capacity_min}`)
    if (f.capacity_max != null)    parts.push(`cap ≤ ${f.capacity_max}`)
    if (f.area_min != null)        parts.push(`m² ≥ ${f.area_min}`)
    if (f.area_max != null)        parts.push(`m² ≤ ${f.area_max}`)
    return parts.length ? parts.join(' · ') : '—'
  }

  const columns: Column<Space>[] = [
    { key: 'name',        label: 'Name',        sortable: true, width: '22%' },
    { key: 'description', label: 'Description', muted: true, ellipsis: true, width: '24%', render: s => s.description || '—' },
    { key: 'filter',      label: 'Filter',      muted: true, width: '34%', get: s => summariseFilter(s.filter) },
    { key: 'manual',      label: 'Pinned',      align: 'right', width: '8%', get: s => s.manual_item_ids?.length ?? 0 },
    { key: 'active',      label: 'Active',      sortable: true, width: '12%' }
  ]

  const filters: Filter<Space>[] = [
    { key: 'active',   label: 'Active',   test: s => s.active },
    { key: 'archived', label: 'Archived', test: s => !s.active },
    { key: 'all',      label: 'All' }
  ]
</script>

<PageHead title="Spaces" lede="Saved queries that group items for reporting (e.g. all offices in JHB, meeting rooms ≥ 8 seats).">
  {#if can('locations', 'create')}
    <Button size="sm" onclick={() => editing = newDraft()}>+ Add Space</Button>
  {/if}
</PageHead>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<DataTable
  data={data.spaces as Space[]}
  {columns}
  {filters}
  table="spaces"
  title="Spaces"
  lede="Saved queries that group items for reporting."
  searchFields={['name', 'description']}
  searchPlaceholder="Search name or description…"
  csvFilename="spaces"
  empty="No spaces yet."
  isActiveRow={(s) => s.id === editing?.id}
  onActivate={(s) => editing = s}
>
  {#snippet row(s)}
    <td><span class="name">{s.name}</span></td>
    <td class="muted ellipsis">{s.description ?? '—'}</td>
    <td class="muted mono small">{summariseFilter(s.filter)}</td>
    <td class="mono align-right">{s.manual_item_ids?.length ?? 0}</td>
    <td>
      {#if s.active}<Badge tone="success">Active</Badge>{:else}<Badge tone="default">Archived</Badge>{/if}
    </td>
  {/snippet}
  {#snippet pageActions()}
    {#if can('locations', 'create')}
      <Button size="sm" onclick={() => editing = newDraft()}>+ Add Space</Button>
    {/if}
  {/snippet}
  {#snippet actions(s)}
    {#if can('locations', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = s}>Edit</Button>
    {/if}
    {#if can('locations', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: s.id }}
        confirm={{
          title: 'Delete space?',
          message: `Permanently delete ${s.name}? Saved query only — no item data is touched.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title={editing?.id ? 'Edit Space' : 'Add Space'} formId="space-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action={editing.id ? '?/update' : '?/create'}
      id="space-form"
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
        <Field name="name" label="Name" value={editing.name} required />
        <label class="checkbox-field">
          <input type="checkbox" name="active" checked={editing.active} />
          <span>Active</span>
        </label>
      </FieldGrid>
      <FieldGrid cols={1}>
        <Field name="description" label="Description" value={editing.description ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Filter</h3>
      <p class="hint">Items matching ALL filters below will be members of this space.</p>

      <div class="filter-section">
        <span class="filter-label">Item types</span>
        <div class="checkbox-grid">
          {#each (data.itemTypes as ItemTypeRef[]) as t (t.id)}
            <label class="cb-row">
              <input
                type="checkbox"
                name="filter_item_type_slugs"
                value={t.slug}
                checked={editing.filter?.item_type_slugs?.includes(t.slug) ?? false}
              />
              <span>{t.name} <span class="mono muted">({t.slug})</span></span>
            </label>
          {/each}
        </div>
      </div>

      <div class="filter-section">
        <span class="filter-label">Locations</span>
        <div class="checkbox-grid">
          {#each (data.locations as LocationRef[]) as l (l.id)}
            <label class="cb-row">
              <input
                type="checkbox"
                name="filter_location_ids"
                value={l.id}
                checked={editing.filter?.location_ids?.includes(l.id) ?? false}
              />
              <span>{l.short_name ?? l.name}</span>
            </label>
          {/each}
        </div>
      </div>

      <FieldGrid cols={4}>
        <Field name="filter_capacity_min" label="Capacity min" type="number" value={editing.filter?.capacity_min != null ? String(editing.filter.capacity_min) : ''} />
        <Field name="filter_capacity_max" label="Capacity max" type="number" value={editing.filter?.capacity_max != null ? String(editing.filter.capacity_max) : ''} />
        <Field name="filter_area_min"     label="Area min (m²)" type="number" value={editing.filter?.area_min != null ? String(editing.filter.area_min) : ''} />
        <Field name="filter_area_max"     label="Area max (m²)" type="number" value={editing.filter?.area_max != null ? String(editing.filter.area_max) : ''} />
      </FieldGrid>
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="space-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .name { font-weight: var(--weight-medium); color: var(--text); }
  .muted { color: var(--text-muted); }
  .mono  { font-family: var(--font-mono); }
  .small { font-size: var(--text-xs); }
  .align-right { text-align: right; }

  .section-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wide, 0.08em);
    text-transform: uppercase;
    color: var(--label-color);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section-title:first-of-type { margin-top: 0; }

  .hint { color: var(--text-muted); font-size: var(--text-xs); margin: 0 0 var(--space-2); }

  .filter-section { margin-bottom: var(--space-4); }
  .filter-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
    margin-bottom: var(--space-2);
  }

  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 4px 12px;
  }
  .cb-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .cb-row input { accent-color: var(--accent); }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text);
    padding-top: 18px;
  }
  .checkbox-field input { width: 16px; height: 16px; accent-color: var(--accent); }
</style>
