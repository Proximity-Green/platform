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

  // hardDef = the baseline used for URL diffing (so the URL always reflects
  // explicit user choices, even when they match saved prefs).
  const hardDef: TableParams = {
    q: '',
    filter: 'all',
    sort: opts.defaults?.sort ?? '',
    dir: opts.defaults?.dir ?? 'desc',
    page: 1,
    size: opts.defaults?.size ?? 50
  }
  // def = the effective default for initial state, pulling from user prefs.
  const def: TableParams = {
    ...hardDef,
    sort: getPref<string>(prefSortKey, hardDef.sort),
    dir: getPref<SortDir>(prefDirKey, hardDef.dir),
    size: getPref<number>(prefSizeKey, hardDef.size)
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
      if (state.q !== hardDef.q) sp.set('q', state.q)
      if (state.filter !== hardDef.filter) sp.set('filter', state.filter)
      if (state.sort !== hardDef.sort) sp.set('sort', state.sort)
      if (state.dir !== hardDef.dir) sp.set('dir', state.dir)
      if (state.page !== hardDef.page) sp.set('page', String(state.page))
      if (state.size !== hardDef.size) sp.set('size', String(state.size))
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
  // After hydrating from URL, reflect any pref-loaded defaults into the URL so
  // saved prefs are always visible in the address bar.
  writeToUrl(true)

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
