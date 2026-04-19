<script lang="ts">
  import { page } from '$app/state'
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let userEmail = $state('')
  let userRole = $state('')
  let requiredPerm = $state('')

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    userEmail = session?.user?.email ?? ''

    // Check impersonation
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('impersonating='))
    if (cookie) {
      try {
        const imp = JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('=')))
        userEmail = imp.targetEmail
        userRole = imp.targetRole
      } catch {}
    }

    // Extract permission from error message
    const msg = page.error?.message ?? ''
    const match = msg.match(/permission to (\w+) (\w+)/)
    if (match) requiredPerm = `${match[2]}:${match[1]}`

    // Get role from permissions API if not impersonating
    if (!userRole && session) {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.id })
      })
      const perms = await res.json()
      userRole = perms.role ?? 'no role'
    }
  })
</script>

<div class="error-container">
  <div class="error-card">
    <div class="error-code">{page.status}</div>
    {#if page.status === 403}
      <h1>Access Denied</h1>
      <p>{page.error?.message || 'You do not have permission to access this page.'}</p>
      <div class="role-info">
        <div class="role-row"><span>User:</span> <strong>{userEmail}</strong></div>
        <div class="role-row"><span>Current role:</span> <strong>{userRole || 'loading...'}</strong></div>
        {#if requiredPerm}
          <div class="role-row"><span>Required permission:</span> <code>{requiredPerm}</code></div>
        {/if}
      </div>
      <p class="hint">Your current role does not include the required permissions. Contact an administrator if you need access.</p>
    {:else if page.status === 404}
      <h1>Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
    {:else}
      <h1>Something Went Wrong</h1>
      <p>{page.error?.message || 'An unexpected error occurred.'}</p>
    {/if}
    <a href="/people" class="back-btn">Back to Dashboard</a>
  </div>
</div>

<style>
  .error-container { display: flex; justify-content: center; align-items: center; min-height: 60vh; font-family: system-ui, sans-serif; }
  .error-card { text-align: center; max-width: 480px; padding: 3rem; }
  .error-code { font-size: 4rem; font-weight: 800; color: #c8deca; font-family: monospace; margin-bottom: 0.5rem; }
  h1 { font-size: 1.5rem; color: #0a1f0f; margin-bottom: 0.75rem; }
  p { color: #5a7060; line-height: 1.6; margin-bottom: 0.5rem; }
  .role-info { background: #f7f4ee; border: 1px solid #c8deca; border-radius: 8px; padding: 1rem; margin: 1.5rem 0; text-align: left; }
  .role-row { display: flex; justify-content: space-between; padding: 0.3rem 0; font-size: 0.85rem; color: #5a7060; }
  .role-row code { background: #e8f5ea; color: #2d6a35; padding: 1px 6px; border-radius: 3px; font-size: 0.8rem; }
  .hint { font-size: 0.85rem; color: #c8832a; background: #fdf3e3; padding: 0.75rem 1rem; border-radius: 6px; margin-top: 1rem; }
  .back-btn { display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.5rem; background: #2d6a35; color: white; border-radius: 6px; text-decoration: none; font-size: 0.9rem; }
  .back-btn:hover { background: #1e4d25; }
</style>
