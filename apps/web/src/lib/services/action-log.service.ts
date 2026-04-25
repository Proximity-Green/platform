import { fail } from '@sveltejs/kit'
import { log } from './system-log.service'
import { translate } from './errors'

// Normalise anything a Supabase client / SDK / throw site can produce
// into a readable message string. Without this, passing a PostgrestError
// or Error through ${err} produces "[object Object]" in logs.
function stringifyError(error: unknown): { message: string; details: Record<string, any> } {
  if (error == null) return { message: 'unknown error', details: {} }
  if (typeof error === 'string') return { message: error, details: {} }
  if (error instanceof Error) {
    return {
      message: error.message,
      details: {
        error_name: error.name,
        ...(error.stack ? { error_stack: error.stack.split('\n').slice(0, 6).join('\n') } : {})
      }
    }
  }
  const e = error as Record<string, any>
  const message = e.message ?? e.error_description ?? JSON.stringify(error)
  const details: Record<string, any> = {}
  if (e.code) details.error_code = e.code
  if (e.details) details.error_details = e.details
  if (e.hint) details.error_hint = e.hint
  return { message, details }
}

/**
 * Wrap a SvelteKit action failure in a system_logs entry so every save error
 * is discoverable in /system-logs — not just the transient red toast.
 *
 * Usage in a +page.server.ts action:
 *
 *   if (!result.ok) return await logFail(userId, 'items.create', result.error, { input })
 */
export async function logFail(
  userId: string | null,
  scope: string,
  error: unknown,
  details: Record<string, any> = {},
  status = 400
) {
  const { message, details: errorDetails } = stringifyError(error)
  try {
    await log('system', 'error', `${scope} failed: ${message}`, { ...details, ...errorDetails }, userId)
  } catch (logErr) {
    console.error(`[logFail] failed to write ${scope} error to system_logs:`, logErr)
  }
  // Translate to ActionableError so the UI can show a clean banner with
  // a code, suggested fixes, and a copy button. Keep `error` (raw message)
  // populated for any older consumer that still reads form?.error.
  const actionable = await translate(error)
  return fail(status, { error: message, actionable })
}
