<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
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

  type Status = 'active' | 'paused' | 'closed' | 'planned' | 'inactive'

  type Location = {
    id: string
    wsm_id: string | null
    legal_entity_id: string | null
    legal_entity: { id: string; name: string } | null
    community_manager_person_id: string | null
    community_manager: { id: string; first_name: string; last_name: string } | null
    name: string
    slug: string
    short_name: string | null
    description: string | null

    address_line_1: string | null
    address_line_2: string | null
    suburb: string | null
    city: string | null
    postal_code: string | null
    country_code: string | null

    latitude: number | null
    longitude: number | null

    email: string | null
    phone: string | null
    website: string | null

    timezone: string | null
    currency: string | null

    logo_url: string | null
    hero_image_url: string | null
    map_image_url: string | null
    map_link: string | null
    background_colour: string | null

    access_instructions: string | null
    banking_account_number: string | null
    banking_bank_code: string | null

    accounting_external_tenant_id: string | null
    accounting_gl_code: string | null
    accounting_item_code: string | null
    accounting_tax_code: string | null
    accounting_tracking_code: string | null
    accounting_tracking_name: string | null
    accounting_stationery_id: string | null
    accounting_branding_theme: string | null
    accounting_tax_type: string | null

    commercial_tax_percentage: number | null
    commercial_app_discount_percentage: number | null

    area_unit: string | null
    billing_date_pattern: string | null

    status: Status
    headquarters: boolean
    started_at: string | null
    closed_at: string | null
    created_at: string
  }

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
  let showCreate = $state(false)
  let editing = $state<Location | null>(null)
  let saving = $state(false)

  $effect(() => {
    if (form?.success) { editing = null; showCreate = false }
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'closed', label: 'Closed' },
    { value: 'planned', label: 'Planned' },
    { value: 'inactive', label: 'Inactive' }
  ]

  const timezoneOptions = [
    { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg' },
    { value: 'Africa/Nairobi', label: 'Africa/Nairobi' },
    { value: 'Africa/Lagos', label: 'Africa/Lagos' },
    { value: 'Africa/Cairo', label: 'Africa/Cairo' },
    { value: 'Europe/London', label: 'Europe/London' },
    { value: 'UTC', label: 'UTC' }
  ]

  const currencyOptions = [
    { value: 'ZAR', label: 'ZAR' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
    { value: 'GBP', label: 'GBP' },
    { value: 'KES', label: 'KES' },
    { value: 'NGN', label: 'NGN' }
  ]

  const areaUnitOptions = [
    { value: 'sqm', label: 'sqm' },
    { value: 'sqft', label: 'sqft' }
  ]

  const billingDatePatternOptions = [
    { value: 'advance_dated', label: 'Advance dated' },
    { value: 'current_dated', label: 'Current dated' }
  ]

  function statusTone(s: Status): 'success' | 'warning' | 'danger' | 'default' {
    if (s === 'active') return 'success'
    if (s === 'paused' || s === 'planned') return 'warning'
    if (s === 'closed' || s === 'inactive') return 'danger'
    return 'default'
  }

  const columns: Column<Location>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '22%' },
    { key: 'city', label: 'City', sortable: true, width: '14%', muted: true, hideBelow: 'md' },
    { key: 'community_manager', label: 'Community Manager', width: '18%', muted: true, hideBelow: 'md',
      get: l => l.community_manager ? `${l.community_manager.first_name} ${l.community_manager.last_name}` : '' },
    { key: 'currency', label: 'Currency', width: '8%', mono: true, hideBelow: 'sm' },
    { key: 'status', label: 'Status', sortable: true, width: '12%' },
    { key: 'created_at', label: 'Created', sortable: true, width: '12%', date: true, hideBelow: 'sm' }
  ]

  const filters: Filter<Location>[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active', test: l => l.status === 'active' },
    { key: 'paused', label: 'Paused', test: l => l.status === 'paused' },
    { key: 'closed', label: 'Closed', test: l => l.status === 'closed' },
    { key: 'hq', label: 'HQ', test: l => l.headquarters }
  ]

</script>

<PageHead title="Locations" lede="Workspace venues — branding, accounting tenant, and lifecycle.">
  {#if can('locations', 'create')}
    <Button size="sm" onclick={() => { showCreate = !showCreate }}>
      {showCreate ? 'Cancel' : '+ Add Location'}
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
        <Field name="name" label="Name" required />
        <Field name="slug" label="Slug" required />
        <Field name="short_name" label="Short Name" />
        <Field name="city" label="City" />
      </FieldGrid>
      {#snippet actions()}
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Create Location'}</Button>
      {/snippet}
    </FormCard>
  </div>
{/if}

<DataTable
  data={data.locations as Location[]}
  {columns}
  {filters}
  table="locations"
  title="Locations"
  lede="Workspace venues — branding, accounting tenant, and lifecycle."
  searchFields={['name', 'slug', 'short_name', 'city', 'suburb']}
  searchPlaceholder="Search name, slug, city…"
  csvFilename="locations"
  empty="No locations yet."
  timesToggle
  onRowClick={(l) => goto(`/locations/${l.id}?tab=properties`)}
>
  {#snippet row(location, ctx)}
    <td class="name-cell">
      <Copyable value={location.name}>
        <span class="name">{location.name}</span>
        {#if location.headquarters}<span class="hq-dot" title="Headquarters"></span>{/if}
      </Copyable>
      <div class="slug">{location.slug}</div>
    </td>
    <td class="muted hide-md">{location.city ?? '—'}</td>
    <td class="muted hide-md">
      {location.community_manager
        ? `${location.community_manager.first_name} ${location.community_manager.last_name}`
        : '—'}
    </td>
    <td class="mono hide-sm">{location.currency ?? '—'}</td>
    <td>
      <Badge tone={statusTone(location.status)}>{location.status}</Badge>
    </td>
    <td class="date hide-sm">
      <div>{new Date(location.created_at).toLocaleDateString()}</div>
      {#if ctx.showTimes}
        <div class="date-time">{new Date(location.created_at).toLocaleTimeString()}</div>
      {/if}
    </td>
  {/snippet}
  {#snippet pageActions()}
    {#if can('locations', 'create')}
      <Button size="sm" onclick={() => { showCreate = !showCreate }}>
        {showCreate ? 'Cancel' : '+ Add Location'}
      </Button>
    {/if}
  {/snippet}
  {#snippet actions(location)}
    {#if can('locations', 'update')}
      <Button variant="ghost" size="sm" onclick={() => editing = location}>Edit</Button>
    {/if}
    {#if can('locations', 'delete')}
      <SubmitButton
        action="?/delete"
        label="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
        fields={{ id: location.id }}
        confirm={{
          title: 'Delete location?',
          message: `Permanently delete ${location.name}? This cannot be undone.`,
          variant: 'danger'
        }}
      />
    {/if}
  {/snippet}
</DataTable>

<Drawer open={!!editing} title="Edit Location" formId="edit-form" width="640px" onClose={() => editing = null}>
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
        <Field name="name" label="Name" value={editing.name} required />
        <Field name="slug" label="Slug" value={editing.slug} required />
        <Field name="short_name" label="Short Name" value={editing.short_name ?? ''} />
        <Field label="Legal Entity">
          <Select
            name="legal_entity_id"
            value={editing.legal_entity_id ?? ''}
            placeholder="None"
            options={[{ value: '', label: 'None' }, ...data.legalEntities.map((e: any) => ({ value: e.id, label: e.name }))]}
          />
        </Field>
      </FieldGrid>
      <FieldGrid cols={1}>
        <Field name="description" label="Description" value={editing.description ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Address</h3>
      <FieldGrid cols={2}>
        <Field name="address_line_1" label="Address Line 1" value={editing.address_line_1 ?? ''} />
        <Field name="address_line_2" label="Address Line 2" value={editing.address_line_2 ?? ''} />
        <Field name="suburb" label="Suburb" value={editing.suburb ?? ''} />
        <Field name="city" label="City" value={editing.city ?? ''} />
        <Field name="postal_code" label="Postal Code" value={editing.postal_code ?? ''} />
        <Field name="country_code" label="Country Code" value={editing.country_code ?? ''} placeholder="e.g. ZA" />
        <Field name="latitude" label="Latitude" value={editing.latitude != null ? String(editing.latitude) : ''} />
        <Field name="longitude" label="Longitude" value={editing.longitude != null ? String(editing.longitude) : ''} />
        <Field label="Timezone">
          <Select
            name="timezone"
            value={editing.timezone ?? 'Africa/Johannesburg'}
            options={timezoneOptions}
          />
        </Field>
      </FieldGrid>

      <h3 class="section-title">Contact</h3>
      <FieldGrid cols={2}>
        <Field name="email" label="Email" type="email" value={editing.email ?? ''} />
        <Field name="phone" label="Phone" value={editing.phone ?? ''} />
        <Field name="website" label="Website" value={editing.website ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Branding</h3>
      <FieldGrid cols={2}>
        <Field name="logo_url" label="Logo URL" value={editing.logo_url ?? ''} />
        <Field name="hero_image_url" label="Hero Image URL" value={editing.hero_image_url ?? ''} />
        <Field name="map_image_url" label="Map Image URL" value={editing.map_image_url ?? ''} />
        <Field name="map_link" label="Map Link" value={editing.map_link ?? ''} />
        <Field name="background_colour" label="Background Colour" value={editing.background_colour ?? ''} placeholder="#hex or css" />
      </FieldGrid>

      <h3 class="section-title">Operations</h3>
      <FieldGrid cols={2}>
        <Field label="Community Manager">
          <Select
            name="community_manager_person_id"
            value={editing.community_manager_person_id ?? ''}
            placeholder="None"
            options={[{ value: '', label: 'None' }, ...data.persons.map((p: any) => ({ value: p.id, label: `${p.first_name} ${p.last_name}` }))]}
          />
        </Field>
        <Field name="banking_account_number" label="Banking Account #" value={editing.banking_account_number ?? ''} />
        <Field name="banking_bank_code" label="Bank Code" value={editing.banking_bank_code ?? ''} />
      </FieldGrid>
      <FieldGrid cols={1}>
        <Field name="access_instructions" label="Access Instructions" value={editing.access_instructions ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Accounting</h3>
      <FieldGrid cols={2}>
        <Field
          name="accounting_external_tenant_id"
          label="Accounting External Tenant ID"
          value={editing.accounting_external_tenant_id ?? ''}
          placeholder="e.g. Xero tenant id"
        />
        <Field name="accounting_gl_code" label="GL Code" value={editing.accounting_gl_code ?? ''} />
        <Field name="accounting_item_code" label="Item Code" value={editing.accounting_item_code ?? ''} />
        <Field name="accounting_tax_code" label="Tax Code" value={editing.accounting_tax_code ?? ''} />
        <Field name="accounting_tracking_code" label="Tracking Code" value={editing.accounting_tracking_code ?? ''} />
        <Field name="accounting_tracking_name" label="Tracking Name" value={editing.accounting_tracking_name ?? ''} />
        <Field name="accounting_stationery_id" label="Stationery ID" value={editing.accounting_stationery_id ?? ''} />
        <Field name="accounting_branding_theme" label="Branding Theme" value={editing.accounting_branding_theme ?? ''} />
        <Field name="accounting_tax_type" label="Tax Type" value={editing.accounting_tax_type ?? ''} />
      </FieldGrid>

      <h3 class="section-title">Commercial</h3>
      <FieldGrid cols={2}>
        <Field label="Currency">
          <Select
            name="currency"
            value={editing.currency ?? 'ZAR'}
            options={currencyOptions}
          />
        </Field>
        <Field label="Area Unit">
          <Select
            name="area_unit"
            value={editing.area_unit ?? 'sqm'}
            options={areaUnitOptions}
          />
        </Field>
        <Field name="commercial_tax_percentage" label="Tax %" value={editing.commercial_tax_percentage != null ? String(editing.commercial_tax_percentage) : ''} />
        <Field name="commercial_app_discount_percentage" label="App Discount %" value={editing.commercial_app_discount_percentage != null ? String(editing.commercial_app_discount_percentage) : ''} />
        <Field label="Billing Date Pattern">
          <Select
            name="billing_date_pattern"
            value={editing.billing_date_pattern ?? 'advance_dated'}
            options={billingDatePatternOptions}
          />
        </Field>
      </FieldGrid>

      <h3 class="section-title">Lifecycle</h3>
      <FieldGrid cols={2}>
        <Field label="Status">
          <Select
            name="status"
            value={editing.status ?? 'active'}
            options={statusOptions}
          />
        </Field>
        <label class="checkbox-field">
          <input type="checkbox" name="headquarters" checked={editing.headquarters} />
          <span>Headquarters</span>
        </label>
        <Field name="started_at" label="Started" type="date" value={toDateInput(editing.started_at)} />
        <Field name="closed_at" label="Closed" type="date" value={toDateInput(editing.closed_at)} />
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
  .slug {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .hq-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 6px;
    border-radius: 999px;
    background: var(--accent);
    vertical-align: middle;
  }
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
