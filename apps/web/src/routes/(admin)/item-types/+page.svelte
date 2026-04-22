<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import {
    Button,
    PageHead,
    Toast,
    Badge,
    DataTable,
    Drawer,
    FormCard,
    FieldGrid,
    Field,
    Select,
    SubmitButton
  } from '$lib/components/ui'
  import type { Column } from '$lib/components/ui/DataTable.svelte'

  type ItemType = {
    id: string
    slug: string
    name: string
    description: string | null
    family: string | null
    requires_license: boolean
    sellable_ad_hoc: boolean
    sellable_recurring: boolean
    metadata: Record<string, any> | null
    created_at: string
    updated_at: string
  }

  // Mirror of FAMILY_FIELDS from /items/[id]/+page.svelte — kept here so the
  // Item Types table can preview which attributes each family exposes.
  const FAMILY_FIELD_LABELS: Record<string, string[]> = {
    space: ['Floor area','Capacity','Aesthetic','Aesthetic impact','Safety margin','Start price per m²','Number available','Private','Default layout','Price per day','Price per user / day','Business case'],
    membership: ['Occupancy type','Seats included','Cost per extra member','Billing cadence','Space credits / month','Credits — full day','Credits — half day','Stuff credits / month','Print credits / month','Marketing description'],
    product: ['Volume / pack size','Member discount %','Price customisable','Pro-rata billing','Self-service purchase','Supplier name','Supplier SKU'],
    service: ['Duration (min)','Billable unit','Requires booking','Capacity'],
    art: ['Artist','Medium','Height','Width','Year created','Framed','Insurance value','List price','Status'],
    asset: ['Kind','Make','Model','Serial #','Registration','Acquired','Status','Rate / hour','Rate / day','Notes']
  }

  const FAMILY_OPTIONS = [
    { value: '', label: '— (none)' },
    { value: 'space',      label: 'space' },
    { value: 'membership', label: 'membership' },
    { value: 'product',    label: 'product' },
    { value: 'service',    label: 'service' },
    { value: 'art',        label: 'art' },
    { value: 'asset',      label: 'asset' }
  ]

  function familyFieldCount(family: string | null | undefined): number {
    if (!family) return 0
    return (FAMILY_FIELD_LABELS[family] ?? []).length
  }
  function familyFieldList(family: string | null | undefined): string {
    if (!family) return ''
    return (FAMILY_FIELD_LABELS[family] ?? []).join(', ')
  }

  let { data, form } = $props()
  let showCreate = $state(false)
  let editing = $state<ItemType | null>(null)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { editing = null; showCreate = false }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const yesNo = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' }
  ]

  const columns: Column<ItemType>[] = [
    { key: 'slug', label: 'Slug', sortable: true, width: '12%', mono: true },
    { key: 'name', label: 'Name', sortable: true, width: '14%' },
    { key: 'family', label: 'Family', sortable: true, width: '10%', get: t => t.family ?? '' },
    { key: 'fields', label: 'Fields', width: '8%', align: 'right', get: t => familyFieldCount(t.family) },
    { key: 'description', label: 'Description', width: '24%', muted: true, ellipsis: true, render: t => t.description || '—' },
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
        <Field label="Family">
          <Select name="family" value="" options={FAMILY_OPTIONS} />
        </Field>
        <Field name="description" label="Description" />
        <Field label="Requires Licence">
          <Select name="requires_license" value="false" options={yesNo} />
        </Field>
        <Field label="Sellable Ad-hoc">
          <Select name="sellable_ad_hoc" value="false" options={yesNo} />
        </Field>
        <Field label="Sellable Recurring">
          <Select name="sellable_recurring" value="false" options={yesNo} />
        </Field>
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
  isActiveRow={(t) => t.id === editing?.id}
  onActivate={(t) => editing = t}
>
  {#snippet row(it)}
    <td class="mono">{it.slug}</td>
    <td><span class="name">{it.name}</span></td>
    <td>
      {#if it.family}
        <Badge tone="info">{it.family}</Badge>
      {:else}
        <span class="muted">—</span>
      {/if}
    </td>
    <td class="mono right" title={familyFieldList(it.family)}>
      {#if familyFieldCount(it.family) > 0}
        {familyFieldCount(it.family)}
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
      <Button variant="ghost" size="sm" onclick={() => editing = it}>Edit</Button>
    {/if}
    {#if can('items', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: it.id }}
        confirm={{
          title: 'Delete item type?',
          message: `Permanently delete ${it.name}? Items referencing this type will break.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title="Edit Item Type" formId="edit-item-type-form" onClose={() => editing = null}>
  {#if editing}
    <form
      method="POST"
      action="?/update"
      id="edit-item-type-form"
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
        <Field name="slug" label="Slug" value={editing.slug} required />
        <Field name="name" label="Name" value={editing.name} required />
      </FieldGrid>
      <FieldGrid cols={2}>
        <Field label="Family">
          <Select name="family" value={editing.family ?? ''} options={FAMILY_OPTIONS} />
        </Field>
        <Field name="description" label="Description" value={editing.description ?? ''} />
      </FieldGrid>

      {#if editing.family && FAMILY_FIELD_LABELS[editing.family]}
        <div class="family-preview">
          <span class="family-preview-label">Fields ({FAMILY_FIELD_LABELS[editing.family].length})</span>
          <div class="family-preview-list">
            {#each FAMILY_FIELD_LABELS[editing.family] as f}
              <Badge tone="default">{f}</Badge>
            {/each}
          </div>
        </div>
      {/if}

      <h3 class="section-title">Policy</h3>
      <FieldGrid cols={3}>
        <Field label="Requires Licence">
          <Select
            name="requires_license"
            value={editing.requires_license ? 'true' : 'false'}
            options={yesNo}
          />
        </Field>
        <Field label="Sellable Ad-hoc">
          <Select
            name="sellable_ad_hoc"
            value={editing.sellable_ad_hoc ? 'true' : 'false'}
            options={yesNo}
          />
        </Field>
        <Field label="Sellable Recurring">
          <Select
            name="sellable_recurring"
            value={editing.sellable_recurring ? 'true' : 'false'}
            options={yesNo}
          />
        </Field>
      </FieldGrid>

      {#if editing.metadata}
        <h3 class="section-title">Metadata (read-only)</h3>
        <pre class="json">{JSON.stringify(editing.metadata, null, 2)}</pre>
      {/if}
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => editing = null} disabled={saving}>Cancel</Button>
    <Button type="submit" form="edit-item-type-form" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
  {/snippet}
</Drawer>

<style>
  .create-wrap { margin-bottom: var(--space-6); }
  .name {
    font-weight: var(--weight-medium);
    color: var(--text);
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
  .json {
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow-x: auto;
    margin: 0;
  }
  .family-preview {
    margin: var(--space-3) 0 var(--space-4);
    padding: var(--space-2) var(--space-3);
    background: #e9ecef;
    border-radius: var(--radius-sm);
  }
  .family-preview-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--label-color);
    font-weight: var(--weight-semibold);
    margin-bottom: var(--space-2);
  }
  .family-preview-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .right { text-align: right; }
  .muted { color: var(--text-muted); }
</style>
