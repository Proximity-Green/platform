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

  return await response.json()
}

export const sendWelcomeEmail = task({
  id: "send-welcome-email",
  maxDuration: 60,
  run: async (payload: {
    email: string
    firstName: string
    lastName: string
    invitedBy: string
  }) => {
    const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ''
    if (!MAILGUN_API_KEY) throw new Error('MAILGUN_API_KEY not set')

    logger.log("Sending welcome email", { payload });

    // 1. Send welcome email to the invited person
    const welcomeResult = await sendEmail(
      MAILGUN_API_KEY,
      payload.email,
      `Welcome to Proximity Green, ${payload.firstName}!`,
      `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <div style="background: #0a1f0f; color: #a8d5b0; padding: 2rem; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #4caf64; margin: 0; font-size: 1.5rem;">Proximity Green</h1>
          <p style="margin: 0.5rem 0 0; color: #a8d5b0; font-size: 0.9rem;">Workspace Management Platform</p>
        </div>
        <div style="background: white; border: 1px solid #c8deca; border-top: none; border-radius: 0 0 12px 12px; padding: 2rem;">
          <h2 style="color: #0a1f0f; margin: 0 0 1rem;">Welcome, ${payload.firstName}!</h2>
          <p style="color: #5a7060; line-height: 1.6;">
            You've been invited to join Proximity Green by <strong>${payload.invitedBy}</strong>.
          </p>
          <p style="color: #5a7060; line-height: 1.6;">
            You should have received a separate email with a link to set up your account.
            Once you've set your password, you can sign in at:
          </p>
          <div style="text-align: center; margin: 1.5rem 0;">
            <a href="https://poc.proximity.green" style="background: #2d6a35; color: white; padding: 0.75rem 2rem; border-radius: 6px; text-decoration: none; font-weight: 500;">
              Sign In to Proximity Green
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e8f5ea; margin: 1.5rem 0;" />
          <p style="color: #5a7060; font-size: 0.75rem; text-align: center;">
            Proximity Green — Workspace Management Platform
          </p>
        </div>
      </div>
    `)

    logger.log("Welcome email sent", { messageId: welcomeResult.id })

    // 2. Notify all admins and super admins
    // Get admin emails from Supabase
    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Get admin and super_admin role IDs
        const { data: adminRoles } = await supabase
          .from('roles')
          .select('id')
          .in('name', ['admin', 'super_admin'])

        if (adminRoles && adminRoles.length > 0) {
          const roleIds = adminRoles.map(r => r.id)
          const { data: adminUserRoles } = await supabase
            .from('user_roles')
            .select('user_id')
            .in('role_id', roleIds)

          if (adminUserRoles && adminUserRoles.length > 0) {
            const { data: { users } } = await supabase.auth.admin.listUsers()
            const adminEmails = users
              ?.filter(u => adminUserRoles.some(aur => aur.user_id === u.id))
              .map(u => u.email)
              .filter(Boolean) ?? []

            for (const adminEmail of adminEmails) {
              try {
                await sendEmail(
                  MAILGUN_API_KEY,
                  adminEmail!,
                  `New member invited: ${payload.firstName} ${payload.lastName}`,
                  `
                  <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
                    <div style="background: #0a1f0f; padding: 1.5rem; border-radius: 12px 12px 0 0; text-align: center;">
                      <h1 style="color: #4caf64; margin: 0; font-size: 1.2rem;">Proximity Green</h1>
                    </div>
                    <div style="background: white; border: 1px solid #c8deca; border-top: none; border-radius: 0 0 12px 12px; padding: 2rem;">
                      <h2 style="color: #0a1f0f; margin: 0 0 1rem; font-size: 1.1rem;">New Member Invited</h2>
                      <table style="width: 100%; font-size: 0.9rem; color: #5a7060;">
                        <tr><td style="padding: 0.3rem 0; font-weight: 500;">Name:</td><td>${payload.firstName} ${payload.lastName}</td></tr>
                        <tr><td style="padding: 0.3rem 0; font-weight: 500;">Email:</td><td>${payload.email}</td></tr>
                        <tr><td style="padding: 0.3rem 0; font-weight: 500;">Invited by:</td><td>${payload.invitedBy}</td></tr>
                        <tr><td style="padding: 0.3rem 0; font-weight: 500;">Role:</td><td>Member</td></tr>
                      </table>
                      <div style="text-align: center; margin: 1.5rem 0;">
                        <a href="https://poc.proximity.green/users" style="background: #2d6a35; color: white; padding: 0.5rem 1.5rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem;">
                          View Users
                        </a>
                      </div>
                    </div>
                  </div>
                `)
                logger.log("Admin notified", { adminEmail })
              } catch (e) {
                logger.error("Failed to notify admin", { adminEmail, error: String(e) })
              }
            }
          }
        }
      } catch (e) {
        logger.error("Failed to fetch admin list", { error: String(e) })
      }
    }

    return {
      success: true,
      welcomeMessageId: welcomeResult.id,
      to: payload.email
    }
  },
});
