<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    PageHead,
    Toast,
    Badge,
    DataTable,
    SubmitButton
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

  let { data, form } = $props()
  let expandedId = $state<string | null>(null)

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
</script>

<PageHead title="Change Log" lede="Every database change, with who and when. Click a row to inspect field-by-field." />

<Toast error={form?.error} success={form?.success} message={form?.message} />

<DataTable
  data={data.entries as Entry[]}
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
    <td><Badge tone={actionTone[entry.action] ?? 'default'}>{entry.action}</Badge></td>
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
      {/if}
    </div>
  {/snippet}
</DataTable>

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
</style>
