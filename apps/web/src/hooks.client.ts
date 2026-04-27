import type { HandleClientError } from '@sveltejs/kit'
import { pushGlobalError } from '$lib/stores/global-errors'

/**
 * Client-side error coverage. Three streams come together here:
 *
 *   1. SvelteKit's handleError — render-phase errors (component throws,
 *      load() rejections that aren't handled by +error.svelte).
 *   2. window.onerror — synchronous runtime exceptions outside Svelte's
 *      reactive graph (event handlers, third-party libs).
 *   3. window.unhandledrejection — promise rejections nobody caught
 *      (fetch().then chains without a .catch, async event handlers).
 *
 * All three feed the same global-errors store, which the admin layout
 * renders as ErrorBanner instances. Without this, JS errors only
 * surfaced in the console — invisible to the user and untrackable.
 */

if (typeof window !== 'undefined' && !(window as any).__globalErrorWired) {
  ;(window as any).__globalErrorWired = true

  window.addEventListener('error', (e) => {
    // ErrorEvent.error is the actual thrown value; .message is the string.
    pushGlobalError(e.error ?? { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno })
  })

  window.addEventListener('unhandledrejection', (e) => {
    pushGlobalError(e.reason)
  })
}

export const handleError: HandleClientError = ({ error, event }) => {
  pushGlobalError(error)
  // Return value flows into $page.error / +error.svelte. Keep the original
  // message so the existing 403/404/500 page logic still works.
  const message = error instanceof Error ? error.message : String(error)
  console.error('[client-error]', message, { url: event.url.toString(), error })
  return { message }
}
