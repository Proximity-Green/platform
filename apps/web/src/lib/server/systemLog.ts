import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function log(
  category: 'email' | 'auth' | 'system' | 'import' | 'integration' | 'billing',
  level: 'info' | 'warning' | 'error' | 'success',
  message: string,
  details?: Record<string, any>,
  performedBy?: string | null,
  onBehalfOf?: string | null
) {
  const enrichedDetails = {
    ...details,
    ...(onBehalfOf && onBehalfOf !== performedBy ? { impersonating: onBehalfOf, performed_by: performedBy } : {})
  }

  await supabase.from('system_logs').insert({
    category,
    level,
    message,
    details: enrichedDetails,
    created_by: performedBy ?? null
  })
}
