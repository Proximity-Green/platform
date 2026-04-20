import { logger, task } from "@trigger.dev/sdk/v3";

const MAILGUN_DOMAIN = 'mg.proximity.green'

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const formData = new URLSearchParams()
  formData.append('from', 'Proximity Green <noreply@proximity.green>')
  formData.append('to', to)
  formData.append('subject', subject)
  formData.append('html', html)

  const response = await fetch(
    `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`
      },
      body: formData
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mailgun error (${response.status}): ${text}`)
  }

  const result = await response.json()
  const messageId = result.id?.replace(/[<>]/g, '') ?? null
  const mailgunLogUrl = `https://app.mailgun.com/app/sending/domains/${MAILGUN_DOMAIN}/logs`

  return { ...result, messageId, mailgunLogUrl }
}

function replaceVariables(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
  }
  return result
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

async function logToSystem(category: string, level: string, message: string, details: any) {
  try {
    const supabase = await getSupabase()
    await supabase.from('system_logs').insert({ category, level, message, details })
  } catch (e) {
    logger.error("Failed to log to system_logs", { error: String(e) })
  }
}

export const sendWelcomeEmail = task({
  id: "send-welcome-email",
  maxDuration: 60,
  run: async (payload: {
    email: string
    firstName: string
    lastName: string
    invitedBy: string
    inviteUrl?: string
  }) => {
    const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ''
    if (!MAILGUN_API_KEY) throw new Error('MAILGUN_API_KEY not set')

    logger.log("Sending welcome email", { payload })

    // Load template from database
    const supabase = await getSupabase()
    const { data: template } = await supabase
      .from('message_templates')
      .select('subject, html_body')
      .eq('slug', 'welcome-member')
      .single()

    if (!template) throw new Error('Template "welcome-member" not found in message_templates')

    // Replace variables
    const vars: Record<string, string> = {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      invitedBy: payload.invitedBy,
      inviteUrl: payload.inviteUrl || 'https://poc.proximity.green',
      appUrl: 'https://poc.proximity.green'
    }

    const subject = replaceVariables(template.subject, vars)
    const html = replaceVariables(template.html_body, vars)

    // Send via Mailgun
    const welcomeResult = await sendEmail(MAILGUN_API_KEY, payload.email, subject, html)

    logger.log("Welcome email sent", { messageId: welcomeResult.messageId })

    // Check delivery status after delay
    let deliveryStatus = 'accepted'
    try {
      await new Promise(r => setTimeout(r, 8000))
      const eventsRes = await fetch(
        `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/events?message-id=${welcomeResult.messageId}&limit=5`,
        { headers: { 'Authorization': `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}` } }
      )
      if (eventsRes.ok) {
        const events = await eventsRes.json()
        const delivered = events.items?.find((e: any) => e.event === 'delivered')
        const failed = events.items?.find((e: any) => e.event === 'failed')
        if (delivered) deliveryStatus = 'delivered'
        else if (failed) deliveryStatus = 'failed'
        else if (events.items?.length > 0) deliveryStatus = events.items[0].event
      }
    } catch {}

    await logToSystem('email',
      deliveryStatus === 'delivered' || deliveryStatus === 'accepted' ? 'success' : 'error',
      `Welcome email ${deliveryStatus}: ${payload.email}`, {
        to: payload.email,
        type: 'welcome_email',
        source: 'mailgun',
        via: 'trigger',
        template: 'welcome-member',
        mailgun_status: deliveryStatus,
        mailgun_message_id: welcomeResult.messageId,
        mailgun_url: welcomeResult.mailgunLogUrl
      })

    return {
      success: true,
      welcomeMessageId: welcomeResult.messageId,
      mailgunUrl: welcomeResult.mailgunLogUrl,
      deliveryStatus,
      to: payload.email
    }
  },
});
