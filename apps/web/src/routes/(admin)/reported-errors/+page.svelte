<script lang="ts">
  import { enhance } from '$app/forms'
  import { permStore, canDo } from '$lib/stores/permissions'
  import {
    PageHead,
    Toast,
    Badge,
    DataTable,
    ErrorBanner
  } from '$lib/components/ui'
  import type { Column, Filter } from '$lib/components/ui/DataTable.svelte'

  type Status = 'open' | 'in_progress' | 'resolved' | 'wont_fix'
  type Report = {
    id: string
    code: string
    title: string
    detail: string | null
    raw: string | null
    url: string | null
    user_agent: string | null
    screenshot: string | null
    viewport_w: number | null
    viewport_h: number | null
    reported_by: string | null
    reported_by_email: string | null
    reported_at: string
    status: Status
    resolution_note: string | null
    resolved_by: string | null
    resolved_by_email: string | null
    resolved_at: string | null
  }

  let { data, form } = $props()
  let reports = $state<Report[]>(data.reports as Report[])
  let expandedId = $state<string | null>(null)
  let editingNoteId = $state<string | null>(null)

  // Re-sync the list whenever a form action returns success — keeps the
  // status pills in step with the DB without a full page reload.
  $effect(() => {
    if (form?.success) reports = data.reports as Report[]
  })

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  function can(resource: string, action: string = 'read') { return canDo(perms, resource, action) }

  const statusTone: Record<Status, 'default' | 'success' | 'warning' | 'info' | 'danger'> = {
    open: 'danger',
    in_progress: 'warning',
    resolved: 'success',
    wont_fix: 'default'
  }

  function statusLabel(s: Status): string {
    if (s === 'in_progress') return 'In progress'
    if (s === 'wont_fix') return "Won't fix"
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  function timeMs(iso: string): string {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }

  const columns: Column<Report>[] = [
    { key: 'status', label: 'Status', sortable: true, width: '10%' },
    { key: 'code', label: 'Code', sortable: true, width: '14%', mono: true },
    { key: 'title', label: 'Title', sortable: true, width: '30%' },
    { key: 'reported_by_email', label: 'Reported by', sortable: true, width: '20%', muted: true, ellipsis: true },
    { key: 'reported_at', label: 'When', sortable: true, width: '14%', date: true }
  ]

  const filters: Filter<Report>[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open', test: r => r.status === 'open' },
    { key: 'in_progress', label: 'In progress', test: r => r.status === 'in_progress' },
    { key: 'resolved', label: 'Resolved', test: r => r.status === 'resolved' },
    { key: 'wont_fix', label: "Won't fix", test: r => r.status === 'wont_fix' }
  ]

  const counts = $derived.by(() => {
    const c = { open: 0, in_progress: 0, resolved: 0, wont_fix: 0 }
    for (const r of reports) c[r.status]++
    return c
  })
</script>

<PageHead
  title="Reported errors"
  lede="User-submitted error reports from the in-app banner. Triage and resolve."
/>

<Toast success={form?.success} message={form?.success ? form?.message : undefined} />
{#if form?.error || (form as any)?.actionable}
  <ErrorBanner error={(form as any)?.actionable ?? form?.error} showRaw />
{/if}

<div class="counter-row">
  <span class="counter is-open">Open <strong>{counts.open}</strong></span>
  <span class="counter is-progress">In progress <strong>{counts.in_progress}</strong></span>
  <span class="counter is-resolved">Resolved <strong>{counts.resolved}</strong></span>
  <span class="counter is-wont">Won't fix <strong>{counts.wont_fix}</strong></span>
</div>

<DataTable
  data={reports}
  {columns}
  {filters}
  table="reported_errors"
  title="Reported errors"
  lede=""
  searchFields={['code', 'title', 'url', 'reported_by_email']}
  searchPlaceholder="Search code, title, URL, user…"
  csvFilename="reported-errors"
  empty="No errors reported yet."
  isExpandedRow={(r) => r.id === expandedId}
  isActiveRow={(r) => r.id === expandedId}
  onActivate={(r) => expandedId = expandedId === r.id ? null : r.id}
  onRowClick={(r) => expandedId = expandedId === r.id ? null : r.id}
>
  {#snippet row(r)}
    <td><Badge tone={statusTone[r.status]}>{statusLabel(r.status)}</Badge></td>
    <td class="mono">{r.code}</td>
    <td class="title-cell">{r.title}</td>
    <td class="muted ellipsis">{r.reported_by_email ?? '—'}</td>
    <td class="date">
      <div>{new Date(r.reported_at).toLocaleDateString()}</div>
      <div class="date-time">{timeMs(r.reported_at)}</div>
    </td>
  {/snippet}

  {#snippet expanded(r)}
    <div class="exp">
      {#if r.detail}<p class="detail">{r.detail}</p>{/if}

      <dl class="kv">
        <dt>URL</dt>
        <dd>{#if r.url}<a href={r.url} target="_blank" rel="noopener noreferrer">{r.url} ↗</a>{:else}<span class="muted">—</span>{/if}</dd>
        <dt>Reported by</dt>
        <dd>{r.reported_by_email ?? '(signed out)'}</dd>
        <dt>Reported at</dt>
        <dd class="mono">{new Date(r.reported_at).toLocaleString()}</dd>
        {#if r.user_agent}
          <dt>User agent</dt>
          <dd class="mono small">{r.user_agent}</dd>
        {/if}
      </dl>

      {#if r.screenshot}
        <details class="screenshot-block" open>
          <summary>Screenshot{r.viewport_w && r.viewport_h ? ` · ${r.viewport_w}×${r.viewport_h}` : ''}</summary>
          <a href={r.screenshot} target="_blank" rel="noopener noreferrer" title="Open full-size">
            <img src={r.screenshot} alt="Screenshot when error was reported" loading="lazy" />
          </a>
        </details>
      {/if}

      {#if r.raw}
        <details class="raw-block">
          <summary>Raw</summary>
          <pre>{r.raw}</pre>
        </details>
      {/if}

      {#if r.resolution_note || r.resolved_at}
        <div class="resolution">
          <h4>Resolution</h4>
          {#if r.resolution_note}<p>{r.resolution_note}</p>{/if}
          {#if r.resolved_by_email}
            <p class="muted small">
              {statusLabel(r.status)} by <strong>{r.resolved_by_email}</strong>
              {#if r.resolved_at} · {new Date(r.resolved_at).toLocaleString()}{/if}
            </p>
          {/if}
        </div>
      {/if}

      {#if can('reported_errors', 'manage')}
        <div class="actions-row">
          {#each (['open', 'in_progress', 'resolved', 'wont_fix'] as Status[]) as s (s)}
            {#if r.status !== s}
              <form method="POST" action="?/setStatus" use:enhance>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="status" value={s} />
                {#if (s === 'resolved' || s === 'wont_fix') && editingNoteId === `${r.id}:${s}`}
                  <textarea name="resolution_note" placeholder="Resolution note (optional)" rows="2"></textarea>
                  <button type="submit" class="action-btn is-{s}">Confirm {statusLabel(s).toLowerCase()}</button>
                  <button type="button" class="action-btn ghost" onclick={() => (editingNoteId = null)}>Cancel</button>
                {:else if s === 'resolved' || s === 'wont_fix'}
                  <button type="button" class="action-btn is-{s}" onclick={() => (editingNoteId = `${r.id}:${s}`)}>
                    Mark {statusLabel(s).toLowerCase()}…
                  </button>
                {:else}
                  <button type="submit" class="action-btn is-{s}">
                    {s === 'open' ? 'Re-open' : `Mark ${statusLabel(s).toLowerCase()}`}
                  </button>
                {/if}
              </form>
            {/if}
          {/each}

          <form method="POST" action="?/remove" use:enhance class="delete-form">
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" class="action-btn is-delete"
              onclick={(e) => { if (!confirm('Permanently delete this report?')) e.preventDefault() }}>
              Delete
            </button>
          </form>
        </div>
      {/if}
    </div>
  {/snippet}
</DataTable>

<style>
  .counter-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .counter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    border: 1px solid var(--border);
    background: var(--surface-sunk);
    color: var(--text-muted);
  }
  .counter strong {
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .counter.is-open { border-color: color-mix(in srgb, var(--danger) 35%, var(--border)); }
  .counter.is-progress { border-color: color-mix(in srgb, var(--warning) 35%, var(--border)); }
  .counter.is-resolved { border-color: color-mix(in srgb, var(--success) 35%, var(--border)); }
  .counter.is-wont { border-color: var(--border); }

  .title-cell { font-weight: var(--weight-medium); color: var(--text); }
  .mono { font-family: var(--font-mono); font-size: var(--text-xs); }
  .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
  .muted { color: var(--text-muted); }
  .small { font-size: var(--text-xs); }
  .date { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; }
  .date-time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-subtle); }

  .exp {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .detail {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .kv {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 4px var(--space-3);
    margin: 0;
    font-size: var(--text-sm);
  }
  .kv dt {
    color: var(--text-muted);
    font-weight: var(--weight-medium);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    align-self: center;
  }
  .kv dd {
    margin: 0;
    color: var(--text);
    word-break: break-all;
  }
  .raw-block,
  .screenshot-block {
    background: var(--surface-sunk);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
  }
  .screenshot-block summary {
    cursor: pointer;
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: var(--weight-medium);
  }
  .screenshot-block img {
    margin-top: var(--space-2);
    max-width: 100%;
    height: auto;
    display: block;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
  }
  .raw-block summary {
    cursor: pointer;
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: var(--weight-medium);
  }
  .raw-block pre {
    margin: var(--space-2) 0 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-muted);
  }
  .resolution {
    border-left: 3px solid var(--success);
    padding: var(--space-2) var(--space-3);
    background: color-mix(in srgb, var(--success) 6%, transparent);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }
  .resolution h4 {
    margin: 0 0 4px;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--success);
    font-weight: var(--weight-semibold);
  }
  .resolution p { margin: 0; font-size: var(--text-sm); color: var(--text); }

  .actions-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: flex-start;
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }
  .actions-row form {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 6px;
  }
  .actions-row textarea {
    width: 280px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-family: inherit;
    resize: vertical;
    background: var(--surface-raised);
    color: var(--text);
  }
  .action-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px 12px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-family: inherit;
    cursor: pointer;
  }
  .action-btn:hover { background: var(--surface-sunk); color: var(--text); }
  .action-btn.is-open { border-color: color-mix(in srgb, var(--danger) 35%, var(--border)); }
  .action-btn.is-in_progress { border-color: color-mix(in srgb, var(--warning) 35%, var(--border)); }
  .action-btn.is-resolved { border-color: color-mix(in srgb, var(--success) 35%, var(--border)); }
  .action-btn.is-wont_fix { border-color: var(--border); }
  .action-btn.is-delete {
    border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
    color: var(--danger);
    margin-left: auto;
  }
  .action-btn.is-delete:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }
  .action-btn.ghost { border-style: dashed; }
  .delete-form { margin-left: auto; }
</style>
