import { createClient } from '@supabase/supabase-js'
import { json } from '@sveltejs/kit'
import { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/env'

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export const POST = async ({ request }) => {
  const { userId, email } = await request.json()

  if (!email) {
    console.log('[check-access] denied: no email')
    return json({ allowed: false })
  }

  const domain = email.split('@')[1]

  // Check 1: Is the domain approved?
  const { data: approvedDomain, error: domainErr } = await supabase
    .from('approved_domains')
    .select('id')
    .eq('domain', domain)
    .maybeSingle()

  if (domainErr) {
    console.log('[check-access] domain query error:', domainErr.message)
  }

  if (approvedDomain) {
    console.log(`[check-access] allowed: ${email} (domain ${domain} whitelisted)`)
    return json({ allowed: true })
  }

  // Check 2: Was the user invited? Use getUserById (not listUsers — which paginates)
  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)

  if (userErr) {
    console.log('[check-access] getUserById error:', userErr.message)
    return json({ allowed: false })
  }

  if (userData?.user?.invited_at) {
    console.log(`[check-access] allowed: ${email} (invited at ${userData.user.invited_at})`)
    return json({ allowed: true })
  }

  // Not allowed — deny silently. (Previously deleted the user here, which caused
  // a cascade: every retry re-created the user, re-checked, re-deleted. Now we just
  // sign them out client-side and leave the auth row alone so an admin can inspect.)
  console.log(`[check-access] denied: ${email} (no matching whitelist or invite) — user NOT deleted`)

  return json({ allowed: false })
}
