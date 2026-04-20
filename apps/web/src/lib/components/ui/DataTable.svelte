<script module lang="ts">
  export type Column<R> = {
    key: string
    label: string
    sortable?: boolean
    width?: string
    hideBelow?: 'sm' | 'md'
    align?: 'left' | 'right'
    /** Extract sort/csv value (defaults to row[key]) */
    get?: (row: R) => unknown
    /** Display text (defaults to String(get(row))) */
    render?: (row: R) => string | null
    muted?: boolean
    mono?: boolean
    /** Render as date; respects showTimes toggle for time display */
    date?: boolean
    ellipsis?: boolean
  }

  export type Filter<R> = {
    key: string
    label: string
    test?: (row: R) => boolean
  }
</script>

<script lang="ts" generics="T extends Record<string, any>">
  import type { Snippet } from 'svelte'
  import Card from './Card.svelte'
  import Button from './Button.svelte'
  import Pager from './Pager.svelte'
  import TimesToggle from './TimesToggle.svelte'
  import { createTableState } from '$lib/utils/tableState.svelte'
  import { downloadCsv, type CsvColumn } from '$lib/utils/csv'
  import { showTimes } from '$lib/stores/ui'

  type Props = {
    data: T[]
    columns: Column<T>[]
    table: string
    filters?: Filter<T>[]
    searchFields?: string[]
    searchPlaceholder?: string
    csvFilename?: string
    csvColumns?: CsvColumn<T>[]
    empty?: string
    timesToggle?: boolean
    actionsLabel?: string
    /** Returns true for rows that should be highlighted (e.g. being edited) */
    isActiveRow?: (row: T) => boolean
    /** Fires on Cmd/Ctrl+Enter with the keyboard-selected row */
    onActivate?: (row: T) => void
    /** Field used for type-to-jump (defaults to first searchField) */
    typeAheadField?: string
    row?: Snippet<[T, { showTimes: boolean }]>
    actions?: Snippet<[T]>
    headActions?: Snippet<[]>
    emptyState?: Snippet<[]>
  }
  let {
    data,
    columns,
    table,
    filters = [],
    searchFields = [],
    searchPlaceholder = 'Search…',
    csvFilename,
    csvColumns,
    empty = 'No records.',
    timesToggle = false,
    actionsLabel = 'Actions',
    isActiveRow,
    onActivate,
    typeAheadField,
    row,
    actions,
    headActions,
    emptyState
  }: Props = $props()

  const ts = createTableState({ table })
  const p = $derived(ts.params)

  function resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
  }

  const filtered = $derived.by(() => {
    const q = p.q.trim().toLowerCase()
    let list = data as T[]
    if (q && searchFields.length) {
      list = list.filter(row =>
        searchFields.some(f => String(resolvePath(row, f) ?? '').toLowerCase().includes(q))
      )
    }
    if (p.filter && p.filter !== 'all') {
      const f = filters.find(x => x.key === p.filter)
      if (f?.test) list = list.filter(f.test)
    }
    if (p.sort) {
      const col = columns.find(c => c.key === p.sort)
      if (col) {
        const dir = p.dir === 'asc' ? 1 : -1
        list = [...list].sort((a, b) => {
          const av = col.get ? col.get(a) : a[col.key]
          const bv = col.get ? col.get(b) : b[col.key]
          if (av == null && bv == null) return 0
          if (av == null) return 1
          if (bv == null) return -1
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
        })
      }
    }
    return list
  })

  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / p.size)))
  const currentPage = $derived(Math.min(p.page, totalPages))
  const paged = $derived(filtered.slice((currentPage - 1) * p.size, currentPage * p.size))

  function exportCsv() {
    const cols: CsvColumn<T>[] = csvColumns ?? columns.map(c => ({
      key: c.key,
      label: c.label,
      get: c.get ?? ((r: T) => r[c.key])
    }))
    downloadCsv(csvFilename ?? table, filtered, cols)
  }

  function formatCell(row: T, col: Column<T>, showT: boolean): string {
    const raw = col.get ? col.get(row) : row[col.key]
    if (col.render) return col.render(row) ?? ''
    if (raw == null || raw === '') return '—'
    if (col.date) {
      const d = new Date(raw as any)
      return showT
        ? `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
        : d.toLocaleDateString()
    }
    return String(raw)
  }

  const hasActions = $derived(!!actions)
  const hideClass = (col: Column<T>) => col.hideBelow ? `hide-${col.hideBelow}` : ''

  let selectedIndex = $state(0)
  let tbodyEl: HTMLTableSectionElement | undefined = $state()

  $effect(() => {
    if (selectedIndex >= paged.length) selectedIndex = Math.max(0, paged.length - 1)
  })

  function scrollSelectedIntoView() {
    queueMicrotask(() => {
      const rows = tbodyEl?.querySelectorAll('tr')
      rows?.[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    })
  }

  function handleKey(e: KeyboardEvent) {
    const ae = document.activeElement as HTMLElement | null
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return
    if (document.querySelector('.drawer-panel, [role="dialog"]')) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (selectedIndex < paged.length - 1) {
        selectedIndex++
      } else if (currentPage < totalPages) {
        ts.setPage(currentPage + 1)
        selectedIndex = 0
      }
      scrollSelectedIntoView()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (selectedIndex > 0) {
        selectedIndex--
      } else if (currentPage > 1) {
        ts.setPage(currentPage - 1)
        selectedIndex = p.size - 1
      }
      scrollSelectedIntoView()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (onActivate && paged[selectedIndex]) {
        e.preventDefault()
        onActivate(paged[selectedIndex])
      }
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && /\S/.test(e.key)) {
      e.preventDefault()
      handleTypeAhead(e.key.toLowerCase())
    }
  }

  let typeBuffer = ''
  let typeTimer: ReturnType<typeof setTimeout> | null = null
  const typeAheadKey = $derived(typeAheadField ?? searchFields[0] ?? columns[0]?.key)

  function handleTypeAhead(ch: string) {
    if (!typeAheadKey) return
    typeBuffer += ch
    if (typeTimer) clearTimeout(typeTimer)
    typeTimer = setTimeout(() => { typeBuffer = '' }, 600)

    const idx = filtered.findIndex(r => {
      const v = resolvePath(r, typeAheadKey)
      return typeof v === 'string' && v.toLowerCase().startsWith(typeBuffer)
    })
    if (idx < 0) return
    const targetPage = Math.floor(idx / p.size) + 1
    const targetIndex = idx % p.size
    if (targetPage !== currentPage) ts.setPage(targetPage)
    selectedIndex = targetIndex
    scrollSelectedIntoView()
  }

  $effect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

</script>

<div class="toolbar">
  <input
    class="search"
    type="search"
    placeholder={searchPlaceholder}
    value={p.q}
    oninput={(e) => ts.setQ((e.currentTarget as HTMLInputElement).value)}
  />
  {#if filters.length}
    <div class="filters">
      {#each filters as f}
        <button class="chip" class:is-on={p.filter === f.key} onclick={() => ts.setFilter(f.key)}>{f.label}</button>
      {/each}
    </div>
  {/if}
  <div class="count">{filtered.length} of {data.length}</div>
  {#if timesToggle}
    <TimesToggle />
  {/if}
  <Button variant="ghost" size="sm" onclick={exportCsv} disabled={filtered.length === 0}>↓ CSV</Button>
  {#if headActions}{@render headActions()}{/if}
</div>

<Card padding="md">
  <div class="table-scroll">
    <table>
      <colgroup>
        {#each columns as col}
          <col class={hideClass(col)} style={col.width ? `width: ${col.width}` : ''} />
        {/each}
        {#if hasActions}<col style="width: auto" />{/if}
      </colgroup>
      <thead>
        <tr>
          {#each columns as col}
            <th
              class={hideClass(col)}
              class:sortable={col.sortable}
              class:align-right={col.align === 'right'}
              onclick={col.sortable ? () => ts.toggleSort(col.key, col.date ? 'desc' : 'asc') : undefined}
            >
              {col.label}{#if col.sortable && p.sort === col.key}<span class="sort">{p.dir === 'asc' ? '↑' : '↓'}</span>{/if}
            </th>
          {/each}
          {#if hasActions}<th class="actions-col">{actionsLabel}</th>{/if}
        </tr>
      </thead>
      <tbody bind:this={tbodyEl}>
        {#each paged as item, i}
          <tr
            class:is-active={isActiveRow?.(item)}
            class:is-selected={i === selectedIndex}
            onclick={() => selectedIndex = i}
          >
            {#if row}
              {@render row(item, { showTimes: $showTimes })}
            {:else}
              {#each columns as col}
                <td
                  class={hideClass(col)}
                  class:muted={col.muted}
                  class:mono={col.mono}
                  class:ellipsis={col.ellipsis}
                  class:align-right={col.align === 'right'}
                  title={col.ellipsis ? formatCell(item, col, $showTimes) : undefined}
                >{formatCell(item, col, $showTimes)}</td>
              {/each}
            {/if}
            {#if hasActions}
              <td class="actions-col">
                <div class="actions">{@render actions!(item)}</div>
              </td>
            {/if}
          </tr>
        {:else}
          <tr>
            <td colspan={columns.length + (hasActions ? 1 : 0)} class="empty">
              {#if emptyState}{@render emptyState()}{:else}
                {p.q || p.filter !== 'all' ? 'No matches.' : empty}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <Pager
    page={currentPage}
    pageSize={p.size}
    total={filtered.length}
    onPage={(v) => ts.setPage(v)}
    onPageSize={(v) => ts.setSize(v)}
  />
</Card>

<style>
  .toolbar {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 0;
    max-width: 320px;
    padding: 0 0.7rem;
    height: 32px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--text);
    font-size: var(--text-sm);
    text-transform: none;
    letter-spacing: normal;
  }
  .search:focus {
    outline: none;
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .filters { display: flex; gap: 4px; }
  .chip {
    height: 28px;
    padding: 0 0.7rem;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }
  .chip:hover { background: var(--surface-hover); color: var(--text); }
  .chip.is-on {
    background: var(--accent-soft);
    color: var(--accent-hover, var(--accent));
    border-color: var(--accent);
    font-weight: var(--weight-semibold);
  }
  .chip.is-on:hover { background: var(--accent-soft); }
  .count {
    margin-left: auto;
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .table-scroll { width: 100%; overflow-x: auto; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    table-layout: fixed;
  }
  th {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--label-letter-spacing, 0.1em);
    color: var(--label-color);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--text); }
  th.align-right, td.align-right { text-align: right; }
  .sort { margin-left: 4px; color: var(--accent); }

  /* Use :global() so styles reach <td>s rendered inside the `row` snippet
     (snippet content lives in the parent page's CSS scope, not DataTable's). */
  .table-scroll :global(td) {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .table-scroll :global(td.muted) { color: var(--text-muted); }
  .table-scroll :global(td.mono) { font-family: var(--font-mono); }
  .table-scroll :global(td.ellipsis) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .table-scroll :global(tbody tr:last-child td) { border-bottom: none; }
  tbody tr:hover { background: var(--surface-hover); }
  tbody tr.is-selected { background: var(--surface-hover); }
  .table-scroll :global(tbody tr.is-selected td:first-child) {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  tbody tr.is-active { background: var(--accent-soft); }
  tbody tr.is-active:hover,
  tbody tr.is-active.is-selected { background: var(--accent-soft); }
  .table-scroll :global(tbody tr.is-active td) { border-bottom-color: var(--accent); }

  .actions { display: flex; gap: var(--space-2); justify-content: flex-end; align-items: center; }
  .actions-col { text-align: right; }
  th.actions-col { text-align: right; }

  /* While a SubmitButton is in-flight, hide its siblings so the pending
     button is the only visible action in the row. */
  .table-scroll :global(.actions.is-busy > *:not(.is-active-submit)) {
    visibility: hidden;
    pointer-events: none;
  }

  .empty {
    text-align: center;
    padding: var(--space-10);
    color: var(--text-muted);
  }

  @media (max-width: 640px) {
    .hide-sm { display: none; }
  }
  @media (max-width: 900px) {
    .hide-md { display: none; }
  }
</style>
