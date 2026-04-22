<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let { data } = $props()
  let session = $state(data.session)
  let checking = $state(true)
  let email = $state('')
  let password = $state('')
  let showPassword = $state(false)
  let loginError = $state('')
  let accessDenied = $state(false)

  function fillCheatCreds() {
    email = 'mark@proximity.green'
    password = 'Applemac123'
  }

  onMount(async () => {
    // Check if force_login param — sign out and show login
    const params = new URLSearchParams(window.location.search)
    if (params.get('force_login')) {
      await supabase.auth.signOut()
      session = null
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

  let debugInfo = $state<string>('')

  async function checkAccess(s: any) {
    const res = await fetch('/api/check-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: s.user.id, email: s.user.email })
    })
    const result = await res.json()
    debugInfo = `[check-access] status=${res.status} email=${s.user.email}\n${JSON.stringify(result, null, 2)}`
    console.log(debugInfo)

    if (result.allowed) {
      window.location.href = '/admin'
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

      {#if debugInfo}
        <pre class="debug">{debugInfo}</pre>
      {/if}

      <button onclick={signInWithGoogle} class="google-btn">Sign in with Google</button>

      <div class="divider"><span>or</span></div>

      <form onsubmit={(e) => { e.preventDefault(); signInWithPassword() }}>
        <input type="email" bind:value={email} placeholder="Email" required />
        <div class="pw-row">
          <input
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            placeholder="Password"
            required
          />
          <button type="button" class="pw-toggle" onclick={() => showPassword = !showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <button type="submit" class="email-btn">Sign in with Email</button>
      </form>
    </div>
  </div>

  <button type="button" class="cheat-floating" onclick={fillCheatCreds} title="·">§</button>
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

  .pw-row { display: flex; gap: 0.5rem; align-items: stretch; }
  .pw-row input { flex: 1; }
  .pw-toggle {
    padding: 0 0.75rem;
    border: 1px solid #c8deca;
    background: #f7f4ee;
    color: #5a7060;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    min-width: 56px;
  }
  .pw-toggle:hover { background: #ece7dd; }

  .cheat-floating {
    position: fixed;
    bottom: 10px;
    right: 10px;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    border: 1px solid #d0d8cf;
    color: #b9c4ba;
    font-size: 11px;
    font-family: Georgia, serif;
    line-height: 1;
    cursor: pointer;
    z-index: 100;
    opacity: 0.45;
    transition: opacity 160ms, color 160ms, border-color 160ms;
  }
  .cheat-floating:hover {
    opacity: 0.9;
    color: #5a7060;
    border-color: #5a7060;
  }

  .debug {
    background: #f1eee6;
    color: #3a4a3c;
    border: 1px solid #c8deca;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    margin-bottom: 1rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    text-align: left;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 320px;
    overflow: auto;
  }
</style>
