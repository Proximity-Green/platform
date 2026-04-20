import { createClient } from '@supabase/supabase-js'
import { json } from '@sveltejs/kit'
import { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/env'

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export const POST = async ({ request }) => {
  const { userId, email } = await request.json()

  if (!email) return json({ allowed: false })

  const domain = email.split('@')[1]

  // Check 1: Is the domain approved?
  const { data: approvedDomain } = await supabase
    .from('approved_domains')
    .select('id')
    .eq('domain', domain)
    .single()

  if (approvedDomain) return json({ allowed: true })

  // Check 2: Was the user invited?
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const user = users?.find(u => u.id === userId)

  if (user?.invited_at) return json({ allowed: true })

  // Not allowed — delete the unauthorized user
  await supabase.auth.admin.deleteUser(userId)

  return json({ allowed: false })
}
