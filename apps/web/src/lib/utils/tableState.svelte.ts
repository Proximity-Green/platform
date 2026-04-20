import { goto } from '$app/navigation'
import { page } from '$app/stores'
import { get } from 'svelte/store'
import { browser } from '$app/environment'
import { getPref, setPref } from '$lib/stores/prefs'

export type SortDir = 'asc' | 'desc'
export type TableParams = {
  q: string
  filter: string
  sort: string
  dir: SortDir
  page: number
  size: number
}

export type TableStateOptions = {
  /** Unique identifier for this table, used to scope per-user preferences */
  table: string
  defaults?: Partial<TableParams>
  debounceMs?: number
}

export function createTableState(opts: TableStateOptions) {
  const prefSizeKey = `table.${opts.table}.size`
  const prefSortKey = `table.${opts.table}.sort`
  const prefDirKey  = `table.${opts.table}.dir`

  const def: TableParams = {
    q: '',
    filter: 'all',
    sort: getPref<string>(prefSortKey, opts.defaults?.sort ?? ''),
    dir: getPref<SortDir>(prefDirKey, opts.defaults?.dir ?? 'desc'),
    page: 1,
    size: getPref<number>(prefSizeKey, opts.defaults?.size ?? 50),
    ...(opts.defaults ?? {})
  }
  const debounceMs = opts.debounceMs ?? 250

  const state = $state<TableParams>({ ...def })
  let timer: ReturnType<typeof setTimeout> | null = null

  function readFromUrl() {
    if (!browser) return
    const p = get(page)
    const sp = p.url.searchParams
    state.q = sp.get('q') ?? def.q
    state.filter = sp.get('filter') ?? def.filter
    state.sort = sp.get('sort') ?? def.sort
    state.dir = (sp.get('dir') as SortDir) || def.dir
    state.page = Number(sp.get('page') ?? def.page) || def.page
    state.size = Number(sp.get('size') ?? def.size) || def.size
  }

  function writeToUrl(immediate = false) {
    if (!browser) return
    if (timer) { clearTimeout(timer); timer = null }
    const run = () => {
      const sp = new URLSearchParams()
      if (state.q !== def.q) sp.set('q', state.q)
      if (state.filter !== def.filter) sp.set('filter', state.filter)
      if (state.sort !== def.sort) sp.set('sort', state.sort)
      if (state.dir !== def.dir) sp.set('dir', state.dir)
      if (state.page !== def.page) sp.set('page', String(state.page))
      if (state.size !== def.size) sp.set('size', String(state.size))
      const qs = sp.toString()
      goto(qs ? `?${qs}` : location.pathname, {
        replaceState: true,
        noScroll: true,
        keepFocus: true
      })
    }
    if (immediate) run()
    else timer = setTimeout(run, debounceMs)
  }

  readFromUrl()

  return {
    get params() { return state },
    setQ(v: string) { state.q = v; state.page = 1; writeToUrl() },
    setFilter(v: string) { state.filter = v; state.page = 1; writeToUrl(true) },
    toggleSort(key: string, initialDir: SortDir = 'asc') {
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc'
      else { state.sort = key; state.dir = initialDir }
      state.page = 1
      setPref(prefSortKey, state.sort)
      setPref(prefDirKey, state.dir)
      writeToUrl(true)
    },
    setPage(v: number) { state.page = v; writeToUrl(true) },
    setSize(v: number) {
      state.size = v
      state.page = 1
      setPref(prefSizeKey, v)
      writeToUrl(true)
    }
  }
}
