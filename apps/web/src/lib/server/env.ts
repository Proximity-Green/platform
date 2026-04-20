import { env as publicEnv } from '$env/dynamic/public'
import { env as privateEnv } from '$env/dynamic/private'

export const PUBLIC_SUPABASE_URL       = publicEnv.PUBLIC_SUPABASE_URL       || ''
export const PUBLIC_SUPABASE_ANON_KEY  = publicEnv.PUBLIC_SUPABASE_ANON_KEY  || ''
export const PUBLIC_APP_URL            = publicEnv.PUBLIC_APP_URL            || 'https://poc.proximity.green'

export const SUPABASE_SERVICE_ROLE_KEY = privateEnv.SUPABASE_SERVICE_ROLE_KEY || ''
export const MAILGUN_API_KEY           = privateEnv.MAILGUN_API_KEY           || ''
