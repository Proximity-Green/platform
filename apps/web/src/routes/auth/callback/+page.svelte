<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let status = $state('Authenticating...')

  onMount(async () => {
    // Try exchanging code if present
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      await supabase.auth.exchangeCodeForSession(code)
    }

    // Try getting session from hash fragment
    if (window.location.hash && window.location.hash.includes('access_token')) {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      }
    }

    // Check if we have a session now
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      window.location.href = '/people'
      return
    }

    // Wait a moment and try again — session might be setting
    await new Promise(r => setTimeout(r, 1000))
    const { data: { session: s2 } } = await supabase.auth.getSession()
    if (s2) {
      window.location.href = '/people'
      return
    }

    status = 'Authentication error. Redirecting...'
    setTimeout(() => { window.location.href = '/' }, 2000)
  })
</script>

<div style="text-align: center; padding: 4rem; font-family: system-ui; color: #5a7060;">
  {status}
</div>
