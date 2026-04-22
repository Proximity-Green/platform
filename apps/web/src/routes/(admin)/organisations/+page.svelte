<script lang="ts">
  import { goto } from '$app/navigation'
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    PageHead,
    Toast,
    DataTable,
    Badge,
    Copyable
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'

  type Organisation = {
    id: string
    wsm_id: string | null
    name: string
    slug: string | null
    legal_name: string | null
    short_name: string | null
    industry: string | null
    type: string
    status: string
    email: string | null
    phone: string | null
    website: string | null
    billing_currency: string
    started_at: string | null
    created_at: string
  }

  let { data, form } = $props()

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  function statusTone(s: string): 'default' | 'success' | 'warning' | 'info' | 'danger' {
    if (s === 'active') return 'success'
    if (s === 'prospect') return 'info'
    if (s === 'paused') return 'warning'
    if (s === 'offboarded' || s === 'inactive') return 'danger'
    return 'default'
  }

  const columns: Column<Organisation>[] = [
    { key: 'name', label: 'Name', sortable: true, width: '26%' },
    { key: 'short_name', label: 'Short Name', sortable: true, width: '14%', muted: true, hideBelow: 'md' },
    { key: 'type', label: 'Type', sortable: true, width: '10%', hideBelow: 'sm' },
    { key: 'industry', label: 'Industry', sortable: true, width: '14%', muted: true, hideBelow: 'md' },
    { key: 'billing_currency', label: 'Currency', width: '8%', mono: true, hideBelow: 'sm' },
    { key: 'status', label: 'Status', sortable: true, width: '10%' },
    { key: 'created_at', label: 'Created', sortable: true, width: '12%', date: true, hideBelow: 'sm' }
  ]

  const filters: Filter<Organisation>[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active', test: o => o.status === 'active' },
    { key: 'prospect', label: 'Prospect', test: o => o.status === 'prospect' },
    { key: 'paused', label: 'Paused', test: o => o.status === 'paused' },
    { key: 'offboarded', label: 'Offboarded', test: o => o.status === 'offboarded' }
  ]
</script>

<PageHead title="Organisations" lede="Billing entities, legal structures, and commercial relationships." />

<Toast error={form?.error} success={form?.success} message={form?.message} />

<DataTable
  data={data.organisations as Organisation[]}
  {columns}
  {filters}
  table="organisations"
  title="Organisations"
  lede="Billing entities, legal structures, and commercial relationships."
  searchFields={['name', 'short_name', 'legal_name', 'slug', 'wsm_id', 'industry']}
  searchPlaceholder="Search name, industry, slug…"
  csvFilename="organisations"
  empty="No organisations yet."
  timesToggle
  onRowClick={(o) => goto(`/organisations/${o.id}?tab=properties`)}
>
  {#snippet row(org, ctx)}
    <td>
      <Copyable value={org.name}>
        <span class="name">{org.name}</span>
      </Copyable>
      {#if org.slug}<div class="slug">{org.slug}</div>{/if}
    </td>
    <td class="muted hide-md">{org.short_name ?? '—'}</td>
    <td class="hide-sm"><Badge tone="info">{org.type}</Badge></td>
    <td class="muted hide-md">{org.industry ?? '—'}</td>
    <td class="mono hide-sm">{org.billing_currency}</td>
    <td><Badge tone={statusTone(org.status)}>{org.status}</Badge></td>
    <td class="date hide-sm">
      <div>{new Date(org.created_at).toLocaleDateString()}</div>
      {#if ctx.showTimes}
        <div class="date-time">{new Date(org.created_at).toLocaleTimeString()}</div>
      {/if}
    </td>
  {/snippet}
</DataTable>


<style>
  .name { font-weight: var(--weight-medium); color: var(--text); }
  .slug {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }

  :global(td.muted) { color: var(--text-muted); }
  :global(td.mono) { font-family: var(--font-mono); }

  @media (max-width: 640px) { :global(.hide-sm) { display: none; } }
  @media (max-width: 900px) { :global(.hide-md) { display: none; } }
</style>
