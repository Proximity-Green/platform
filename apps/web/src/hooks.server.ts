import { createServerClient } from '@supabase/ssr'
import type { Handle } from '@sveltejs/kit'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$lib/server/env'

// Swallow the @supabase/phoenix realtime teardown bug
// (`TypeError: connToClose.close is not a function`). It comes from a
// fire-and-forget disconnect deep in @supabase/realtime-js when a channel
// is removed before its underlying socket finished initialising — the
// throw escapes node's promise chain and would otherwise kill the dev
// process. Until upstream ships a fix, log and keep running.
if (typeof process !== 'undefined' && !(globalThis as any).__phoenixGuardInstalled) {
  ;(globalThis as any).__phoenixGuardInstalled = true
  process.on('uncaughtException', (err: any) => {
    const msg = err?.message ?? String(err)
    if (msg.includes('connToClose.close is not a function') || (err?.stack ?? '').includes('@supabase/phoenix')) {
      console.warn('[supabase-phoenix] swallowed realtime teardown error:', msg)
      return
    }
    throw err
  })
  process.on('unhandledRejection', (reason: any) => {
    const msg = reason?.message ?? String(reason)
    if (msg.includes('connToClose.close is not a function') || (reason?.stack ?? '').includes('@supabase/phoenix')) {
      console.warn('[supabase-phoenix] swallowed realtime teardown rejection:', msg)
      return
    }
    throw reason
  })
}

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
