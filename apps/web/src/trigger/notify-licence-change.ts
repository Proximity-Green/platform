import { logger, task } from '@trigger.dev/sdk/v3'

const MAILGUN_DOMAIN = 'mg.proximity.green'
const TEST_REDIRECT_DEFAULT = 'testing@proximity.green'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  const clean = (v: string | undefined) => (v ?? '').replace(/\s+/g, '')
  return createClient(clean(process.env.PUBLIC_SUPABASE_URL), clean(process.env.SUPABASE_SERVICE_ROLE_KEY))
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const formData = new URLSearchParams()
  formData.append('from', 'Proximity Green <noreply@proximity.green>')
  formData.append('to', to)
  formData.append('subject', subject)
  formData.append('html', html)

  const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}` },
    body: formData
  })
  if (!res.ok) throw new Error(`Mailgun ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function replaceVariables(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
  }
  return result
}

export type LicenceChangeNotifyPayload = {
  /** Which template to load — 'licence-created' for new, 'licence-changed' for upgrade/downgrade. */
  event_kind: 'created' | 'changed'
  /** ID of the new licence row that triggered the event. */
  licence_id: string
  /** Optional — id of the old licence (changed kind only) for the "Was: ..." line. */
  old_licence_id?: string | null
}

/**
 * Email a member to confirm a licence event.
 *
 * Test-mode redirect: while admins are reviewing the workflow, every
 * licence email goes to a single inbox (LICENCE_EMAIL_REDIRECT env var,
 * default testing@proximity.green) instead of the actual member. The
 * subject is prefixed with "[would-go-to: <email> — <org>]" and a banner
 * inside the body shows the same — so the reviewer can see who'd have
 * received this in production. Disable by unsetting LICENCE_EMAIL_REDIRECT
 * (the empty string is treated as "no redirect").
 */
export const notifyLicenceChange = task({
  id: 'notify-licence-change',
  maxDuration: 60,
  run: async (payload: LicenceChangeNotifyPayload) => {
    const apiKey = process.env.MAILGUN_API_KEY ?? ''
    if (!apiKey) {
      logger.warn('notify-licence-change: MAILGUN_API_KEY missing — skipping')
      return { skipped: 'no_api_key' }
    }

    const supabase = await getSupabase()

    // ── Load the new licence + paired sub + member + item + org + location
    const { data: lic, error: licErr } = await supabase
      .from('licenses')
      .select(`
        id, started_at, organisation_id,
        items(name),
        locations(name, short_name, currency),
        persons:user_id(id, first_name, last_name, email),
        organisations:organisation_id(name)
      `)
      .eq('id', payload.licence_id)
      .maybeSingle()
    if (licErr || !lic) throw new Error(`licence ${payload.licence_id} not found: ${licErr?.message ?? '—'}`)

    const { data: sub } = await supabase
      .from('subscription_lines')
      .select('base_rate, currency')
      .eq('license_id', payload.licence_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── If this is a "changed" event, also load the old licence for the "Was: …" line
    let oldItemName = '—'
    let oldLocationName = '—'
    if (payload.event_kind === 'changed' && payload.old_licence_id) {
      const { data: oldLic } = await supabase
        .from('licenses')
        .select('id, items(name), locations(name, short_name)')
        .eq('id', payload.old_licence_id)
        .maybeSingle()
      if (oldLic) {
        oldItemName = (oldLic as any).items?.name ?? '—'
        oldLocationName = (oldLic as any).locations?.short_name
                       ?? (oldLic as any).locations?.name
                       ?? '—'
      }
    }

    // ── Resolve the template
    const slug = payload.event_kind === 'created' ? 'licence-created' : 'licence-changed'
    const { data: template } = await supabase
      .from('message_templates')
      .select('subject, html_body')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()
    if (!template) throw new Error(`Template "${slug}" not found in message_templates`)

    // ── Build variables
    const member = (lic as any).persons
    const memberEmail = member?.email as string | null
    const memberFirstName = (member?.first_name as string | null) ?? 'there'
    const memberFullName = `${member?.first_name ?? ''} ${member?.last_name ?? ''}`.trim() || 'member'
    const orgName = (lic as any).organisations?.name ?? 'your organisation'
    const locationName = (lic as any).locations?.short_name ?? (lic as any).locations?.name ?? '—'
    const newItemName = (lic as any).items?.name ?? '—'
    const currency = sub?.currency ?? (lic as any).locations?.currency ?? 'ZAR'
    const newRate = (sub?.base_rate ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })
    const effectiveAt = (lic.started_at as string ?? '').slice(0, 10)

    // ── Test-mode redirect (default ON for now). Override via env var.
    const redirectTo = (process.env.LICENCE_EMAIL_REDIRECT ?? TEST_REDIRECT_DEFAULT).trim()
    const redirectActive = redirectTo.length > 0
    const trueRecipient = memberEmail ?? '(no member email on record)'
    const recipient = redirectActive ? redirectTo : (memberEmail ?? '')

    if (!recipient) {
      logger.warn('notify-licence-change: no recipient (no redirect, no member email) — skipping')
      return { skipped: 'no_recipient' }
    }

    const redirectBanner = redirectActive
      ? `<div style="background:#fef3c7;padding:10px 14px;border-radius:6px;font-size:12px;color:#78350f;margin-bottom:16px">
           <strong>TEST MODE</strong> — would go to <strong>${escapeHtml(memberFullName)}</strong> &lt;${escapeHtml(trueRecipient)}&gt; at ${escapeHtml(orgName)}.
         </div>`
      : ''

    const vars: Record<string, string> = {
      member_first_name: memberFirstName,
      old_item_name: oldItemName,
      old_location_name: oldLocationName,
      new_item_name: newItemName,
      location_name: locationName,
      org_name: orgName,
      effective_at: effectiveAt,
      currency,
      new_rate: newRate,
      redirect_banner: redirectBanner
    }

    const baseSubject = replaceVariables(template.subject, vars)
    const subject = redirectActive
      ? `[would-go-to: ${trueRecipient} — ${orgName}] ${baseSubject}`.slice(0, 200)
      : baseSubject
    const html = replaceVariables(template.html_body ?? '', vars)

    // ── Send + breadcrumb
    let mailgunResult: any = null
    try {
      mailgunResult = await sendEmail(apiKey, recipient, subject, html)
      logger.log('notify-licence-change: sent', { to: recipient, slug, intended: trueRecipient })
    } catch (e: any) {
      logger.error('notify-licence-change: send failed', { error: e?.message })
      throw e
    }

    try {
      await supabase.from('system_logs').insert({
        category: 'email',
        level: 'success',
        message: `Licence ${payload.event_kind}: ${recipient}${redirectActive ? ` (redirected from ${trueRecipient})` : ''}`,
        details: {
          template: slug,
          to: recipient,
          intended_recipient: trueRecipient,
          redirect_active: redirectActive,
          licence_id: payload.licence_id,
          old_licence_id: payload.old_licence_id ?? null,
          mailgun_message_id: mailgunResult?.id
        }
      })
    } catch { /* don't fail the task on audit log write */ }

    return {
      sent: true,
      recipient,
      redirect_active: redirectActive,
      intended_recipient: trueRecipient,
      mailgun_message_id: mailgunResult?.id
    }
  }
})
