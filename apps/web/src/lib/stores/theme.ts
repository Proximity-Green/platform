import { writable } from 'svelte/store'
import { browser } from '$app/environment'
import { setPref } from './prefs'

export type Mode = 'dark' | 'light'
export type Look = 'graphite' | 'neon' | 'w17'

/** Looks whose layout shell is the horizontal top nav (WSM-style). */
export const TOP_NAV_LOOKS: Look[] = ['w17']
export function usesTopNav(look: Look): boolean { return TOP_NAV_LOOKS.includes(look) }

const MODE_KEY = 'pg.theme.mode'
const LOOK_KEY = 'pg.theme.look'

function readLook(): Look {
  if (!browser) return 'w17'
  const stored = localStorage.getItem(LOOK_KEY) as Look | null
  if (stored === 'neon' || stored === 'w17' || stored === 'graphite') return stored
  return 'w17'
}

function readMode(): Mode {
  if (!browser) return 'light'
  // W17 is light-only — override any stored mode
  if (readLook() === 'w17') return 'light'
  const stored = localStorage.getItem(MODE_KEY) as Mode | null
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
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
    // W17 is fundamentally a light theme (cream body, sage nav) — force light
    // mode when entering it so users don't land on an unintended dark variant.
    if (v === 'w17') mode.set('light')
    if (initLook) { initLook = false; return }
    setPref('global.look', v)
  })
}

export function toggleMode() { mode.update(m => (m === 'dark' ? 'light' : 'dark')) }
export function cycleLook() {
  look.update(l => (l === 'graphite' ? 'neon' : l === 'neon' ? 'w17' : 'graphite'))
}
export function setLook(l: Look) { look.set(l) }
// Back-compat with the old boolean toggle.
export const toggleLook = cycleLook
