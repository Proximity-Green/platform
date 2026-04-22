import { createServerClient } from '@supabase/ssr'
import type { Handle } from '@sveltejs/kit'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$lib/server/env'

export const handle: Handle = async ({ event, resolve }) => {
  const supabaseUrl = PUBLIC_SUPABASE_URL
  const supabaseAnonKey = PUBLIC_SUPABASE_ANON_KEY

  event.locals.supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookiesToSet) => {
        // Don't force httpOnly/secure/sameSite — the browser @supabase/ssr
        // client writes non-httpOnly cookies and needs to keep reading them.
        // Overriding httpOnly=true here made client-side getSession() return
        // null on navigation, firing SIGNED_OUT and bouncing back to /.
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: '/' })
        })
      }
    }
  })

  event.locals.getSession = async () => {
    const { data: { session } } = await event.locals.supabase.auth.getSession()
    return session
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version'
    }
  })
}
