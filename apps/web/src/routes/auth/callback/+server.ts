import { redirect } from '@sveltejs/kit'

export const GET = async ({ url, locals }) => {
  const code = url.searchParams.get('code')
  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Auth callback error:', error.message)
    }
  }

  // After exchangeCodeForSession, the cookies should be set by the SSR client
  // Redirect to home which will detect the session
  redirect(303, '/people')
}
