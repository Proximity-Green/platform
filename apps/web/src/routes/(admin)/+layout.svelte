<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let { children, data } = $props()
  let session = $state(data.session)
  let checking = $state(true)

  onMount(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    session = s
    checking = false

    supabase.auth.onAuthStateChange((_event, s) => {
      session = s
      if (!s) window.location.href = '/'
    })
  })

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }
</script>

{#if checking}
  <div style="text-align: center; padding: 4rem; font-family: system-ui; color: #5a7060;">Loading...</div>
{:else if session}
  <div style="font-family: system-ui, sans-serif;">
    <header style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: #0a1f0f; color: #a8d5b0;">
      <a href="/" style="color: #4caf64; text-decoration: none; font-weight: 600; font-size: 1.1rem;">Proximity Green</a>
      <nav style="display: flex; gap: 1.5rem; align-items: center;">
        <a href="/people" style="color: #a8d5b0; text-decoration: none;">People</a>
        <a href="/organisations" style="color: #a8d5b0; text-decoration: none;">Organisations</a>
        <span style="color: #5a7060; font-size: 0.85rem;">{session.user.email}</span>
        <button onclick={signOut} style="padding: 0.35rem 0.75rem; background: #2d6a35; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Sign Out</button>
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
