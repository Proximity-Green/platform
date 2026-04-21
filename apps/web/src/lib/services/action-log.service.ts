import { fail } from '@sveltejs/kit'
import { log } from './system-log.service'

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
  error: string,
  details: Record<string, any> = {},
  status = 400
) {
  try {
    await log('system', 'error', `${scope} failed: ${error}`, details, userId)
  } catch {
    // Logging must never mask the real failure.
  }
  return fail(status, { error })
}
