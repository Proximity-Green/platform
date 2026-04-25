import type { Matcher } from '../types'

/**
 * Generic permission errors from requirePermission() (`Permission denied:
 * <resource>.<action>`) and Supabase RLS errors. Surface the resource so the
 * user knows which permission to ask their admin for.
 */
const PATTERNS: RegExp[] = [
  /^Permission denied:\s*(\S+)/i,
  /new row violates row-level security policy for table "([^"]+)"/i,
  /permission denied for table ([a-z_]+)/i
]

export const match: Matcher = async ({ message }) => {
  for (const re of PATTERNS) {
    const m = message.match(re)
    if (m) {
      const resource = m[1]
      return {
        code: 'permission_denied',
        title: `You don't have permission for "${resource}".`,
        detail: 'Ask an admin to grant you the required role, or sign in as a user who has it.',
        raw: message
      }
    }
  }
  return null
}
