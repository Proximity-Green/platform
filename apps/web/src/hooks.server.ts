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
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, {
            ...options,
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'lax'
          })
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
