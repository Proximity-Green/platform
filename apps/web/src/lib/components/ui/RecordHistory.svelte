<script lang="ts">
  import { onDestroy } from 'svelte'
  import Badge from './Badge.svelte'
  import { supabase } from '$lib/supabase'
  import { permStore, canDo } from '$lib/stores/permissions'

  let perms = $state({ role: null as string | null, permissions: [] as any, loaded: false })
  permStore.subscribe(v => { perms = v })
  const canRestore = $derived(canDo(perms, 'audit_log', 'manage'))

  /**
   * Opt-in audit timeline.
   *
   * Three modes:
   *   1. Single record: <RecordHistory table="items" id={item.id} />
   *      Hits /api/admin/record-history. Shows changes only to that row.
   *
   *   2. Aggregate root: <RecordHistory aggregateRoot="organisations" id={org.id} />
   *      Hits /api/admin/aggregate-history. Walks the server-side fan-out
   *      map and merges changes from the root + every child table that
   *      points to it (e.g. for an org: subscription_lines, contracts,
   *      invoices, persons, …) into one chronological feed. Each entry
   *      shows a small chip with its source table.
   *
   *   3. Composite (paired rows): <RecordHistory pairs={[{table, id}, …]} />
   *      Hits the same /api/admin/record-history endpoint with
   *      ?pairs=table:id,table:id. For logical records that span multiple
   *      rows — e.g. a licence's identity row + its paired subscription
   *      line where the price lives. Each entry shows a source-table
   *      chip so it's obvious whether a change came from the licence
   *      side (dates, member) or the subscription side (rate).
   *
   * All modes are collapsed by default, lazy-fetch on open, refresh live
   * via Supabase Realtime, and gate the "Open in change log" link on
   * audit_log.manage so only restorers see it.
   */

  type Entry = {
    id: string
    table_name: string
    record_id: string
    action: 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE'
    changed_by: string | null
    changed_by_email: string
    old_values: Record<string, any> | null
    new_values: Record<string, any> | null
    created_at: string
  }

  let {
    table,
    aggregateRoot,
    pairs,
    id,
    label = 'history',
    limit
  }: {
    table?: string
    aggregateRoot?: string
    /** Composite mode — pulls + merges history for several rows. */
    pairs?: { table: string; id: string }[]
    id?: string | null | undefined
    label?: string
    limit?: number
  } = $props()

  const isAggregate = $derived(!!aggregateRoot)
  const isComposite = $derived(Array.isArray(pairs) && pairs.length > 0)
  // Composite renders the source-table chip (same as aggregate) so
  // operators can tell which paired row a given change came from.
  const showSourceChip = $derived(isAggregate || isComposite)
  const effectiveLimit = $derived(limit ?? (isAggregate ? 500 : 200))
  const endpointBase = $derived(
    isAggregate ? '/api/admin/aggregate-history' : '/api/admin/record-history'
  )
  const pairsParam = $derived(
    isComposite ? (pairs ?? []).map(p => `${p.table}:${p.id}`).join(',') : ''
  )
  const queryParams = $derived(
    isAggregate
      ? `root=${encodeURIComponent(aggregateRoot!)}&id=${encodeURIComponent(id ?? '')}`
      : isComposite
        ? `pairs=${encodeURIComponent(pairsParam)}`
        : `table=${encodeURIComponent(table ?? '')}&id=${encodeURIComponent(id ?? '')}`
  )
  // Composite mode keys off pairsParam so a stale `id` from a prior
  // mode doesn't short-circuit the load() de-dupe.
  const idKey = $derived(isComposite ? pairsParam : (id ?? ''))

  // Friendly source-table label for aggregate mode chips. Same convention
  // as migration 049 (singular noun). Anything missing falls back to the
  // raw table name.
  const SOURCE_LABELS: Record<string, string> = {
    organisations: 'organisation',
    subscription_lines: 'subscription line',
    subscription_option_groups: 'subscription option',
    licenses: 'licence',
    contracts: 'contract',
    invoices: 'invoice',
    persons: 'member',
    wallets: 'wallet',
    organisation_accounting_customers: 'accounting customer'
  }

  let open = $state(false)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let entries = $state<Entry[]>([])
  let loadedFor = $state<string | null>(null)
  let count = $state<number | null>(null)
  const displayCount = $derived(open ? entries.length : count)

  const actionTone: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'default'> = {
    INSERT: 'success',
    UPDATE: 'info',
    DELETE: 'danger',
    RESTORE: 'warning'
  }

  async function load(force = false) {
    if (!idKey) return
    const key = `${endpointBase}:${queryParams}`
    if (!force && loadedFor === key) return
    loading = true
    error = null
    try {
      const res = await fetch(`${endpointBase}?${queryParams}&limit=${effectiveLimit}`)
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `HTTP ${res.status}`)
      }
      const json = await res.json()
      entries = json.entries ?? []
      count = entries.length
      loadedFor = key
    } catch (e: any) {
      error = e?.message ?? String(e)
    } finally {
      loading = false
    }
  }

  async function loadCount() {
    if (!idKey) return
    try {
      const res = await fetch(`${endpointBase}?${queryParams}&count_only=1`)
      if (!res.ok) return
      const json = await res.json()
      count = json.count ?? 0
    } catch {
      // ignore — badge just stays at the previous value
    }
  }

  function toggle() {
    open = !open
    if (open) load()
  }

  // Realtime: subscribe whenever we have an id, regardless of open state.
  // While closed, we just bump the badge count (cheap). While open, we
  // refetch the full list so the timeline is current.
  let channel: ReturnType<typeof supabase.channel> | null = null
  let refetchTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleRefetch() {
    if (refetchTimer) clearTimeout(refetchTimer)
    refetchTimer = setTimeout(() => load(true), 300)
  }

  function teardownChannel() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    if (refetchTimer) {
      clearTimeout(refetchTimer)
      refetchTimer = null
    }
  }

  $effect(() => {
    teardownChannel()
    if (!idKey) return
    // Initial badge count without paying for the full body fetch.
    loadCount()

    // In aggregate / composite modes the relevant (table, record_id)
    // tuple set is bigger than postgres_changes' single-eq filter can
    // express. Subscribe unfiltered to change_log INSERTs and decide
    // in the handler whether the event matters. Cheap — change_log
    // is append-only and the handler is a small string compare.
    const channelName = isAggregate
      ? `record-history-agg-${aggregateRoot}-${id}`
      : isComposite
        ? `record-history-pairs-${pairsParam}`
        : `record-history-${table}-${id}`
    const filterCfg = (isAggregate || isComposite)
      ? { event: 'INSERT', schema: 'public', table: 'change_log' }
      : { event: 'INSERT', schema: 'public', table: 'change_log', filter: `record_id=eq.${id}` }

    channel = supabase
      .channel(channelName)
      .on('postgres_changes', filterCfg as any, (payload) => {
        if (isAggregate) {
          // Don't trust the count locally — re-ask the server.
          loadCount()
          if (open) scheduleRefetch()
        } else if (isComposite) {
          const row = payload.new as any
          const matches = (pairs ?? []).some(
            p => p.table === row?.table_name && p.id === row?.record_id
          )
          if (!matches) return
          count = (count ?? 0) + 1
          if (open) scheduleRefetch()
        } else {
          if ((payload.new as any)?.table_name !== table) return
          count = (count ?? 0) + 1
          if (open) scheduleRefetch()
        }
      })
      .subscribe()
    return teardownChannel
  })

  onDestroy(teardownChannel)

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

  function nonEmptyEntries(values: Record<string, any> | null) {
    if (!values) return []
    return Object.entries(values).filter(
      ([k, v]) => v != null && v !== '' && !['id', 'created_at', 'updated_at'].includes(k)
    )
  }

  function relativeTime(iso: string): string {
    const then = new Date(iso).getTime()
    const diffSec = Math.round((Date.now() - then) / 1000)
    if (diffSec < 5) return 'just now'
    if (diffSec < 60) return `${diffSec}s ago`
    if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`
    if (diffSec < 86400 * 30) return `${Math.round(diffSec / 86400)}d ago`
    return new Date(iso).toLocaleDateString()
  }

  function absoluteTime(iso: string): string {
    const d = new Date(iso)
    return `${d.toLocaleDateString()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function formatVal(v: any): string {
    if (v == null || v === '') return '—'
    return String(v)
  }
</script>

<section class="rh">
  <div class="bar">
    <button type="button" class="toggle" onclick={toggle} aria-expanded={open}>
      <span class="caret" class:open>▸</span>
      <span>{open ? 'Hide' : 'Show'} {label}</span>
      {#if displayCount && displayCount > 0}
        <span class="count">{displayCount}</span>
      {/if}
    </button>
    {#if open}
      <button type="button" class="refresh" onclick={() => load(true)} disabled={loading} title="Refresh">
        <span class="r-icon" class:spinning={loading} aria-hidden="true">⟳</span>
        <span>Refresh</span>
      </button>
    {/if}
  </div>

  {#if open}
    <div class="body">
      {#if loading && entries.length === 0}
        <p class="muted">Loading…</p>
      {:else if error}
        <p class="error">{error}</p>
      {:else if !idKey}
        <p class="muted">Save the record first to see its history.</p>
      {:else if entries.length === 0}
        <p class="muted">No history recorded yet.</p>
      {:else}
        <ol class="timeline">
          {#each entries as entry}
            <li class="card">
              <header class="head">
                <Badge tone={actionTone[entry.action] ?? 'default'}>{entry.action}</Badge>
                {#if showSourceChip}
                  <span class="source-chip" title={entry.table_name}>{SOURCE_LABELS[entry.table_name] ?? entry.table_name}</span>
                {/if}
                <span class="when" title={absoluteTime(entry.created_at)}>{relativeTime(entry.created_at)}</span>
                <span class="head-sep">by</span>
                <span class="who" title={entry.changed_by ?? ''}>{entry.changed_by_email}</span>
                {#if canRestore}
                  <a class="open-link" href="/changelog?entry={entry.id}" title="Open in change log to restore or see full diff">Open in change log ↗</a>
                {/if}
              </header>

              {#if entry.action === 'UPDATE' || entry.action === 'RESTORE'}
                {@const fields = getChangedFields(entry)}
                {#if fields.length}
                  <div class="diff">
                    <div class="diff-row diff-head">
                      <span>Field</span><span>Before</span><span>After</span>
                    </div>
                    {#each fields as f, i}
                      <div class="diff-row" class:zebra={i % 2 === 0}>
                        <span class="fname">{f.field}</span>
                        <span class="before">{formatVal(f.old)}</span>
                        <span class="after">{formatVal(f.new)}</span>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="muted small">No field changes recorded.</p>
                {/if}
              {:else if entry.action === 'INSERT'}
                <div class="diff diff-single">
                  <div class="diff-row diff-head">
                    <span>Field</span><span>Value</span>
                  </div>
                  {#each nonEmptyEntries(entry.new_values) as [key, val], i}
                    <div class="diff-row" class:zebra={i % 2 === 0}>
                      <span class="fname">{key}</span>
                      <span class="after">{formatVal(val)}</span>
                    </div>
                  {/each}
                </div>
              {:else if entry.action === 'DELETE'}
                <div class="diff diff-single">
                  <div class="diff-row diff-head">
                    <span>Field</span><span>Value at delete</span>
                  </div>
                  {#each nonEmptyEntries(entry.old_values) as [key, val], i}
                    <div class="diff-row" class:zebra={i % 2 === 0}>
                      <span class="fname">{key}</span>
                      <span class="before">{formatVal(val)}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</section>

<style>
  .rh {
    margin-top: var(--space-5);
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    border: none;
    padding: 6px 0;
    font-size: var(--text-base, 0.95rem);
    font-weight: var(--weight-regular);
    color: var(--text-muted);
    cursor: pointer;
  }
  .toggle:hover { color: var(--text); }
  .caret {
    display: inline-block;
    transition: transform 120ms ease;
    font-size: 0.75em;
    color: var(--text-muted);
  }
  .caret.open { transform: rotate(90deg); }
  .count {
    display: inline-flex;
    padding: 2px 10px;
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    color: var(--text-muted);
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
  }
  .refresh {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .refresh:hover:not(:disabled) {
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }
  .refresh:disabled { opacity: 0.5; cursor: wait; }
  .r-icon { display: inline-block; line-height: 1; }
  .r-icon.spinning { animation: rh-spin 0.8s linear infinite; }
  @keyframes rh-spin { to { transform: rotate(360deg); } }

  .body { margin-top: var(--space-3); }

  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .card {
    background: var(--surface-sunk, color-mix(in srgb, var(--text) 3%, var(--surface)));
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4) var(--space-4);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-2);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .who {
    font-family: var(--font-mono);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .when {
    font-variant-numeric: tabular-nums;
    cursor: help;
    flex-shrink: 0;
  }
  .head-sep { color: var(--text-muted); }
  .source-chip {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-raised, #fff));
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
    flex-shrink: 0;
  }
  .open-link {
    margin-left: auto;
    font-size: var(--text-xs);
    color: var(--accent);
    text-decoration: none;
    flex-shrink: 0;
  }
  .open-link:hover { text-decoration: underline; }

  .diff {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
  }
  .diff-row {
    display: grid;
    grid-template-columns: 160px minmax(120px, 280px) minmax(120px, 280px);
    gap: var(--space-3);
    padding: 3px 8px;
    align-items: baseline;
  }
  .diff-single .diff-row {
    grid-template-columns: 160px minmax(160px, 560px);
  }
  .diff-row > span {
    word-break: break-word;
    min-width: 0;
  }
  .diff-head {
    font-size: 10px;
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    padding-bottom: 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }
  .diff-row.zebra {
    background: color-mix(in srgb, var(--surface-raised, #ffffff) 55%, transparent);
  }
  .diff-row:not(.diff-head):hover {
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-raised, #ffffff));
  }
  .diff-row:last-child {
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
  }
  .fname {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }
  .before {
    color: var(--danger);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--danger) 60%, transparent);
  }
  .after { color: var(--success); }

  .muted { color: var(--text-muted); font-size: var(--text-sm); margin: 0; }
  .small { font-size: var(--text-xs); }
  .error { color: var(--danger); font-size: var(--text-sm); margin: 0; }

  @media (max-width: 720px) {
    .diff-row, .diff-single .diff-row {
      grid-template-columns: 1fr;
      gap: 2px;
      padding: 6px 8px;
    }
    .diff-head { display: none; }
    .fname::after { content: ':'; color: var(--text-muted); }
  }
</style>
