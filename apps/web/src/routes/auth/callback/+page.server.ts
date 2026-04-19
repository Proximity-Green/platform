import { redirect } from '@sveltejs/kit'

export const load = async ({ url, locals }) => {
  const code = url.searchParams.get('code')
  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Auth callback error:', error.message)
      return { error: error.message }
    }
  }
  redirect(303, '/people')
}
