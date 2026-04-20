import { writable, get } from 'svelte/store'
import { browser } from '$app/environment'
import { supabase } from '$lib/supabase'

/**
 * Per-user preferences backed by Supabase `user_preferences` (jsonb blob).
 *
 * Flat dotted keys, e.g.:
 *   - 'global.showTimes'       boolean
 *   - 'global.theme'           string
 *   - 'table.people.size'      number
 *   - 'table.people.sort'      string
 *   - 'table.people.dir'       'asc' | 'desc'
 *
 * Reads are synchronous against the in-memory cache.
 * Writes update the cache immediately and debounce a Supabase upsert.
 */

type Prefs = Record<string, unknown>
const LS_KEY = 'pg.prefs'

export const prefsStore = writable<{ loaded: boolean; prefs: Prefs }>({ loaded: false, prefs: {} })

let userId: string | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

function readLocal(): Prefs {
  if (!browser) return {}
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}
function writeLocal(prefs: Prefs) {
  if (!browser) return
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)) } catch {}
}

export async function loadPrefs(uid: string | null) {
  userId = uid
  // Fast path: hydrate from localStorage immediately for snappy boot
  const cached = readLocal()
  prefsStore.set({ loaded: !uid, prefs: cached })

  if (!uid) return
  const { data, error } = await supabase
    .from('user_preferences')
    .select('prefs')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) { console.warn('prefs load failed', error); return }
  const remote = (data?.prefs as Prefs) ?? {}
  // Remote wins on load (source of truth); localStorage is just a cache
  prefsStore.set({ loaded: true, prefs: remote })
  writeLocal(remote)

  // One-time theme hydration: if this device has no local theme choice,
  // seed from the user's saved prefs (first login on a new device).
  if (browser) hydrateThemeFromPrefs(remote)
}

function hydrateThemeFromPrefs(prefs: Prefs) {
  const MODE_KEY = 'pg.theme.mode'
  const LOOK_KEY = 'pg.theme.look'
  const remoteMode = prefs['global.mode']
  const remoteLook = prefs['global.look']
  if (!localStorage.getItem(MODE_KEY) && (remoteMode === 'dark' || remoteMode === 'light')) {
    localStorage.setItem(MODE_KEY, remoteMode)
    document.documentElement.setAttribute('data-mode', remoteMode)
  }
  if (!localStorage.getItem(LOOK_KEY) && (remoteLook === 'graphite' || remoteLook === 'neon')) {
    localStorage.setItem(LOOK_KEY, remoteLook)
    document.documentElement.setAttribute('data-theme', remoteLook)
  }
}

function flush() {
  if (!userId) return
  const { prefs } = get(prefsStore)
  supabase
    .from('user_preferences')
    .upsert({ user_id: userId, prefs }, { onConflict: 'user_id' })
    .then(({ error }) => { if (error) console.warn('prefs upsert failed', error) })
}

export function getPref<T>(key: string, fallback: T): T {
  const { prefs } = get(prefsStore)
  return key in prefs ? (prefs[key] as T) : fallback
}

export function setPref(key: string, value: unknown) {
  prefsStore.update(s => {
    const next = { ...s.prefs, [key]: value }
    writeLocal(next)
    return { ...s, prefs: next }
  })
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(flush, 400)
}

export function removePref(key: string) {
  prefsStore.update(s => {
    const next = { ...s.prefs }
    delete next[key]
    writeLocal(next)
    return { ...s, prefs: next }
  })
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(flush, 400)
}
