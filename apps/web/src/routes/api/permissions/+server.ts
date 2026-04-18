import { json } from '@sveltejs/kit'
import { getUserPermissions } from '$lib/server/permissions'

export const POST = async ({ request }) => {
  const { userId } = await request.json()
  if (!userId) return json({ role: null, permissions: [] })

  const perms = await getUserPermissions(userId)
  return json(perms)
}
