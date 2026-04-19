<script lang="ts">
  import { permStore, canDo } from '$lib/stores/permissions'

  let { data, form } = $props()
  let expandedId = $state<string | null>(null)
  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })

  permStore.subscribe(v => { perms = v })

  function can(resource: string, action: string = 'read') {
    return canDo(perms, resource, action)
  }

  const actionColors: Record<string, string> = {
    INSERT: 'action-insert',
    UPDATE: 'action-update',
    DELETE: 'action-delete',
    RESTORE: 'action-restore'
  }

  function getLabel(entry: any): string {
    const vals = entry.new_values || entry.old_values
    return vals?.name || vals?.first_name && `${vals.first_name} ${vals.last_name}` || vals?.email || entry.record_id?.slice(0, 8) || '—'
  }

  function getChangedFields(entry: any): Array<{ field: string; old: string; new: string }> {
    if (!entry.old_values || !entry.new_values) return []
    const fields: Array<{ field: string; old: string; new: string }> = []
    for (const key of Object.keys(entry.new_values)) {
      if (['id', 'created_at', 'updated_at'].includes(key)) continue
      const oldVal = String(entry.old_values[key] ?? '')
      const newVal = String(entry.new_values[key] ?? '')
      if (oldVal !== newVal) {
        fields.push({ field: key, old: oldVal, new: newVal })
      }
    }
    return fields
  }

  function timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return new Date(date).toLocaleDateString()
  }
</script>

<div class="container">
  <header>
    <div>
      <h1>Change Log</h1>
      <p class="subtitle">{data.total} total change{data.total !== 1 ? 's' : ''}</p>
    </div>
  </header>

  {#if form?.error}
    <div class="error">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="success">{form.message}</div>
  {/if}

  <div class="filters">
    <form method="GET" class="filter-form">
      <select name="table" onchange={(e) => e.currentTarget.form?.submit()}>
        <option value="">All tables</option>
        {#each data.tables as t}
          <option value={t} selected={data.filterTable === t}>{t}</option>
        {/each}
      </select>
      <select name="action" onchange={(e) => e.currentTarget.form?.submit()}>
        <option value="">All actions</option>
        {#each data.actions as a}
          <option value={a} selected={data.filterAction === a}>{a}</option>
        {/each}
      </select>
      {#if data.filterTable || data.filterAction}
        <a href="/changelog" class="clear-link">Clear</a>
      {/if}
    </form>
  </div>

  <table>
    <thead>
      <tr>
        <th>Action</th>
        <th>Record</th>
        <th>Table</th>
        <th>Changed By</th>
        <th>When</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each data.entries as entry (entry.id)}
        <tr class="entry-row" onclick={() => expandedId = expandedId === entry.id ? null : entry.id}>
          <td><span class="action-badge {actionColors[entry.action] ?? ''}">{entry.action}</span></td>
          <td class="record-label">{getLabel(entry)}</td>
          <td><span class="table-badge">{entry.table_name}</span></td>
          <td class="changed-by">{entry.changed_by_email ?? 'system'}</td>
          <td class="time" title={new Date(entry.created_at).toLocaleString()}>{timeAgo(entry.created_at)}</td>
          <td class="expand-icon">{expandedId === entry.id ? '▾' : '▸'}</td>
        </tr>
        {#if expandedId === entry.id}
          <tr>
            <td colspan="6" class="detail-cell">
              {#if entry.action === 'UPDATE' || entry.action === 'RESTORE'}
                {@const fields = getChangedFields(entry)}
                {#if fields.length > 0}
                  <div class="field-changes">
                    {#each fields as f}
                      <div class="field-row">
                        <span class="field-name">{f.field}</span>
                        <span class="old-val">{f.old || '(empty)'}</span>
                        <span class="arrow">&rarr;</span>
                        <span class="new-val">{f.new || '(empty)'}</span>
                      </div>
                    {/each}
                  </div>
                  {#if can('audit_log', 'manage') && entry.action === 'UPDATE' && entry.old_values}
                    <form method="POST" action="?/restore" style="margin-top: 0.75rem">
                      <input type="hidden" name="table_name" value={entry.table_name} />
                      <input type="hidden" name="record_id" value={entry.record_id} />
                      <input type="hidden" name="old_values" value={JSON.stringify(entry.old_values)} />
                      <button type="submit" class="restore-btn"
                        onclick={(e) => { if (!confirm('Restore this record to its previous state?')) e.preventDefault() }}>
                        Restore to this version
                      </button>
                    </form>
                  {/if}
                {:else}
                  <p class="muted">No field changes recorded</p>
                {/if}
              {:else if entry.action === 'INSERT'}
                <div class="field-changes">
                  {#each Object.entries(entry.new_values || {}).filter(([k, v]) => v && !['id', 'created_at', 'updated_at'].includes(k)) as [key, val]}
                    <div class="field-row">
                      <span class="field-name">{key}</span>
                      <span class="new-val">{val}</span>
                    </div>
                  {/each}
                </div>
              {:else if entry.action === 'DELETE'}
                <p class="delete-label">Deleted: {getLabel(entry)}</p>
                <div class="field-changes">
                  {#each Object.entries(entry.old_values || {}).filter(([k, v]) => v && !['id', 'created_at', 'updated_at'].includes(k)) as [key, val]}
                    <div class="field-row">
                      <span class="field-name">{key}</span>
                      <span class="old-val">{val}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </td>
          </tr>
        {/if}
      {:else}
        <tr><td colspan="6" class="empty">No changes recorded yet</td></tr>
      {/each}
    </tbody>
  </table>

  {#if data.total > data.pageSize}
    <div class="pagination">
      <span>Page {data.page + 1} of {Math.ceil(data.total / data.pageSize)}</span>
      <div class="page-btns">
        {#if data.page > 0}
          <a href="/changelog?page={data.page - 1}&table={data.filterTable}&action={data.filterAction}" class="page-btn">Prev</a>
        {/if}
        {#if (data.page + 1) * data.pageSize < data.total}
          <a href="/changelog?page={data.page + 1}&table={data.filterTable}&action={data.filterAction}" class="page-btn">Next</a>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .container { max-width: 1100px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
  header { margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; font-weight: 600; color: #0a1f0f; margin: 0; }
  .subtitle { font-size: 0.85rem; color: #5a7060; margin: 0.25rem 0 0; }
  .error { background: #fdecea; color: #c0392b; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .success { background: #e8f5ea; color: #2d6a35; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .filters { margin-bottom: 1rem; }
  .filter-form { display: flex; gap: 0.5rem; align-items: center; }
  .filter-form select { padding: 0.4rem 0.75rem; border: 1px solid #c8deca; border-radius: 4px; font-size: 0.85rem; background: white; }
  .clear-link { font-size: 0.8rem; color: #5a7060; text-decoration: none; }
  .clear-link:hover { color: #c0392b; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 0.75rem; border-bottom: 2px solid #c8deca; font-size: 0.8rem; color: #5a7060; text-transform: uppercase; letter-spacing: 0.5px; }
  .entry-row { cursor: pointer; }
  .entry-row:hover { background: #f7f4ee; }
  td { padding: 0.75rem; border-bottom: 1px solid #e8f5ea; font-size: 0.9rem; }
  .action-badge { font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 3px; text-transform: uppercase; }
  .action-insert { background: #e8f5ea; color: #2d6a35; }
  .action-update { background: #e8f0fd; color: #3a5fc8; }
  .action-delete { background: #fdecea; color: #c0392b; }
  .action-restore { background: #fdf3e3; color: #c8832a; }
  .record-label { font-weight: 500; color: #0a1f0f; }
  .table-badge { font-size: 0.75rem; background: #f7f4ee; color: #5a7060; padding: 2px 6px; border-radius: 3px; }
  .time { font-size: 0.8rem; color: #5a7060; }
  .expand-icon { color: #5a7060; font-size: 0.8rem; width: 1rem; }
  .detail-cell { background: #fafcfa; padding: 1rem; }
  .field-changes { display: flex; flex-direction: column; gap: 4px; }
  .field-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; }
  .field-name { font-weight: 500; color: #5a7060; min-width: 120px; }
  .old-val { color: #c0392b; text-decoration: line-through; }
  .new-val { color: #2d6a35; }
  .arrow { color: #5a7060; }
  .delete-label { font-size: 0.85rem; color: #c0392b; margin: 0 0 0.5rem; }
  .restore-btn { background: #c8832a; color: white; border: none; padding: 0.4rem 0.75rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer; }
  .restore-btn:hover { background: #a06b1f; }
  .muted { font-size: 0.8rem; color: #5a7060; }
  .empty { text-align: center; color: #5a7060; padding: 2rem; }
  .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; font-size: 0.85rem; color: #5a7060; }
  .page-btns { display: flex; gap: 0.5rem; }
  .page-btn { padding: 0.4rem 0.75rem; border: 1px solid #c8deca; border-radius: 4px; text-decoration: none; color: #0a1f0f; font-size: 0.85rem; }
  .page-btn:hover { background: #e8f5ea; }
</style>
