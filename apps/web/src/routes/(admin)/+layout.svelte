<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let { children, data } = $props()
  let session = $state(data.session)
  let checking = $state(true)
  let impersonating = $state<any>(null)

  onMount(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    session = s
    checking = false

    // Check impersonation cookie
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('impersonating='))
    if (cookie) {
      try {
        impersonating = JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('=')))
      } catch {}
    }

    supabase.auth.onAuthStateChange((_event, s) => {
      session = s
      if (!s) window.location.href = '/'
    })
  })

  async function signOut() {
    if (impersonating) await stopImpersonating()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  async function stopImpersonating() {
    await fetch('/api/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    })
    impersonating = null
    window.location.reload()
  }
</script>

{#if checking}
  <div style="text-align: center; padding: 4rem; font-family: system-ui; color: #5a7060;">Loading...</div>
{:else if session}
  <div style="font-family: system-ui, sans-serif;">
    {#if impersonating}
      <div class="impersonation-banner">
        Viewing as <strong>{impersonating.targetName}</strong> ({impersonating.targetEmail})
        <button onclick={stopImpersonating}>Exit Impersonation</button>
      </div>
    {/if}
    <header class="nav-bar">
      <a href="/" class="brand">Proximity Green</a>
      <nav>
        <a href="/people">People</a>
        <a href="/organisations">Organisations</a>
        <a href="/users">Users</a>
        <a href="/roles">Roles</a>
        <span class="user-email">{session.user.email}</span>
        <button onclick={signOut} class="sign-out">Sign Out</button>
      </nav>
    </header>
    {@render children()}
  </div>
{:else}
  <div style="text-align: center; padding: 4rem; font-family: system-ui;">
    <p>You need to sign in.</p>
    <a href="/" style="color: #2d6a35;">Sign In</a>
  </div>
{/if}

<style>
  .impersonation-banner {
    background: #c0392b; color: white; text-align: center; padding: 0.5rem 1rem;
    font-size: 0.85rem; display: flex; justify-content: center; align-items: center; gap: 1rem;
  }
  .impersonation-banner button {
    background: white; color: #c0392b; border: none; padding: 0.3rem 0.75rem;
    border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600;
  }
  .nav-bar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 1rem 2rem; background: #0a1f0f; color: #a8d5b0;
  }
  .brand { color: #4caf64; text-decoration: none; font-weight: 600; font-size: 1.1rem; }
  nav { display: flex; gap: 1.5rem; align-items: center; }
  nav a { color: #a8d5b0; text-decoration: none; }
  .user-email { color: #5a7060; font-size: 0.85rem; }
  .sign-out {
    padding: 0.35rem 0.75rem; background: #2d6a35; color: white;
    border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;
  }
</style>
