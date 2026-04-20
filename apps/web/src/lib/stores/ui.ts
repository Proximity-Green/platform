import { derived, get } from 'svelte/store'
import { prefsStore, setPref } from './prefs'

const SHOW_TIMES_KEY = 'global.showTimes'

export const showTimes = derived(prefsStore, ($s) => $s.prefs[SHOW_TIMES_KEY] === true)

export function toggleShowTimes() {
  const current = get(prefsStore).prefs[SHOW_TIMES_KEY] === true
  setPref(SHOW_TIMES_KEY, !current)
}
