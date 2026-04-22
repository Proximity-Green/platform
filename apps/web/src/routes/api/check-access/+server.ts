import { createClient } from '@supabase/supabase-js'
import { json } from '@sveltejs/kit'
import { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/env'

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function keyFingerprint(k: string): string {
  if (!k) return 'EMPTY'
  return `len=${k.length} head=${k.slice(0, 12)} tail=${k.slice(-8)}`
}

export const POST = async ({ request }) => {
  const { userId, email } = await request.json()

  const debug: Record<string, unknown> = {
    url: PUBLIC_SUPABASE_URL || 'EMPTY',
    serviceKey: keyFingerprint(SUPABASE_SERVICE_ROLE_KEY)
  }

  if (!email) {
    return json({ allowed: false, reason: 'no email', debug })
  }

  const domain = email.split('@')[1]
  debug.domain = domain

  const { data: approvedDomain, error: domainErr } = await supabase
    .from('approved_domains')
    .select('id')
    .eq('domain', domain)
    .maybeSingle()

  debug.domainQuery = domainErr ? { error: domainErr.message } : { rowFound: !!approvedDomain }

  if (approvedDomain) {
    return json({ allowed: true, reason: 'domain whitelisted', debug })
  }

  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)
  debug.getUserById = userErr ? { error: userErr.message } : { invitedAt: userData?.user?.invited_at ?? null }

  if (userErr) {
    return json({ allowed: false, reason: 'getUserById failed', debug })
  }

  if (userData?.user?.invited_at) {
    return json({ allowed: true, reason: 'invited', debug })
  }

  return json({ allowed: false, reason: 'no whitelist or invite', debug })
}
