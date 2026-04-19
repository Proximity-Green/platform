<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let password = $state('')
  let confirmPassword = $state('')
  let error = $state('')
  let success = $state(false)
  let loading = $state(true)
  let userEmail = $state('')

  onMount(async () => {
    // If there's a hash fragment with access_token, this is an invite callback
    // Sign out current user first so the invite token takes over
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      await supabase.auth.signOut()
      // Small delay to let signout complete
      await new Promise(r => setTimeout(r, 500))
    }

    // Now listen for the auth state change from the hash token
    supabase.auth.onAuthStateChange((event, s) => {
      if (s) {
        userEmail = s.user.email ?? ''
        loading = false
      }
    })

    // Also check current session (in case already processed)
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s) {
      userEmail = s.user.email ?? ''
      loading = false
    }

    // Timeout — if still loading after 5s, show error
    setTimeout(() => {
      if (loading) {
        loading = false
        error = 'Could not verify invitation. The link may have expired.'
      }
    }, 5000)
  })

  async function setPassword() {
    error = ''
    if (password.length < 8) {
      error = 'Password must be at least 8 characters'
      return
    }
    if (password !== confirmPassword) {
      error = 'Passwords do not match'
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      error = updateError.message
    } else {
      success = true
      setTimeout(() => { window.location.href = '/' }, 2000)
    }
  }
</script>

<div class="container">
  <div class="card">
    <h1>Proximity Green</h1>

    {#if loading}
      <p>Verifying your invitation...</p>
    {:else if success}
      <div class="success">Password set successfully. Redirecting...</div>
    {:else if userEmail}
      <p>Welcome, <strong>{userEmail}</strong>. Set your password to complete setup.</p>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); setPassword() }}>
        <input type="password" bind:value={password} placeholder="New password" required minlength="8" />
        <input type="password" bind:value={confirmPassword} placeholder="Confirm password" required />
        <button type="submit">Set Password</button>
      </form>
    {:else if error}
      <div class="error">{error}</div>
      <a href="/" class="link">Back to home</a>
    {:else}
      <p>Invalid or expired invitation link. Please ask your administrator for a new invite.</p>
      <a href="/" class="link">Back to home</a>
    {/if}
  </div>
</div>

<style>
  .container { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f7f4ee; font-family: system-ui, sans-serif; }
  .card { background: white; border: 1px solid #c8deca; border-radius: 12px; padding: 3rem; text-align: center; max-width: 400px; width: 100%; }
  h1 { color: #2d6a35; font-size: 1.8rem; margin-bottom: 1rem; }
  p { color: #5a7060; margin-bottom: 1.5rem; font-size: 0.95rem; }
  .error { background: #fdecea; color: #c0392b; padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem; font-size: 0.85rem; }
  .success { background: #e8f5ea; color: #2d6a35; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; }
  input { padding: 0.6rem; border: 1px solid #c8deca; border-radius: 6px; font-size: 0.9rem; }
  button { padding: 0.75rem; background: #2d6a35; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
  button:hover { background: #1e4d25; }
  .link { color: #2d6a35; text-decoration: none; }
</style>
