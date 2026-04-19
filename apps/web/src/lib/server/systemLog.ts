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
  createdBy?: string | null
) {
  await supabase.from('system_logs').insert({
    category,
    level,
    message,
    details: details ?? null,
    created_by: createdBy ?? null
  })
}
