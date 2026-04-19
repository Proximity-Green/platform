import { json } from '@sveltejs/kit'
import { getActualUserId, getUserIdFromRequest } from '$lib/server/permissions'

export const GET = async ({ cookies, locals }) => {
  const allCookies = cookies.getAll()
  const authCookies = allCookies.filter((c: any) => c.name.includes('sb-') || c.name.includes('auth'))

  const session = await locals.getSession()
  const actualUserId = await getActualUserId(locals)
  const effectiveUserId = await getUserIdFromRequest(locals, cookies)

  return json({
    cookieNames: authCookies.map((c: any) => ({ name: c.name, valueLength: c.value?.length, valueStart: c.value?.substring(0, 30) })),
    sessionUserId: session?.user?.id ?? null,
    sessionEmail: session?.user?.email ?? null,
    actualUserId,
    effectiveUserId
  })
}
