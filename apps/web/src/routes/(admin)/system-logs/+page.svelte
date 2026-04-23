<script lang="ts">
  import { PageHead, Badge, KpiCard, DataTable } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'

  type Entry = {
    id: string
    level: 'success' | 'info' | 'warning' | 'error'
    category: string
    message: string
    created_by: string | null
    created_by_email: string
    details: Record<string, any> | null
    created_at: string
  }

  let { data } = $props()
  let entries = $state<Entry[]>(data.entries as Entry[])
  let counts = $state({ ...data.counts })
  let expandedId = $state<string | null>(null)

  // Build a user-id → email map from initial data so realtime rows (which
  // only carry the UUID) can render a friendly email when the sender is
  // someone we've already seen. Falls back to UUID otherwise.
  const emailByUserId = new Map<string, string>()
  for (const e of data.entries as Entry[]) {
    if (e.created_by && e.created_by_email && e.created_by !== e.created_by_email) {
      emailByUserId.set(e.created_by, e.created_by_email)
    }
  }

  function onRealtimeInsert(raw: any) {
    const userId = raw.created_by ?? null
    const entry: Entry = {
      id: raw.id,
      level: raw.level,
      category: raw.category,
      message: raw.message,
      created_by: userId,
      created_by_email: userId ? (emailByUserId.get(userId) ?? userId) : 'system',
      details: raw.details ?? null,
      created_at: raw.created_at
    }
    entries = [entry, ...entries].slice(0, 1000)
    counts = {
      ...counts,
      total: (counts.total ?? 0) + 1,
      [entry.category]: (counts[entry.category as keyof typeof counts] ?? 0) + 1,
      ...(entry.level === 'warning' ? { warning: (counts.warning ?? 0) + 1 } : {}),
      ...(entry.level === 'error'   ? { error:   (counts.error   ?? 0) + 1 } : {})
    }
  }

  const levelTone: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
    success: 'success',
    info: 'info',
    warning: 'warning',
    error: 'danger'
  }

  const sourceTone: Record<string, 'success' | 'info' | 'warning' | 'default'> = {
    trigger: 'info',
    mailgun: 'warning',
    supabase: 'info',
    app: 'success'
  }

  function statusTone(status: string): 'success' | 'info' | 'danger' | 'default' {
    if (status === 'delivered') return 'success'
    if (status === 'accepted' || status === 'triggered') return 'info'
    if (status === 'failed' || status === 'bounced' || status === 'rejected') return 'danger'
    return 'default'
  }

  function formatTimeMs(iso: string): string {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }

  const columns: Column<Entry>[] = [
    { key: 'level', label: 'Level', sortable: true, width: '8%' },
    { key: 'category', label: 'Category', sortable: true, width: '10%' },
    { key: 'message', label: 'Message', width: '42%' },
    { key: 'created_by_email', label: 'User', sortable: true, width: '18%', muted: true },
    { key: 'created_at', label: 'When', sortable: true, width: '14%', date: true }
  ]

  const filters: Filter<Entry>[] = [
    { key: 'all', label: 'All' },
    { key: 'errors', label: 'Errors', test: e => e.level === 'error' },
    { key: 'warnings', label: 'Warnings', test: e => e.level === 'warning' },
    { key: 'info', label: 'Info', test: e => e.level === 'info' },
    { key: 'success', label: 'Success', test: e => e.level === 'success' }
  ]
</script>

<PageHead title="System Logs" lede="Every side-effect: emails sent, auth events, background jobs. Click a row for details." />

<div class="kpis">
  <KpiCard label="Total" value={counts.total} />
  <KpiCard label="Email" value={counts.email} />
  <KpiCard label="Auth" value={counts.auth} />
  <KpiCard label="System" value={counts.system} />
  <KpiCard label="Warnings" value={counts.warning} tone="warning" />
  <KpiCard label="Errors" value={counts.error} tone="danger" />
</div>

<DataTable
  data={entries}
  {columns}
  {filters}
  table="system-logs"
  title="System Logs"
  lede="Every side-effect: emails sent, auth events, background jobs."
  searchFields={['message', 'category', 'level', 'created_by_email']}
  searchPlaceholder="Search message, category, user…"
  csvFilename="system-logs"
  empty="No system logs yet."
  realtimeTable="system_logs"
  {onRealtimeInsert}
  isExpandedRow={(e) => e.id === expandedId}
  isActiveRow={(e) => e.id === expandedId}
  onActivate={(e) => expandedId = expandedId === e.id ? null : e.id}
  onRowClick={(e) => expandedId = expandedId === e.id ? null : e.id}
>
  {#snippet row(entry)}
    <td><Badge tone={levelTone[entry.level] ?? 'default'}>{entry.level}</Badge></td>
    <td><span class="cat-chip">{entry.category}</span></td>
    <td>
      <div class="message-cell">
        {#if entry.details?.source}
          <Badge tone={sourceTone[entry.details.source] ?? 'default'}>{entry.details.source}</Badge>
        {/if}
        {#if entry.details?.via}
          <span class="via">via</span>
          <Badge tone={sourceTone[entry.details.via] ?? 'default'}>{entry.details.via}</Badge>
        {/if}
        {#if entry.details?.mailgun_status}
          <Badge tone={statusTone(entry.details.mailgun_status)}>{entry.details.mailgun_status}</Badge>
        {/if}
        {#if entry.details?.trigger_status}
          <Badge tone={statusTone(entry.details.trigger_status)}>{entry.details.trigger_status}</Badge>
        {/if}
        <span class="message">{entry.message}</span>
      </div>
    </td>
    <td class="muted mono">{entry.created_by_email}</td>
    <td class="date">
      <div>{new Date(entry.created_at).toLocaleDateString()}</div>
      <div class="date-time">{formatTimeMs(entry.created_at)}</div>
    </td>
  {/snippet}

  {#snippet expanded(entry)}
    <div class="details">
      {#if entry.details}
        {#each Object.entries(entry.details) as [key, val]}
          <div class="detail-row">
            <span class="detail-key">{key}</span>
            {#if typeof val === 'string' && val.startsWith('http')}
              <a href={val} target="_blank" rel="noopener" class="detail-link">{val}</a>
            {:else if key === 'mailgun_status' || key === 'trigger_status'}
              <Badge tone={statusTone(String(val))}>{val}</Badge>
            {:else}
              <span class="detail-val">{typeof val === 'object' ? JSON.stringify(val) : val}</span>
            {/if}
          </div>
        {/each}
      {:else}
        <p class="no-details">No additional details.</p>
      {/if}
    </div>
  {/snippet}
</DataTable>

<style>
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .cat-chip {
    font-size: var(--text-xs);
    background: var(--surface-sunk, var(--surface-hover));
    color: var(--text-muted);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .message-cell {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .message { color: var(--text); }
  .via { font-size: var(--text-xs); color: var(--text-muted); }

  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }

  .details {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .detail-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    font-size: var(--text-sm);
  }
  .detail-key {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    min-width: 140px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .detail-val {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    word-break: break-all;
  }
  .detail-link {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-decoration: underline;
    word-break: break-all;
  }
  .no-details {
    color: var(--text-muted);
    font-size: var(--text-sm);
    margin: 0;
  }
</style>
