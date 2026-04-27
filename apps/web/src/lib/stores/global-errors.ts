import { writable } from 'svelte/store'
import type { ActionableError } from '$lib/services/errors'

/**
 * Pending client-side errors that escaped a try/catch — runtime exceptions,
 * unhandled promise rejections, SvelteKit render errors. The admin layout
 * subscribes and renders one ErrorBanner per entry at the top of the page.
 *
 * The reactive `translate()` system covers form-action failures already.
 * This store covers the remaining gap: `fetch()` rejections in event
 * handlers, async work after the form returned, third-party widget bugs,
 * etc. — anywhere an error would otherwise just go to the console.
 */
export type GlobalError = {
  id: string
  error: ActionableError
  at: Date
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const globalErrors = writable<GlobalError[]>([])

/**
 * Convert a raw browser error into an ActionableError. Lighter than the
 * server-side translator — most client-side errors are JS exceptions, not
 * Postgres-shaped, so we slot them into a generic `client_error` code with
 * the readable name kept in the title.
 */
export function clientErrorToActionable(raw: unknown): ActionableError | null {
  // Filter out the noise that browsers + dev tooling routinely emit but
  // that nobody can act on. Keeping these out of the banner keeps the
  // signal-to-noise ratio of "Report error" useful.
  const message = extractMessage(raw)
  if (!message) return null
  if (isNoise(message)) return null

  return {
    code: 'client_error',
    title: shortTitle(message),
    detail: 'Something went wrong in the browser. Reporting it sends the full stack and screenshot to the triage queue.',
    raw: longRaw(raw, message)
  }
}

function extractMessage(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (raw instanceof Error) return raw.message || raw.name || ''
  const e = raw as any
  return e?.message ?? e?.reason?.message ?? e?.toString?.() ?? ''
}

function shortTitle(message: string): string {
  const firstLine = message.split('\n')[0].trim()
  if (firstLine.length > 200) return firstLine.slice(0, 197) + '…'
  return firstLine || 'Something went wrong in the browser.'
}

function longRaw(raw: unknown, message: string): string {
  const e = raw as any
  const parts: string[] = [message]
  if (e?.stack) parts.push(String(e.stack))
  if (e?.filename) parts.push(`source: ${e.filename}:${e.lineno ?? '?'}:${e.colno ?? '?'}`)
  if (e?.reason?.stack) parts.push(String(e.reason.stack))
  return parts.join('\n')
}

const NOISE_PATTERNS: RegExp[] = [
  // Benign browser quirk that fires when a ResizeObserver callback runs
  // longer than a frame — every modern browser emits it; nothing to fix.
  /ResizeObserver loop limit exceeded/i,
  /ResizeObserver loop completed with undelivered notifications/i,
  // Vite HMR / dev-server reconnect chatter.
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /WebSocket connection.*failed/i,
  /\[vite\]/i,
  // Browser extensions throwing inside the page context.
  /^Extension context invalidated/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  // User-cancelled fetches when navigating away — not an error.
  /The user aborted a request/i,
  /AbortError/i,
  // Realtime websocket teardowns we already handle server-side.
  /connToClose\.close is not a function/i
]

function isNoise(message: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(message))
}

export function pushGlobalError(raw: unknown): void {
  const actionable = clientErrorToActionable(raw)
  if (!actionable) return
  globalErrors.update(arr => {
    // De-duplicate against the most recent entry so a runaway loop doesn't
    // spam the banner stack. Same title within 5s = same incident.
    const last = arr[0]
    if (last && last.error.title === actionable.title && Date.now() - last.at.getTime() < 5000) {
      return arr
    }
    return [{ id: makeId(), error: actionable, at: new Date() }, ...arr].slice(0, 10)
  })
}

export function dismissGlobalError(id: string): void {
  globalErrors.update(arr => arr.filter(e => e.id !== id))
}
