import { redirect } from '@sveltejs/kit'

export const load = async ({ locals, url }) => {
  const session = await locals.getSession()
  if (!session) {
    console.log(`[admin-gate] no session on ${url.pathname} → redirecting to /`)
    throw redirect(303, '/')
  }
  return { session }
}
