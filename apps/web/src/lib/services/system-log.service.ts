import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/env'

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Resolve a user ID to email
async function resolveEmail(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  const { data: { user } } = await supabase.auth.admin.getUserById(userId)
  return user?.email ?? userId
}

export async function log(
  category: 'email' | 'auth' | 'system' | 'import' | 'integration' | 'billing',
  level: 'info' | 'warning' | 'error' | 'success',
  message: string,
  details?: Record<string, any>,
  performedBy?: string | null,
  onBehalfOf?: string | null
) {
  // Resolve any user IDs in details to emails
  const enrichedDetails = { ...details }
  for (const key of Object.keys(enrichedDetails)) {
    const val = enrichedDetails[key]
    if (typeof val === 'string' && val.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
      const email = await resolveEmail(val)
      if (email && email !== val) enrichedDetails[key] = email
    }
  }

  if (onBehalfOf && onBehalfOf !== performedBy) {
    enrichedDetails.impersonating = await resolveEmail(onBehalfOf) ?? onBehalfOf
    enrichedDetails.performed_by = await resolveEmail(performedBy) ?? performedBy
  }

  const { error } = await supabase.from('system_logs').insert({
    category,
    level,
    message,
    details: enrichedDetails,
    created_by: performedBy ?? null
  })

  // Surface log-write failures to the dev console. Without this, a silently
  // failing INSERT (RLS, schema mismatch, bad creds) leaves no trace anywhere
  // and makes "why aren't my logs appearing" impossible to debug.
  if (error) {
    console.error(`[system-log] insert failed for [${category}/${level}] "${message}"`, {
      code: error.code, details: error.details, hint: error.hint, message: error.message
    })
  }
}
