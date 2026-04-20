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
  import { getPref, setPref } from '$lib/stores/prefs'

  type Props = {
    data: T[]
    columns: Column<T>[]
    table: string
    /** Title shown in the fullscreen header (hidden in normal mode since PageHead already shows it) */
    title?: string
    lede?: string
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
    /** Fires when a row is clicked (not buttons or form controls inside it) */
    onRowClick?: (row: T) => void
    /** Field used for type-to-jump (defaults to first searchField) */
    typeAheadField?: string
    /** Returns true for rows that should render their `expanded` snippet below */
    isExpandedRow?: (row: T) => boolean
    row?: Snippet<[T, { showTimes: boolean }]>
    actions?: Snippet<[T]>
    headActions?: Snippet<[]>
    /** Page-level actions (e.g. "+ Add Person") shown in the fullscreen header */
    pageActions?: Snippet<[]>
    emptyState?: Snippet<[]>
    /** Rendered in a full-width sub-row when isExpandedRow returns true */
    expanded?: Snippet<[T]>
  }
  let {
    data,
    columns,
    table,
    title,
    lede,
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
    onRowClick,
    typeAheadField,
    isExpandedRow,
    row,
    actions,
    headActions,
    pageActions,
    emptyState,
    expanded
  }: Props = $props()

  function handleRowClick(e: MouseEvent, item: T, i: number) {
    selectedIndex = i
    if (!onRowClick) return
    // Don't treat clicks on interactive controls as row clicks.
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, select, textarea, label, .actions-col')) return
    onRowClick(item)
  }

  const ts = createTableState({ table })

  let fullscreen = $state(false)
  const p = $derived(ts.params)

  function fsPortal(node: HTMLElement, active: boolean) {
    let parent: ParentNode | null = null
    let next: Node | null = null
    function apply(on: boolean) {
      if (on && node.parentNode !== document.body) {
        parent = node.parentNode
        next = node.nextSibling
        document.body.appendChild(node)
      } else if (!on && parent) {
        parent.insertBefore(node, next)
        parent = null
      }
    }
    apply(active)
    return {
      update(v: boolean) { apply(v) },
      destroy() { if (parent) parent.insertBefore(node, next) }
    }
  }

  function resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
  }

  const filtered = $derived.by(() => {
    const q = p.q.trim().toLowerCase()
    let list = data as T[]
    if (q && searchFields.length) {
      const terms = q.split(/\s+/).filter(Boolean)
      list = list.filter(row => {
        const haystack = searchFields
          .map(f => String(resolvePath(row, f) ?? '').toLowerCase())
          .join(' ')
        return terms.every(t => haystack.includes(t))
      })
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

  // Column widths — persisted per-table user preference.
  const widthsKey = `table.${table}.colWidths`
  let colWidths = $state<Record<string, string>>({ ...getPref<Record<string, string>>(widthsKey, {}) })

  function widthFor(col: Column<T>): string {
    return colWidths[col.key] ?? col.width ?? ''
  }

  function startResize(e: MouseEvent, col: Column<T>) {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement
    const startX = e.clientX
    const startW = th.getBoundingClientRect().width

    function onMove(m: MouseEvent) {
      const newW = Math.max(60, Math.round(startW + (m.clientX - startX)))
      colWidths = { ...colWidths, [col.key]: `${newW}px` }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setPref(widthsKey, colWidths)
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
</script>

<div class="dt-root" class:dt-fullscreen={fullscreen} use:fsPortal={fullscreen}>
{#if fullscreen && (title || pageActions)}
  <div class="fs-header">
    <div class="fs-header-text">
      {#if title}<h1>{title}</h1>{/if}
      {#if lede}<p class="fs-lede">{lede}</p>{/if}
    </div>
    {#if pageActions}
      <div class="fs-header-actions">{@render pageActions()}</div>
    {/if}
  </div>
{/if}
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
  <button
    class="fs-btn"
    type="button"
    onclick={() => fullscreen = !fullscreen}
    aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
    title={fullscreen ? 'Exit full screen' : 'Full screen'}
  >
    {#if fullscreen}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M8 2v4h4M6 12V8H2M8 6l5-5M1 13l5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    {:else}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    {/if}
  </button>
  {#if headActions}{@render headActions()}{/if}
</div>

<Card padding="md">
  <div class="table-scroll">
    <table>
      <colgroup>
        {#if isExpandedRow}<col style="width: 28px" />{/if}
        {#each columns as col}
          <col class={hideClass(col)} style={widthFor(col) ? `width: ${widthFor(col)}` : ''} />
        {/each}
        {#if hasActions}<col style="width: auto" />{/if}
      </colgroup>
      <thead>
        <tr>
          {#if isExpandedRow}<th class="expand-col" aria-hidden="true"></th>{/if}
          {#each columns as col, i}
            <th
              class={hideClass(col)}
              class:sortable={col.sortable}
              class:align-right={col.align === 'right'}
              onclick={col.sortable ? () => ts.toggleSort(col.key, col.date ? 'desc' : 'asc') : undefined}
            >
              {col.label}{#if col.sortable && p.sort === col.key}<span class="sort">{p.dir === 'asc' ? '↑' : '↓'}</span>{/if}
              {#if i < columns.length - 1 || hasActions}
                <span
                  class="resizer"
                  onmousedown={(e) => startResize(e, col)}
                  onclick={(e) => e.stopPropagation()}
                  role="separator"
                  aria-label="Resize {col.label} column"
                ></span>
              {/if}
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
            class:clickable={!!onRowClick}
            onclick={(e) => handleRowClick(e, item, i)}
          >
            {#if isExpandedRow}
              <td class="expand-col" aria-hidden="true">
                <svg class="chevron" class:open={isExpandedRow(item)} width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4 2 L8 6 L4 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </td>
            {/if}
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
          {#if expanded && isExpandedRow?.(item)}
            <tr class="expanded-row">
              <td colspan={columns.length + (hasActions ? 1 : 0) + 1}>
                {@render expanded(item)}
              </td>
            </tr>
          {/if}
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
</div>

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
  .fs-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 6px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    transition: background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
  }
  .fs-btn:hover { background: var(--surface-hover); color: var(--text); }

  :global(.dt-root.dt-fullscreen) {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: var(--surface);
    padding: var(--space-4) var(--space-5);
    overflow: auto;
  }
  .fs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-5);
    margin-bottom: var(--space-4);
  }
  .fs-header-text { flex: 1; min-width: 0; }
  .fs-header h1 {
    font-size: var(--text-2xl);
    margin: 0 0 var(--space-1);
  }
  .fs-lede {
    color: var(--text-muted);
    font-size: var(--text-md);
    max-width: 620px;
    margin: 0;
  }
  .fs-header-actions { display: flex; gap: var(--space-2); align-items: center; }

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
  thead {
    background: var(--surface-sunk, var(--surface-raised));
  }
  th {
    text-align: left;
    padding: var(--space-3) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--label-letter-spacing, 0.1em);
    color: var(--label-color);
    border-bottom: 2px solid var(--border-strong, var(--border));
    white-space: nowrap;
  }
  th { position: relative; }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--text); }
  th.align-right, td.align-right { text-align: right; }
  .sort { margin-left: 4px; color: var(--accent); }

  .resizer {
    position: absolute;
    top: 0;
    right: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 1;
    user-select: none;
  }
  .resizer:hover::after,
  .resizer:active::after {
    content: '';
    position: absolute;
    top: 25%;
    right: 3px;
    width: 2px;
    height: 50%;
    background: var(--accent);
    border-radius: 1px;
  }

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
  .table-scroll :global(tr.expanded-row > td) {
    background: var(--surface-sunk, var(--surface-raised));
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--accent);
    border-bottom: 1px solid var(--accent);
  }
  /* The row directly above an expanded row is joined to it — drop its
     bottom border and lift the accent tint so they read as one block. */
  .table-scroll :global(tr:has(+ tr.expanded-row) > td) {
    border-bottom: none;
    background: var(--accent-soft);
  }
  tbody tr:hover { background: var(--surface-hover); }
  tbody tr.clickable { cursor: pointer; }
  tbody tr.expanded-row:hover { background: var(--surface-sunk, var(--surface-raised)); }
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

  th.expand-col, .table-scroll :global(td.expand-col) {
    padding: 0 4px 0 10px;
    width: 28px;
    text-align: center;
    color: var(--text-muted);
  }
  .chevron {
    display: inline-block;
    vertical-align: middle;
    color: var(--text-muted);
    transition: transform var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
  }
  tbody tr.clickable:hover .chevron {
    color: var(--text);
  }
  .chevron.open {
    transform: rotate(90deg);
    color: var(--accent);
  }

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
