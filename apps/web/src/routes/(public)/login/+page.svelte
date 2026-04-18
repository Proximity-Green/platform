<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  onMount(async () => {
    // Check if we already have a session from the hash fragment
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      window.location.href = '/people'
    }

    // Listen for auth state changes (handles the hash fragment)
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.location.href = '/people'
      }
    })
  })

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`
      }
    })
    if (error) console.error('Login error:', error.message)
  }
</script>

<div class="login-container">
  <div class="login-card">
    <h1>Proximity Green</h1>
    <p>Workspace Management Platform</p>
    <button onclick={signInWithGoogle} class="google-btn">
      Sign in with Google
    </button>
  </div>
</div>

<style>
  .login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f7f4ee; font-family: system-ui, sans-serif; }
  .login-card { background: white; border: 1px solid #c8deca; border-radius: 12px; padding: 3rem; text-align: center; max-width: 400px; width: 100%; }
  h1 { color: #2d6a35; font-size: 1.8rem; margin-bottom: 0.5rem; }
  p { color: #5a7060; margin-bottom: 2rem; }
  .google-btn { width: 100%; padding: 0.75rem; background: #2d6a35; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
  .google-btn:hover { background: #1e4d25; }
</style>
