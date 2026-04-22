import { env as publicEnv } from '$env/dynamic/public'
import { env as privateEnv } from '$env/dynamic/private'

function clean(raw: string | undefined, name: string): string {
  const v = raw ?? ''
  const stripped = v.replace(/\s+/g, '')
  if (stripped.length !== v.length) {
    console.warn(`[env] ${name} contained ${v.length - stripped.length} whitespace chars — stripped (Coolify paste corruption workaround)`)
  }
  return stripped
}

export const PUBLIC_SUPABASE_URL       = clean(publicEnv.PUBLIC_SUPABASE_URL,  'PUBLIC_SUPABASE_URL')
export const PUBLIC_SUPABASE_ANON_KEY  = clean(publicEnv.PUBLIC_SUPABASE_ANON_KEY, 'PUBLIC_SUPABASE_ANON_KEY')
export const PUBLIC_APP_URL            = clean(publicEnv.PUBLIC_APP_URL, 'PUBLIC_APP_URL') || 'https://poc.proximity.green'

export const SUPABASE_SERVICE_ROLE_KEY = clean(privateEnv.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
export const MAILGUN_API_KEY           = clean(privateEnv.MAILGUN_API_KEY, 'MAILGUN_API_KEY')
