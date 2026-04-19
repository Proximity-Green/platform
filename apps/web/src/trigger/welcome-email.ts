import { logger, task } from "@trigger.dev/sdk/v3";

export const sendWelcomeEmail = task({
  id: "send-welcome-email",
  maxDuration: 60,
  run: async (payload: {
    email: string
    firstName: string
    lastName: string
    invitedBy: string
  }) => {
    logger.log("Sending welcome email", { payload });

    // Send via Mailgun REST API
    const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || '8cf5979325b04d155c32723450c5c94a'
    const MAILGUN_DOMAIN = 'mg.proximity.green'

    const formData = new URLSearchParams()
    formData.append('from', 'Proximity Green <noreply@proximity.green>')
    formData.append('to', payload.email)
    formData.append('subject', `Welcome to Proximity Green, ${payload.firstName}!`)
    formData.append('html', `
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
            <a href="https://poc.proximity.green"
               style="background: #2d6a35; color: white; padding: 0.75rem 2rem; border-radius: 6px; text-decoration: none; font-weight: 500;">
              Sign In to Proximity Green
            </a>
          </div>
          <p style="color: #5a7060; line-height: 1.6; font-size: 0.85rem;">
            If you have any questions, reach out to your workspace administrator.
          </p>
          <hr style="border: none; border-top: 1px solid #e8f5ea; margin: 1.5rem 0;" />
          <p style="color: #5a7060; font-size: 0.75rem; text-align: center;">
            Proximity Green — Workspace Management Platform<br/>
            This email was sent to ${payload.email}
          </p>
        </div>
      </div>
    `)

    const response = await fetch(
      `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}`
        },
        body: formData
      }
    )

    const result = await response.json()

    if (!response.ok) {
      logger.error("Failed to send welcome email", { result })
      throw new Error(`Mailgun error: ${result.message}`)
    }

    logger.log("Welcome email sent", { messageId: result.id, to: payload.email })

    return {
      success: true,
      messageId: result.id,
      to: payload.email
    }
  },
});
