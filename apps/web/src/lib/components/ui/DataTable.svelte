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

  export type FilterOption = { value: string; label: string }
  export type FilterState = Record<string, string[]>

  /**
   * A Filter is either:
   *  - a chip (boolean test, mutually exclusive — only one chip filter active at a time)
   *  - a select (dropdown popover with options, can stack with chips and other selects).
   *
   * Select filters support **two-way faceted cascading**: pass `options` as a
   * function and it receives both the current FilterState and `availableRows`
   * — the rows that pass *every other* active filter. This means each
   * dropdown's options auto-narrow to only what's actually reachable given
   * the rest of the filter state.
   */
  export type Filter<R> =
    | {
        kind?: 'chip'
        key: string
        label: string
        test?: (row: R) => boolean
      }
    | {
        kind: 'select'
        key: string
        label: string
        /** Static array OR a function. The function is called with the current
         *  filter state and the rows that pass every OTHER active filter.
         *  Use `availableRows` to scope options to what's actually reachable. */
        options: FilterOption[] | ((state: FilterState, availableRows: R[]) => FilterOption[])
        /** Returns true if the row passes when these values are selected.
         *  Called only when at least one value is selected. */
        test: (row: R, selectedValues: string[]) => boolean
        /** Allow multi-select. Default false (single value, click-to-replace). */
        multi?: boolean
      }
</script>

<script lang="ts" generics="T extends Record<string, any>">
  import { onDestroy } from 'svelte'
  import type { Snippet } from 'svelte'
  import Card from './Card.svelte'
  import Button from './Button.svelte'
  import Pager from './Pager.svelte'
  import TimesToggle from './TimesToggle.svelte'
  import { createTableState } from '$lib/utils/tableState.svelte'
  import { downloadCsv, type CsvColumn } from '$lib/utils/csv'
  import { showTimes } from '$lib/stores/ui'
  import { getPref, setPref } from '$lib/stores/prefs'
  import { supabase } from '$lib/supabase'

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
    /** Fires whenever the post-filter/post-search list changes. Receives the
        full filtered list (not paginated). Useful for bulk-action toolbars
        that need "Select found set". */
    onFilteredChange?: (rows: T[]) => void
    /** Fires when any filter (chip filter, select pill, or Clear all) changes.
        Use this to drop stale bulk selection so it stays in sync with what's
        visible. Doesn't fire on data refreshes. */
    onFiltersChanged?: () => void
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
    /** Opt-in Live updates: Supabase table name to subscribe to for INSERT events.
        The table must be in the `supabase_realtime` publication. When Live is ON,
        each incoming row is passed to onRealtimeInsert (if provided) so the caller
        can enrich (e.g. resolve user IDs to emails) and mutate its own data state. */
    realtimeTable?: string
    /** Called on each realtime INSERT. Receives the raw row from postgres_changes.
        Only fires when Live is toggled ON and the table is in the realtime publication. */
    onRealtimeInsert?: (raw: any) => void
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
    onFilteredChange,
    onFiltersChanged,
    typeAheadField,
    isExpandedRow,
    row,
    actions,
    headActions,
    pageActions,
    emptyState,
    expanded,
    realtimeTable,
    onRealtimeInsert
  }: Props = $props()

  // Live updates via Supabase Realtime. Off by default; consumer opts in by
  // passing `realtimeTable`. Only active while this tab is open.
  let live = $state(false)
  let liveError = $state<string | null>(null)
  let liveChannel: ReturnType<typeof supabase.channel> | null = null

  function startLive() {
    if (liveChannel || !realtimeTable) return
    liveError = null
    liveChannel = supabase
      .channel(`datatable-live-${realtimeTable}-${table}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: realtimeTable }, (payload) => {
        onRealtimeInsert?.(payload.new)
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          liveError = `Realtime: ${status.toLowerCase().replace('_', ' ')}`
        } else if (status === 'SUBSCRIBED') {
          liveError = null
        }
      })
  }

  function stopLive() {
    if (!liveChannel) return
    try {
      supabase.removeChannel(liveChannel)
    } catch (e) {
      console.warn('[DataTable] realtime teardown failed:', e)
    }
    liveChannel = null
  }

  function toggleLive() {
    live = !live
    if (live) startLive(); else stopLive()
  }

  // In dev, Vite HMR destroys the old component each time any touched file
  // re-saves. @supabase/phoenix has a teardown bug (`connToClose.close is
  // not a function`) that escapes as an uncaught sync throw inside an async
  // Promise executor — which crashes Node. Skip the channel cleanup during
  // HMR; the leak is harmless (dev process gets replaced) and the real user
  // case (page navigation) still triggers onDestroy normally in prod where
  // import.meta.hot is undefined.
  onDestroy(() => {
    if ((import.meta as any).hot) return
    stopLive()
  })

  function handleRowClick(e: MouseEvent, item: T, i: number) {
    selectedIndex = i
    const handler = onRowClick ?? onActivate
    if (!handler) return
    // Don't treat clicks on interactive controls as row clicks.
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, select, textarea, label, .actions-col')) return
    handler(item)
  }

  const ts = createTableState({ table })

  type ViewMode = 'normal' | 'wide' | 'fullscreen'
  let viewMode = $state<ViewMode>('normal')
  const viewExpanded = $derived(viewMode !== 'normal')
  const fullscreen = $derived(viewMode === 'fullscreen')
  function cycleViewMode() {
    viewMode = viewMode === 'normal' ? 'wide' : viewMode === 'wide' ? 'fullscreen' : 'normal'
  }
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

  // Per-key selected values for `kind: 'select'` filters. Persisted in
  // sessionStorage so navigating to a detail page and back restores filters.
  // (URL serialisation deferred — see deferred phase-2 list.)
  const sessionKey = `dt.${table}.selectFilters`
  function readSession(): FilterState {
    if (typeof window === 'undefined') return {}
    try {
      const raw = sessionStorage.getItem(sessionKey)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch { return {} }
  }
  let selectFilterState = $state<FilterState>(readSession())
  $effect(() => {
    if (typeof window === 'undefined') return
    try {
      if (Object.keys(selectFilterState).length === 0) {
        sessionStorage.removeItem(sessionKey)
      } else {
        sessionStorage.setItem(sessionKey, JSON.stringify(selectFilterState))
      }
    } catch {}
  })

  function setSelectFilter(key: string, values: string[]) {
    selectFilterState = { ...selectFilterState, [key]: values }
  }
  function clearSelectFilter(key: string) {
    const { [key]: _drop, ...rest } = selectFilterState
    selectFilterState = rest
  }
  function clearAllFilters() {
    selectFilterState = {}
    if (p.filter && p.filter !== 'all') ts.setFilter('all')
  }
  const hasActiveFilters = $derived(
    Object.keys(selectFilterState).length > 0 || (p.filter && p.filter !== 'all')
  )
  function toggleSelectValue(key: string, value: string, multi: boolean) {
    const current = selectFilterState[key] ?? []
    if (multi) {
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
      if (next.length === 0) clearSelectFilter(key)
      else setSelectFilter(key, next)
    } else {
      // Single-select: clicking the active value clears; clicking another replaces.
      if (current[0] === value) clearSelectFilter(key)
      else setSelectFilter(key, [value])
    }
  }
  // Apply search + chip + every select filter except an optional skipped key.
  // Used to compute the "what rows would still be in play if I removed this
  // filter?" view that drives faceted cascading options.
  function rowsExcept(skipKey: string | null): T[] {
    let list = data as T[]
    const q = p.q.trim().toLowerCase()
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
      const f = filters.find(x => x.key === p.filter && (x.kind ?? 'chip') === 'chip') as
        Extract<Filter<T>, { kind?: 'chip' }> | undefined
      if (f?.test) list = list.filter(f.test)
    }
    for (const f of filters) {
      if (f.kind !== 'select') continue
      if (f.key === skipKey) continue
      const values = selectFilterState[f.key]
      if (!values?.length) continue
      list = list.filter(row => f.test(row, values))
    }
    return list
  }

  function resolveOptions(f: Extract<Filter<T>, { kind: 'select' }>): FilterOption[] {
    if (typeof f.options !== 'function') return f.options
    return f.options(selectFilterState, rowsExcept(f.key))
  }

  // When cascading options shrink (e.g. another filter narrowed the set), prune
  // any selected values no longer valid. Two-way faceted cascading.
  $effect(() => {
    let dirty = false
    const next: FilterState = { ...selectFilterState }
    for (const f of filters) {
      if (f.kind !== 'select' || typeof f.options !== 'function') continue
      const allowed = new Set(resolveOptions(f).map(o => o.value))
      const cur = next[f.key]
      if (!cur) continue
      const kept = cur.filter(v => allowed.has(v))
      if (kept.length !== cur.length) {
        if (kept.length === 0) delete next[f.key]
        else next[f.key] = kept
        dirty = true
      }
    }
    if (dirty) selectFilterState = next
  })

  // Which dropdown popover is open (one at a time).
  let openSelect = $state<string | null>(null)
  let selectQuery = $state('')
  function toggleOpen(key: string) {
    if (openSelect === key) { openSelect = null }
    else { openSelect = key; selectQuery = '' }
  }
  function closeSelect() { openSelect = null; selectQuery = '' }
  function filterOpts(opts: FilterOption[], q: string): FilterOption[] {
    const t = q.trim().toLowerCase()
    if (!t) return opts
    return opts.filter(o => o.label.toLowerCase().includes(t))
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
      const f = filters.find(x => x.key === p.filter && (x.kind ?? 'chip') === 'chip') as
        Extract<Filter<T>, { kind?: 'chip' }> | undefined
      if (f?.test) list = list.filter(f.test)
    }
    // Apply each select filter in turn (AND across keys, OR within multi).
    for (const f of filters) {
      if (f.kind !== 'select') continue
      const values = selectFilterState[f.key]
      if (!values?.length) continue
      list = list.filter(row => f.test(row, values))
    }
    if (p.sort) {
      const col = columns.find(c => c.key === p.sort)
      if (col) {
        const dir = p.dir === 'asc' ? 1 : -1
        list = [...list].sort((a, b) => {
          const av = col.get ? col.get(a) : a[col.key]
          const bv = col.get ? col.get(b) : b[col.key]
          const primary =
            av == null && bv == null ? 0 :
            av == null ? 1 :
            bv == null ? -1 :
            av < bv ? -1 * dir :
            av > bv ?  1 * dir : 0
          if (primary !== 0) return primary
          // Tie on the primary sort (e.g. same category) — stable secondary
          // sort: newest first if rows carry created_at. Without this, rows
          // streamed in via realtime appear in arbitrary places inside their
          // group instead of at the top.
          const ac = (a as any).created_at
          const bc = (b as any).created_at
          if (ac && bc) return ac > bc ? -1 : ac < bc ? 1 : 0
          return 0
        })
      }
    }
    return list
  })

  // Notify parent when any filter changes so it can drop stale bulk
  // selection. Skip the initial run so the page doesn't clear selection on
  // mount.
  let filtersChangedReady = false
  $effect(() => {
    void p.filter
    void selectFilterState
    if (filtersChangedReady) onFiltersChanged?.()
    filtersChangedReady = true
  })

  // Emit filtered list to the parent (for bulk "Select found" UIs, etc.)
  $effect(() => {
    if (onFilteredChange) onFilteredChange(filtered)
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

  // Mirror each column's label onto the matching <td> via data-label, so the
  // mobile card CSS can surface it as a caption above the value. Runs after
  // each render because the user-provided row snippet outputs its own <td>s
  // which we don't otherwise control.
  $effect(() => {
    void paged
    void columns
    if (!tbodyEl) return
    const rows = tbodyEl.querySelectorAll('tr:not(.expanded-row)')
    rows.forEach(tr => {
      const tds = tr.querySelectorAll(':scope > td')
      const offset = isExpandedRow ? 1 : 0  // expand-col is the first td when enabled
      tds.forEach((td, i) => {
        const colIdx = i - offset
        const col = columns[colIdx]
        if (col) td.setAttribute('data-label', col.label)
        else td.removeAttribute('data-label')
      })
    })
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
    } else if (e.key === 'Enter' && paged[selectedIndex]) {
      const row = paged[selectedIndex]
      e.preventDefault()
      if (onRowClick) onRowClick(row)
      else if (onActivate) onActivate(row)
    } else if (e.key === 'ArrowRight' && paged[selectedIndex]) {
      const row = paged[selectedIndex]
      e.preventDefault()
      if (onRowClick) onRowClick(row)
      else if (onActivate) onActivate(row)
    } else if (e.key === 'ArrowLeft' && onRowClick && isExpandedRow && paged[selectedIndex]) {
      const row = paged[selectedIndex]
      if (isExpandedRow(row)) {
        e.preventDefault()
        onRowClick(row)
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

<div class="dt-root" class:dt-wide={viewMode === 'wide'} class:dt-fullscreen={fullscreen} use:fsPortal={viewExpanded}>
{#if viewExpanded && (title || pageActions)}
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
      {#each filters as f (f.key)}
        {#if (f.kind ?? 'chip') === 'chip'}
          <button class="chip" class:is-on={p.filter === f.key} onclick={() => ts.setFilter(f.key)}>{f.label}</button>
        {:else}
          {@const sf = f as Extract<Filter<T>, { kind: 'select' }>}
          {@const selected = selectFilterState[sf.key] ?? []}
          {@const opts = resolveOptions(sf)}
          {@const labelFor = (v: string) => opts.find(o => o.value === v)?.label ?? v}
          <div class="select-wrap">
            <div class="chip select-pill" class:is-on={selected.length > 0}>
              <button
                class="select-pill-main"
                onclick={() => toggleOpen(sf.key)}
                type="button"
              >
                <span class="chip-label">{sf.label}</span>
                {#if selected.length === 1}
                  <span class="chip-value">: {labelFor(selected[0])}</span>
                {:else if selected.length > 1}
                  <span class="chip-value">: {selected.length}</span>
                {/if}
                <span class="chip-caret" aria-hidden="true">▾</span>
              </button>
              {#if selected.length > 0}
                <button
                  class="select-pill-clear"
                  type="button"
                  aria-label={`Clear ${sf.label} filter`}
                  title="Clear filter"
                  onclick={(e) => { e.stopPropagation(); clearSelectFilter(sf.key) }}
                >×</button>
              {/if}
            </div>
            {#if openSelect === sf.key}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div class="select-backdrop" onclick={closeSelect}></div>
              {@const visible = filterOpts(opts, selectQuery)}
              <div class="select-panel" role="listbox" aria-label={sf.label}>
                <div class="search-row">
                  <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7"/>
                    <path d="m20 20-3.5-3.5"/>
                  </svg>
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    type="text"
                    class="search-input"
                    placeholder="Search…"
                    bind:value={selectQuery}
                    autocomplete="off"
                    autofocus
                  />
                </div>
                <ul class="select-list">
                  {#if visible.length === 0}
                    <li class="select-empty">No matches</li>
                  {:else}
                    {#each visible as o (o.value)}
                      {@const isOn = selected.includes(o.value)}
                      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                      <li
                        class="select-option"
                        class:is-selected={isOn}
                        role="option"
                        aria-selected={isOn}
                        onclick={() => {
                          toggleSelectValue(sf.key, o.value, !!sf.multi)
                          if (!sf.multi) closeSelect()
                        }}
                      >
                        <span class="opt-check" aria-hidden="true">
                          {#if isOn}
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M3 7.5 6 10.5 11 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          {/if}
                        </span>
                        <span class="opt-label">{o.label}</span>
                      </li>
                    {/each}
                  {/if}
                </ul>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
      {#if hasActiveFilters}
        <button
          type="button"
          class="clear-all-filters"
          onclick={clearAllFilters}
          title="Clear all filters"
        >Clear all</button>
      {/if}
    </div>
  {/if}
  {#if realtimeTable}
    <button
      type="button"
      class="live-toggle"
      class:is-on={live}
      onclick={toggleLive}
      title={live ? (liveError ?? 'Streaming new rows') : 'Stream new rows live'}
    >
      <span class="live-dot" class:is-on={live} aria-hidden="true"></span>
      <span>Live</span>
    </button>
  {/if}
  <div class="count">{filtered.length} of {data.length}</div>
  {#if timesToggle}
    <TimesToggle />
  {/if}
  <Button variant="ghost" size="sm" onclick={exportCsv} disabled={filtered.length === 0}>↓ CSV</Button>
  <button
    class="fs-btn"
    type="button"
    onclick={cycleViewMode}
    aria-label={viewMode === 'normal' ? 'Expand to wide' : viewMode === 'wide' ? 'Expand to full screen' : 'Collapse'}
    title={viewMode === 'normal' ? 'Wide' : viewMode === 'wide' ? 'Full screen' : 'Collapse'}
  >
    {#if viewMode === 'fullscreen'}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M8 2v4h4M6 12V8H2M8 6l5-5M1 13l5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    {:else if viewMode === 'wide'}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M1 7h12M4 4L1 7l3 3M10 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
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
            class:clickable={!!(onRowClick ?? onActivate)}
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
  :global(.dt-root.dt-wide) {
    position: fixed;
    top: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    width: min(calc(100vw - var(--space-8)), 2400px);
    max-height: calc(100vh - var(--space-8));
    z-index: 9999;
    background: var(--surface);
    padding: var(--space-4) var(--space-5);
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
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
  .live-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-family: inherit;
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    color: var(--text-muted);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
    transition: border-color 160ms, color 160ms, background 160ms;
  }
  .live-toggle:hover { color: var(--text); border-color: var(--text-muted); }
  .live-toggle.is-on {
    color: var(--accent);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-subtle, var(--text-muted));
  }
  .live-dot.is-on {
    background: var(--accent);
    animation: live-pulse 1.6s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent); }
    50%      { box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 0%, transparent); }
  }

  .chip:hover { background: var(--surface-hover); color: var(--text); }
  .chip.is-on {
    background: var(--accent-soft);
    color: var(--accent-hover, var(--accent));
    border-color: var(--accent);
    font-weight: var(--weight-semibold);
  }
  .chip.is-on:hover { background: var(--accent-soft); }

  .clear-all-filters {
    height: 28px;
    padding: 0 0.6rem;
    margin-left: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--border);
    text-underline-offset: 3px;
    transition: color var(--motion-fast) var(--ease-out);
  }
  .clear-all-filters:hover {
    color: var(--accent);
    text-decoration-color: var(--accent);
  }

  /* ── Select-style filter chip + popover ─────────────────────────── */
  /* Toggle chips (kind:'chip') stay text-only by default and only fill in
     when active or hovered. Select pills (kind:'select') are always visible
     with a permanent border so they read as "dropdowns to open" — visually
     distinct from the toggles even when no value is selected. */
  .select-wrap {
    position: relative;
    display: inline-block;
  }
  /* Visual divider between toggle chips and dropdown filters. */
  .filters > .select-wrap:first-of-type {
    margin-left: 10px;
    padding-left: 10px;
    border-left: 1px solid var(--border);
  }
  /* Pill is a flex container hosting two buttons: main (open popover) and × (clear). */
  .select-pill {
    display: inline-flex;
    align-items: stretch;
    padding: 0;
    overflow: hidden;
    /* Always-visible solid border so an empty dropdown still reads as a
       button-shaped control. Override the .chip's transparent border. */
    border: 1px solid var(--border) !important;
    background: var(--surface-sunk, #f4f4f4);
    color: var(--text);
    box-shadow: inset 0 -1px 0 rgba(0,0,0,0.04);
  }
  .select-pill:hover {
    border-color: var(--accent) !important;
    background: var(--surface-hover);
  }
  .select-pill.is-on {
    border-color: var(--accent) !important;
    background: var(--accent-soft);
    color: var(--accent-hover, var(--accent));
    font-weight: var(--weight-semibold);
  }
  .select-pill-main {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    padding: 0 12px;
    cursor: pointer;
    line-height: 1.6;
  }
  .select-pill-main .chip-label { font-weight: var(--weight-medium); }
  .select-pill-main .chip-value { color: inherit; opacity: 0.85; }
  .select-pill-main .chip-caret {
    font-size: 14px;
    line-height: 1;
    opacity: 0.85;
    margin-left: 4px;
    transform: translateY(1px);
  }

  .select-pill-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-left: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    color: inherit;
    cursor: pointer;
    padding: 0 8px;
    font-size: 14px;
    line-height: 1;
    opacity: 0.7;
    transition: opacity 120ms ease, background 120ms ease;
  }
  .select-pill-clear:hover { opacity: 1; background: color-mix(in srgb, currentColor 12%, transparent); }

  .select-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: transparent;
    cursor: default;
  }
  /* Filter popover matches the universal Select component look (same search
     row, list, option styling). */
  .select-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 51;
    min-width: 260px;
    max-width: 420px;
    padding: 4px;
    background: var(--surface-raised, #ffffff);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .search-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .search-icon { color: var(--text-muted); flex-shrink: 0; }
  .search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    padding: 2px 0;
    min-width: 0;
    text-transform: none;
    letter-spacing: normal;
  }
  .search-input::placeholder { color: var(--text-muted); }

  .select-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: min(60vh, 420px);
    overflow-y: auto;
  }
  .select-empty {
    padding: 10px 12px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }
  .select-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: var(--text-sm);
    color: var(--text);
    cursor: pointer;
    line-height: 1.2;
    user-select: none;
    text-transform: none;
    letter-spacing: normal;
    font-weight: var(--weight-normal, 400);
  }
  .select-option:hover { background: var(--surface-sunk, #f4f4f4); }
  .select-option.is-selected {
    font-weight: var(--weight-semibold);
    color: var(--accent);
    background: transparent;
  }
  .select-option.is-selected:hover { background: var(--accent-soft); }
  .opt-check {
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--accent);
  }
  .opt-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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
    font-size: 1.05rem;
    table-layout: fixed;
  }
  thead {
    background: var(--surface-sunk, var(--surface-raised));
  }
  th {
    text-align: left;
    padding: var(--space-3) var(--space-3);
    font-size: 0.9rem;
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

  @media (max-width: 640px) {
    .toolbar { gap: var(--space-2); }
    .search { max-width: none; width: 100%; flex-basis: 100%; }
    .count { margin-left: 0; order: 2; }
    .filters { flex-wrap: wrap; }
    .fs-btn { display: none; }

    .table-scroll { overflow-x: visible; }
    .table-scroll table,
    .table-scroll thead,
    .table-scroll tbody,
    .table-scroll tr { display: block; width: auto; }
    .table-scroll colgroup,
    .table-scroll thead { display: none; }
    .table-scroll table { table-layout: auto; }

    .table-scroll tbody tr {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-3);
      padding: var(--space-2) var(--space-3);
      background: var(--surface-raised);
    }
    .table-scroll tbody tr:hover,
    .table-scroll tbody tr.is-selected { background: var(--surface-hover); }
    .table-scroll :global(tbody tr.is-active) { background: var(--accent-soft); }
    .table-scroll :global(tbody tr.is-selected td:first-child) { box-shadow: none; }
    .table-scroll tbody tr:last-child { margin-bottom: 0; }

    .table-scroll :global(tbody tr > td) {
      display: block;
      width: 100%;
      padding: 6px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
      text-align: left;
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }
    .table-scroll :global(tbody tr > td:last-child) { border-bottom: none; }
    .table-scroll :global(tbody tr > td:first-child) {
      font-size: 1rem;
      font-weight: var(--weight-semibold);
      padding-top: 2px;
    }
    /* Column-label caption above each value on mobile. Skip the first td —
       that's the card's primary (name/action) and the label would be noise. */
    .table-scroll :global(tbody tr > td[data-label]:not(:first-child))::before {
      content: attr(data-label);
      display: block;
      font-size: 10px;
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 2px;
    }
    .table-scroll :global(td.ellipsis) {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }
    .table-scroll :global(td.actions-col .actions) { justify-content: flex-start; }
    .table-scroll .resizer { display: none; }

    .table-scroll tbody tr.expanded-row {
      padding: 0;
      border: none;
      background: transparent;
    }
    .table-scroll :global(tr.expanded-row > td) {
      padding: var(--space-3);
      border-radius: var(--radius-md);
    }
  }
</style>
