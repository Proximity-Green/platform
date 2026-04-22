<script lang="ts">
  import { supabase } from '$lib/supabase'
  import { onMount } from 'svelte'

  let status = $state('Authenticating...')

  onMount(async () => {
    // The PKCE code comes as ?code= param
    const code = new URLSearchParams(window.location.search).get('code')

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (data.session) {
        window.location.href = '/admin'
        return
      }
      // If exchange failed, the code might have been consumed already
      // Check if we have a session anyway
    }

    // Check for hash fragment (fallback)
    if (window.location.hash && window.location.hash.includes('access_token')) {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      if (accessToken && refreshToken) {
        const { data } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (data.session) {
          window.location.href = '/admin'
          return
        }
      }
    }

    // Maybe session already exists from cookies
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      window.location.href = '/admin'
      return
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe()
        window.location.href = '/admin'
      }
    })

    // Timeout
    setTimeout(() => {
      subscription.unsubscribe()
      status = 'Could not sign in. Redirecting...'
      setTimeout(() => { window.location.href = '/' }, 2000)
    }, 5000)
  })
</script>

<div style="text-align: center; padding: 4rem; font-family: system-ui; color: #5a7060;">
  {status}
</div>
