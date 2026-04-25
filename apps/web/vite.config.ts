import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Install at Node boot, before any user module loads. The
// @supabase/phoenix realtime client throws an unhandled
// `TypeError: connToClose.close is not a function` from a fire-and-forget
// disconnect when a channel is removed before its socket finished
// initialising. The throw escapes node's promise chain and would kill
// the dev server. Until upstream ships a fix, log and keep running.
function isPhoenixCrash(err: any): boolean {
  const msg = err?.message ?? String(err)
  const stack = err?.stack ?? ''
  return (
    msg.includes('connToClose.close is not a function') ||
    stack.includes('@supabase/phoenix') ||
    stack.includes('@supabase/realtime-js')
  )
}

if (typeof process !== 'undefined' && !(globalThis as any).__phoenixGuardInstalled) {
  ;(globalThis as any).__phoenixGuardInstalled = true
  process.on('uncaughtException', (err: any) => {
    if (isPhoenixCrash(err)) {
      console.warn('[supabase-phoenix] swallowed realtime teardown error:', err?.message ?? err)
      return
    }
    throw err
  })
  process.on('unhandledRejection', (reason: any) => {
    if (isPhoenixCrash(reason)) {
      console.warn('[supabase-phoenix] swallowed realtime teardown rejection:', reason?.message ?? reason)
      return
    }
    throw reason
  })
}

export default defineConfig({
	plugins: [sveltekit()]
});
