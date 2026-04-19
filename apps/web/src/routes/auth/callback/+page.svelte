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
        status = `Authentication failed: ${error.message}`
        return
      }
    }

    // Session is now set client-side — sync to server by navigating
    // The hooks.server.ts will pick up the session cookies on next request
    window.location.href = '/people'
  })
</script>

<div style="text-align: center; padding: 4rem; font-family: system-ui; color: #5a7060;">
  {status}
</div>
