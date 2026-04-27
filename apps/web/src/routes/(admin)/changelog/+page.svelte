<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/stores'
  import { tick } from 'svelte'
  import {
    PageHead,
    Toast,
    Badge,
    DataTable,
    SubmitButton,
    ErrorBanner
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'

  type Entry = {
    id: string
    table_name: string
    record_id: string
    action: 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE'
    changed_by: string | null
    changed_by_email: string
    record_label: string
    old_values: Record<string, any> | null
    new_values: Record<string, any> | null
    created_at: string
  }

  type BulkAction = {
    id: string
    action: string
    performed_by: string | null
    performed_by_email: string
    performed_at: string
    params: Record<string, any>
    affected_count: number
    notes: string | null
    undone_at: string | null
    undone_by: string | null
    undone_by_email: string | null
  }

  let { data, form } = $props()
  let entries = $state<Entry[]>(data.entries as Entry[])
  let expandedId = $state<string | null>(null)
  let undoingId = $state<string | null>(null)
  let undoError = $state<string | null>(null)
  let activeTab = $state<'single' | 'bulk'>('single')

  // Deep-link: /changelog?entry=<id> auto-expands that entry and scrolls
  // to it. Powers "Open in change log" links from <RecordHistory />.
  $effect(() => {
    const targetId = $page.url.searchParams.get('entry')
    if (!targetId) return
    if (!entries.some(e => e.id === targetId)) return
    activeTab = 'single'
    expandedId = targetId
    tick().then(() => {
      document.getElementById(`entry-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  })

  const emailByUserId = new Map<string, string>()
  for (const e of data.entries as Entry[]) {
    if (e.changed_by && e.changed_by_email && e.changed_by !== e.changed_by_email) {
      emailByUserId.set(e.changed_by, e.changed_by_email)
    }
  }

  // Mirrors labelFor() in change-log.service.ts. The realtime payload
  // already carries new_values / old_values, so we can compute the same
  // label client-side — no extra fetch.
  function labelFor(vals: Record<string, any> | null, recordId: string | null): string {
    if (!vals) return recordId?.slice(0, 8) ?? '—'
    if (vals.name) return vals.name
    if (vals.first_name || vals.last_name) return `${vals.first_name ?? ''} ${vals.last_name ?? ''}`.trim()
    if (vals.email) return vals.email
    return recordId?.slice(0, 8) ?? '—'
  }

  function onRealtimeInsert(raw: any) {
    const userId = raw.changed_by ?? null
    const newVals = raw.new_values ?? null
    const oldVals = raw.old_values ?? null
    const entry: Entry = {
      id: raw.id,
      table_name: raw.table_name,
      record_id: raw.record_id,
      action: raw.action,
      changed_by: userId,
      changed_by_email: userId ? (emailByUserId.get(userId) ?? userId) : 'system',
      record_label: labelFor(newVals ?? oldVals, raw.record_id),
      old_values: oldVals,
      new_values: newVals,
      created_at: raw.created_at
    }
    entries = [entry, ...entries].slice(0, 1000)
  }

  async function undoBulk(id: string) {
    if (undoingId) return
    undoingId = id
    undoError = null
    try {
      const res = await fetch('/api/admin/bulk-undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk_action_id: id })
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `HTTP ${res.status}`)
      }
      await invalidateAll()
    } catch (e: any) {
      undoError = e?.message ?? String(e)
    } finally {
      undoingId = null
    }
  }

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const actionTone: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'default'> = {
    INSERT: 'success',
    UPDATE: 'info',
    DELETE: 'danger',
    RESTORE: 'warning'
  }

  function getChangedFields(entry: Entry) {
    if (!entry.old_values || !entry.new_values) return []
    const fields: { field: string; old: string; new: string }[] = []
    for (const key of Object.keys(entry.new_values)) {
      if (['id', 'created_at', 'updated_at'].includes(key)) continue
      const oldVal = String(entry.old_values[key] ?? '')
      const newVal = String(entry.new_values[key] ?? '')
      if (oldVal !== newVal) fields.push({ field: key, old: oldVal, new: newVal })
    }
    return fields
  }

  function formatTimeMs(iso: string): string {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${ms}`
  }

  function nonEmptyEntries(values: Record<string, any> | null) {
    if (!values) return []
    return Object.entries(values).filter(
      ([k, v]) => v != null && v !== '' && !['id', 'created_at', 'updated_at'].includes(k)
    )
  }

  const columns: Column<Entry>[] = [
    { key: 'action', label: 'Action', sortable: true, width: '8%' },
    { key: 'record_label', label: 'Record', sortable: true, width: '26%' },
    { key: 'table_name', label: 'Table', sortable: true, width: '12%' },
    { key: 'changed_by_email', label: 'Changed By', sortable: true, width: '30%', muted: true },
    { key: 'created_at', label: 'When', sortable: true, width: '18%', date: true }
  ]

  const filters: Filter<Entry>[] = [
    { key: 'all', label: 'All' },
    { key: 'insert', label: 'Insert', test: e => e.action === 'INSERT' },
    { key: 'update', label: 'Update', test: e => e.action === 'UPDATE' },
    { key: 'delete', label: 'Delete', test: e => e.action === 'DELETE' },
    { key: 'restore', label: 'Restore', test: e => e.action === 'RESTORE' }
  ]

  const bulkColumns: Column<BulkAction>[] = [
    { key: 'action', label: 'Action', sortable: true, width: '16%' },
    { key: 'params', label: 'Params', width: '22%', muted: true, mono: true, ellipsis: true, get: b => JSON.stringify(b.params) },
    { key: 'affected_count', label: 'Affected', sortable: true, width: '8%', mono: true, align: 'right' },
    { key: 'performed_by_email', label: 'By', sortable: true, width: '18%', muted: true, ellipsis: true },
    { key: 'performed_at', label: 'When', sortable: true, width: '12%', date: true },
    { key: 'undone_at', label: 'Status', width: '14%', sortable: true, get: b => b.undone_at ? 'Undone' : 'Applied' }
  ]

  const bulkFilters: Filter<BulkAction>[] = [
    { key: 'all', label: 'All' },
    { key: 'applied', label: 'Applied', test: b => !b.undone_at },
    { key: 'undone', label: 'Undone', test: b => !!b.undone_at }
  ]
</script>

<PageHead title="Change Log" lede="Every database change, with who and when. Click a row to inspect field-by-field." />

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}
{#if undoError}
  <ErrorBanner error={undoError} onDismiss={() => (undoError = null)} />
{/if}

<div class="tabs-bar" role="tablist">
  <button type="button" role="tab" class="tab" class:active={activeTab === 'single'} aria-selected={activeTab === 'single'} onclick={() => (activeTab = 'single')}>
    Single records
    <span class="tab-count">{entries.length}</span>
  </button>
  <button type="button" role="tab" class="tab" class:active={activeTab === 'bulk'} aria-selected={activeTab === 'bulk'} onclick={() => (activeTab = 'bulk')}>
    Bulk actions
    <span class="tab-count">{data.bulkActions?.length ?? 0}</span>
  </button>
</div>

{#if activeTab === 'bulk'}
  <DataTable
    data={data.bulkActions as BulkAction[]}
    columns={bulkColumns}
    filters={bulkFilters}
    table="changelog_bulk"
    title="Bulk actions"
    lede="Multi-record operations grouped as one user action — undo restores every affected row in one go."
    searchFields={['action', 'performed_by_email']}
    searchPlaceholder="Search action, user…"
    csvFilename="bulk-actions"
    empty="No bulk actions recorded yet."
    actionsLabel=""
  >
    {#snippet row(b)}
      <td><span class="table-chip">{b.action}</span></td>
      <td class="muted mono ellipsis params-cell" title={JSON.stringify(b.params)}>{JSON.stringify(b.params)}</td>
      <td class="mono align-right">{b.affected_count}</td>
      <td class="muted mono ellipsis">{b.performed_by_email}</td>
      <td class="date">
        <div>{new Date(b.performed_at).toLocaleDateString()}</div>
        <div class="date-time">{formatTimeMs(b.performed_at)}</div>
      </td>
      <td>
        {#if b.undone_at}
          <Badge tone="warning">Undone</Badge>
          <div class="muted small" style="margin-top:2px">by {b.undone_by_email} · {formatTimeMs(b.undone_at)}</div>
        {:else}
          <Badge tone="success">Applied</Badge>
        {/if}
      </td>
    {/snippet}
    {#snippet actions(b)}
      {#if !b.undone_at && can('bulk_actions', 'undo')}
        <button type="button" class="undo-btn" onclick={() => undoBulk(b.id)} disabled={undoingId === b.id}>
          {undoingId === b.id ? 'Undoing…' : 'Undo'}
        </button>
      {/if}
    {/snippet}
  </DataTable>
{/if}

{#if activeTab === 'single'}
<DataTable
  data={entries}
  realtimeTable="change_log"
  {onRealtimeInsert}
  {columns}
  {filters}
  table="changelog"
  title="Change Log"
  lede="Every database change, with who and when."
  searchFields={['record_label', 'table_name', 'action', 'changed_by_email']}
  searchPlaceholder="Search record, table, user…"
  csvFilename="change-log"
  empty="No changes recorded yet."
  isExpandedRow={(e) => e.id === expandedId}
  isActiveRow={(e) => e.id === expandedId}
  onActivate={(e) => expandedId = expandedId === e.id ? null : e.id}
  onRowClick={(e) => expandedId = expandedId === e.id ? null : e.id}
>
  {#snippet row(entry)}
    <td id="entry-{entry.id}"><Badge tone={actionTone[entry.action] ?? 'default'}>{entry.action}</Badge></td>
    <td class="record-label">{entry.record_label}</td>
    <td><span class="table-chip">{entry.table_name}</span></td>
    <td class="muted mono">{entry.changed_by_email}</td>
    <td class="date">
      <div>{new Date(entry.created_at).toLocaleDateString()}</div>
      <div class="date-time">{formatTimeMs(entry.created_at)}</div>
    </td>
  {/snippet}

  {#snippet expanded(entry)}
    <div class="exp">
      {#if entry.action === 'UPDATE'}
        {@const fields = getChangedFields(entry)}
        {#if fields.length}
          <div class="field-list">
            {#each fields as f}
              <div class="field-row">
                <span class="field-name">{f.field}</span>
                <span class="old-val">{f.old || '(empty)'}</span>
                <span class="arrow">→</span>
                <span class="new-val">{f.new || '(empty)'}</span>
              </div>
            {/each}
          </div>
          {#if can('audit_log', 'manage') && entry.old_values}
            <div class="restore-action">
              <SubmitButton
                action="?/restore"
                label="Restore to this version"
                pendingLabel="Restoring…"
                variant="secondary"
                size="sm"
                fields={{
                  table_name: entry.table_name,
                  record_id: entry.record_id,
                  old_values: JSON.stringify(entry.old_values)
                }}
                confirm={{
                  title: 'Restore record?',
                  message: `Restore this ${entry.table_name} record to its previous state?`
                }}
              />
            </div>
          {/if}
        {:else}
          <p class="muted">No field changes recorded.</p>
        {/if}
      {:else if entry.action === 'RESTORE'}
        {@const fields = getChangedFields(entry)}
        <p class="restore-note">↩ Reverted to an earlier version. Fields rolled back:</p>
        {#if fields.length}
          <div class="field-list">
            {#each fields as f}
              <div class="field-row">
                <span class="field-name">{f.field}</span>
                <span class="old-val">{f.old || '(empty)'}</span>
                <span class="arrow">↩</span>
                <span class="restored-val">{f.new || '(empty)'}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted">No fields differed from current state.</p>
        {/if}
      {:else if entry.action === 'INSERT'}
        <div class="field-list">
          {#each nonEmptyEntries(entry.new_values) as [key, val]}
            <div class="field-row">
              <span class="field-name">{key}</span>
              <span class="new-val">{val}</span>
            </div>
          {/each}
        </div>
      {:else if entry.action === 'DELETE'}
        <p class="delete-note">Deleted: <strong>{entry.record_label}</strong></p>
        <div class="field-list">
          {#each nonEmptyEntries(entry.old_values) as [key, val]}
            <div class="field-row">
              <span class="field-name">{key}</span>
              <span class="old-val">{val}</span>
            </div>
          {/each}
        </div>
        {#if can('audit_log', 'manage') && entry.old_values}
          <div class="restore-action">
            <SubmitButton
              action="?/restore"
              label="Restore deleted record"
              pendingLabel="Restoring…"
              variant="secondary"
              size="sm"
              fields={{
                table_name: entry.table_name,
                record_id: entry.record_id,
                old_values: JSON.stringify(entry.old_values)
              }}
              confirm={{
                title: 'Restore record?',
                message: `Recreate this ${entry.table_name} record from the snapshot taken when it was deleted?`
              }}
            />
          </div>
        {/if}
      {/if}
    </div>
  {/snippet}
</DataTable>
{/if}

<style>
  .record-label { font-weight: var(--weight-medium); color: var(--text); }
  .table-chip {
    font-size: var(--text-xs);
    background: var(--surface-sunk, var(--surface-hover));
    color: var(--text-muted);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
  }
  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }

  .exp {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .field-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .field-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
  .field-name {
    font-weight: var(--weight-medium);
    color: var(--text-muted);
    min-width: 140px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }
  .old-val {
    color: var(--danger);
    text-decoration: line-through;
  }
  .new-val { color: var(--success); }
  .restored-val { color: var(--warning); font-weight: var(--weight-medium); }
  .arrow { color: var(--text-muted); }
  .restore-note {
    font-size: var(--text-sm);
    color: var(--warning);
    margin: 0 0 var(--space-2);
    font-weight: var(--weight-medium);
  }
  .delete-note {
    font-size: var(--text-sm);
    color: var(--danger);
    margin: 0;
  }
  .restore-action { margin-top: var(--space-2); }
  .muted { color: var(--text-muted); font-size: var(--text-sm); margin: 0; }

  .tabs-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    margin-bottom: -1px;
  }
  .tab:hover { color: var(--text); }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .tab-count {
    display: inline-flex;
    padding: 1px 8px;
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    color: var(--text-muted);
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
  }
  .tab.active .tab-count {
    background: var(--accent);
    color: white;
  }
  .empty-note { padding: 18px 0; text-align: center; }

  .params-cell { font-size: var(--text-xs); }
  .align-right { text-align: right; }
  .undo-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .undo-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
  .undo-btn:disabled { opacity: 0.6; cursor: wait; }
  .small { font-size: var(--text-xs); }

  @media (max-width: 640px) {
    .field-row {
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      padding: 4px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
    }
    .field-row:last-child { border-bottom: none; }
    .field-name { min-width: 0; }
    .arrow { display: none; }
    .old-val, .new-val, .restored-val { word-break: break-word; }
    .tab { padding: 10px 10px; }
  }
</style>
