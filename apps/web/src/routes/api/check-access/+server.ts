import { createClient } from '@supabase/supabase-js'
import { json } from '@sveltejs/kit'
import { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/env'

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function keyFingerprint(k: string): string {
  if (!k) return 'EMPTY'
  const dots = (k.match(/\./g) || []).length
  const nonPrintable = Array.from(k).filter(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126).length
  const hasSpace = k.includes(' ')
  const parts = k.split('.')
  let payloadDecoded = 'n/a'
  try {
    if (parts[1]) {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      payloadDecoded = Buffer.from(b64, 'base64').toString('utf8')
    }
  } catch (e) {
    payloadDecoded = `decode-error: ${(e as Error).message}`
  }
  const charCodes = Array.from(k.slice(115, 125)).map(c => c.charCodeAt(0)).join(',')
  return `len=${k.length} dots=${dots} nonPrintable=${nonPrintable} hasSpace=${hasSpace} | head=${k.slice(0, 40)} | mid115-125-codes=[${charCodes}] | tail=${k.slice(-20)} | payload=${payloadDecoded}`
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
