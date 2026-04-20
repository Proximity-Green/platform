import { writable } from 'svelte/store'
import { browser } from '$app/environment'
import { setPref } from './prefs'

export type Mode = 'dark' | 'light'
export type Look = 'graphite' | 'neon'

const MODE_KEY = 'pg.theme.mode'
const LOOK_KEY = 'pg.theme.look'

function readMode(): Mode {
  if (!browser) return 'dark'
  const stored = localStorage.getItem(MODE_KEY) as Mode | null
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readLook(): Look {
  if (!browser) return 'graphite'
  const stored = localStorage.getItem(LOOK_KEY) as Look | null
  return stored === 'neon' ? 'neon' : 'graphite'
}

export const mode = writable<Mode>(readMode())
export const look = writable<Look>(readLook())

if (browser) {
  // Skip the initial subscribe-on-register write so we don't clobber prefs
  // with defaults before loadPrefs has had a chance to seed the user's choice.
  let initMode = true
  let initLook = true
  mode.subscribe(v => {
    document.documentElement.setAttribute('data-mode', v)
    localStorage.setItem(MODE_KEY, v)
    if (initMode) { initMode = false; return }
    setPref('global.mode', v)
  })
  look.subscribe(v => {
    document.documentElement.setAttribute('data-theme', v)
    localStorage.setItem(LOOK_KEY, v)
    if (initLook) { initLook = false; return }
    setPref('global.look', v)
  })
}

export function toggleMode() { mode.update(m => (m === 'dark' ? 'light' : 'dark')) }
export function toggleLook() { look.update(l => (l === 'graphite' ? 'neon' : 'graphite')) }
