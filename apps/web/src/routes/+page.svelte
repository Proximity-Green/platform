<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let { data } = $props()
  let session = $state(data.session)
  let checking = $state(true)
  let email = $state('')
  let password = $state('')
  let loginError = $state('')
  let accessDenied = $state(false)

  onMount(async () => {
    // Check if force_login param — sign out and show login
    const params = new URLSearchParams(window.location.search)
    if (params.get('force_login')) {
      await supabase.auth.signOut()
      window.history.replaceState({}, '', '/')
      checking = false
      return
    }

    const { data: { session: s } } = await supabase.auth.getSession()
    session = s
    checking = false

    if (s) {
      await checkAccess(s)
      return
    }

    supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === 'SIGNED_IN' && s) {
        session = s
        await checkAccess(s)
      }
    })
  })

  async function checkAccess(s: any) {
    // Check if user was invited (has invited_at) or has an approved domain
    const res = await fetch('/api/check-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: s.user.id, email: s.user.email })
    })
    const result = await res.json()

    if (result.allowed) {
      window.location.href = '/people'
    } else {
      accessDenied = true
      await supabase.auth.signOut()
      session = null
    }
  }

  async function signInWithGoogle() {
    loginError = ''
    accessDenied = false
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account'
        }
      }
    })
    if (error) loginError = error.message
  }

  async function signInWithPassword() {
    loginError = ''
    accessDenied = false
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      loginError = error.message
    }
  }
</script>

{#if checking}
  <div class="container"><p style="color: #5a7060;">Loading...</p></div>
{:else if session && !accessDenied}
  <div class="container"><p style="color: #5a7060;">Checking access...</p></div>
{:else}
  <div class="container">
    <div class="card">
      <h1>Proximity Green</h1>
      <p>Workspace Management Platform</p>

      {#if accessDenied}
        <div class="error">Access denied. You must be invited or use an approved email domain to sign in.</div>
      {/if}

      {#if loginError}
        <div class="error">{loginError}</div>
      {/if}

      <button onclick={signInWithGoogle} class="google-btn">Sign in with Google</button>

      <div class="divider"><span>or</span></div>

      <form onsubmit={(e) => { e.preventDefault(); signInWithPassword() }}>
        <input type="email" bind:value={email} placeholder="Email" required />
        <input type="password" bind:value={password} placeholder="Password" required />
        <button type="submit" class="email-btn">Sign in with Email</button>
      </form>
    </div>
  </div>
{/if}

<style>
  .container { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f7f4ee; font-family: system-ui, sans-serif; }
  .card { background: white; border: 1px solid #c8deca; border-radius: 12px; padding: 3rem; text-align: center; max-width: 400px; width: 100%; }
  h1 { color: #2d6a35; font-size: 1.8rem; margin-bottom: 0.5rem; }
  p { color: #5a7060; margin-bottom: 2rem; }
  .error { background: #fdecea; color: #c0392b; padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem; font-size: 0.85rem; }
  .google-btn { width: 100%; padding: 0.75rem; background: #2d6a35; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
  .google-btn:hover { background: #1e4d25; }
  .divider { display: flex; align-items: center; margin: 1.5rem 0; color: #5a7060; font-size: 0.85rem; }
  .divider::before, .divider::after { content: ''; flex: 1; border-bottom: 1px solid #c8deca; }
  .divider span { padding: 0 1rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; }
  input { padding: 0.6rem; border: 1px solid #c8deca; border-radius: 6px; font-size: 0.9rem; }
  .email-btn { padding: 0.75rem; background: #0a1f0f; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
  .email-btn:hover { background: #163320; }
</style>
