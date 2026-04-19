<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let status = $state('Authenticating...')

  onMount(async () => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        // PKCE verifier missing — the session might already be set via hash
        // Try getting session directly
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          window.location.href = '/people'
          return
        }
        status = `Authentication error. Please try signing in again.`
        setTimeout(() => { window.location.href = '/' }, 2000)
        return
      }
    }

    // Check for hash fragment (implicit flow fallback)
    if (window.location.hash) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        window.location.href = '/people'
        return
      }
    }

    // Success or already authenticated
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      window.location.href = '/people'
    } else {
      status = 'No session found. Redirecting...'
      setTimeout(() => { window.location.href = '/' }, 2000)
    }
  })
</script>

<div style="text-align: center; padding: 4rem; font-family: system-ui; color: #5a7060;">
  {status}
</div>
