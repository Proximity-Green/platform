<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { goto } from '$app/navigation'
  import {
    Button,
    PageHead,
    Toast,
    Badge,
    DataTable,
    FormCard,
    FieldGrid,
    Field,
    SubmitButton
  } from '$lib/components/ui'
  import type { Column } from '$lib/components/ui/DataTable.svelte'

  type ItemType = {
    id: string
    slug: string
    name: string
    description: string | null
    pricing_params: Record<string, any> | null
    requires_license: boolean
    sellable_ad_hoc: boolean
    sellable_recurring: boolean
    apply_pro_rata: boolean
    metadata: Record<string, any> | null
    created_at: string
    updated_at: string
  }

  // Per-type detail-table fields (label-only, used for the Fields count column).
  // Source of truth lives in /item-types/[id]/+page.svelte (TYPE_FIELDS).
  const TYPE_FIELD_LABELS: Record<string, string[]> = {
    office: ['Area (m²)', 'Capacity', 'Aesthetic', 'Aesthetic impact', 'Safety margin', 'Start price per m²', 'Layout'],
    meeting_room: ['Capacity', 'Price per user / day', 'Off-peak factor', 'Layout', 'Slots per day'],
    hotel_room: ['Capacity', 'Price per day', 'Layout'],
    membership: ['Occupancy type','Seats included','Cost per extra member','Billing cadence','Space credits / month','Credits — full day','Credits — half day','Stuff credits / month','Print credits / month','Marketing description'],
    product: ['Volume / pack size','Member discount %','Price customisable','Self-service purchase','Supplier name','Supplier SKU'],
    service: ['Duration (min)','Billable unit','Requires booking','Capacity'],
    art: ['Artist','Medium','Height','Width','Year created','Framed','Insurance value','List price','Status'],
    asset: ['Kind','Make','Model','Serial #','Registration','Acquired','Status','Rate / hour','Rate / day','Notes']
  }

  function typeFieldCount(slug: string | null | undefined): number {
    if (!slug) return 0
    return (TYPE_FIELD_LABELS[slug] ?? []).length
  }
  function typeFieldList(slug: string | null | undefined): string {
    if (!slug) return ''
    return (TYPE_FIELD_LABELS[slug] ?? []).join(', ')
  }

  let { data, form } = $props()
  let showCreate = $state(false)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { showCreate = false }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const columns: Column<ItemType>[] = [
    { key: 'slug', label: 'Slug', sortable: true, width: '12%', mono: true },
    { key: 'name', label: 'Name', sortable: true, width: '14%' },
    { key: 'fields', label: 'Fields', width: '6%', align: 'right', get: t => typeFieldCount(t.slug) },
    { key: 'description', label: 'Description', width: '36%', muted: true, ellipsis: true, render: t => t.description || '—' },
    { key: 'requires_license', label: 'Licence', sortable: true, width: '8%' },
    { key: 'sellable_ad_hoc', label: 'Ad-hoc', sortable: true, width: '8%' },
    { key: 'sellable_recurring', label: 'Recurring', sortable: true, width: '8%' }
  ]
</script>

<PageHead title="Item Types" lede="Lookup table that drives sellability policy for every catalog item.">
  {#if can('items', 'create')}
    <Button size="sm" onclick={() => { showCreate = !showCreate }}>
      {showCreate ? 'Cancel' : '+ Add Item Type'}
    </Button>
  {/if}
</PageHead>

<Toast error={form?.error} success={form?.success} message={form?.message} />

{#if showCreate && can('items', 'create')}
  <div class="create-wrap">
    <FormCard
      action="?/create"
      id="create-item-type-form"
      onSubmit={() => { saving = true }}
      onResult={() => { saving = false }}
    >
      <FieldGrid cols={3}>
        <Field name="slug" label="Slug" required placeholder="e.g. meeting_room" />
        <Field name="name" label="Name" required placeholder="e.g. Meeting Room" />
        <Field name="description" label="Description" />
        <label class="checkbox-field">
          <input type="checkbox" name="requires_license" />
          <span>Requires Licence</span>
        </label>
        <label class="checkbox-field">
          <input type="checkbox" name="sellable_ad_hoc" />
          <span>Sellable Ad-hoc</span>
        </label>
        <label class="checkbox-field">
          <input type="checkbox" name="sellable_recurring" />
          <span>Sellable Recurring</span>
        </label>
        <label class="checkbox-field">
          <input type="checkbox" name="apply_pro_rata" />
          <span>Apply Pro-rata</span>
        </label>
      </FieldGrid>
      {#snippet actions()}
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Create Item Type'}</Button>
      {/snippet}
    </FormCard>
  </div>
{/if}

<DataTable
  data={data.itemTypes as ItemType[]}
  {columns}
  table="item-types"
  title="Item Types"
  lede="Lookup table that drives sellability policy for every catalog item."
  searchFields={['slug', 'name', 'description']}
  searchPlaceholder="Search slug, name, description…"
  csvFilename="item-types"
  empty="No item types yet."
  onActivate={(t) => goto(`/item-types/${t.id}`)}
>
  {#snippet row(it)}
    <td class="mono">{it.slug}</td>
    <td><span class="name">{it.name}</span></td>
    <td class="mono right" title={typeFieldList(it.slug)}>
      {#if typeFieldCount(it.slug) > 0}
        {typeFieldCount(it.slug)}
      {:else}
        <span class="muted">—</span>
      {/if}
    </td>
    <td class="muted ellipsis" title={it.description ?? ''}>{it.description ?? '—'}</td>
    <td>
      {#if it.requires_license}
        <Badge tone="info">Yes</Badge>
      {:else}
        <Badge tone="default">No</Badge>
      {/if}
    </td>
    <td>
      {#if it.sellable_ad_hoc}
        <Badge tone="success">Yes</Badge>
      {:else}
        <Badge tone="default">No</Badge>
      {/if}
    </td>
    <td>
      {#if it.sellable_recurring}
        <Badge tone="success">Yes</Badge>
      {:else}
        <Badge tone="default">No</Badge>
      {/if}
    </td>
  {/snippet}
  {#snippet pageActions()}
    {#if can('items', 'create')}
      <Button size="sm" onclick={() => { showCreate = !showCreate }}>
        {showCreate ? 'Cancel' : '+ Add Item Type'}
      </Button>
    {/if}
  {/snippet}
  {#snippet actions(it)}
    {#if can('items', 'update')}
      <Button variant="ghost" size="sm" href={`/item-types/${it.id}`}>Edit</Button>
    {/if}
  {/snippet}
</DataTable>

<style>
  .create-wrap { margin-bottom: var(--space-6); }
  .name {
    font-weight: var(--weight-medium);
    color: var(--text);
  }
  .right { text-align: right; }
  .muted { color: var(--text-muted); }

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
