<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
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
    Badge,
    ErrorBanner
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

  $effect(() => {
    if (form?.success) { showCreate = false }
  })

  // Deep-link: ?id=<location-id> redirects to the location detail page
  // (global search hook). Locations use detail pages with tabs, not drawers.
  $effect(() => {
    const urlId = $page.url.searchParams.get('id')
    if (!urlId) return
    const exists = (data.locations as Location[]).some(l => l.id === urlId)
    if (exists) goto(`/locations/${urlId}?tab=properties`, { replaceState: true })
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

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

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
      <a
        class="open-arrow"
        href={`/locations/${location.id}?tab=properties`}
        onclick={(e) => e.stopPropagation()}
        aria-label="Open location"
        title="Open location"
      >→</a>
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


<style>
  .create-wrap { margin-bottom: var(--space-6); }
  .name-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name { font-weight: var(--weight-medium); color: var(--text); }
  .open-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    color: var(--accent);
    font-size: 1.1rem;
    line-height: 1;
    text-decoration: none;
    transition: background 120ms ease, transform 120ms ease, color 120ms ease;
  }
  .open-arrow:hover {
    background: var(--accent-soft);
    color: var(--accent-hover, var(--accent));
    transform: translateX(2px);
  }
  .open-arrow:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
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
