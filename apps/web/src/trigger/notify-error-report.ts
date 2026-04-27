import { logger, task } from '@trigger.dev/sdk/v3'

const MAILGUN_DOMAIN = 'mg.proximity.green'

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

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  const clean = (v: string | undefined) => (v ?? '').replace(/\s+/g, '')
  return createClient(clean(process.env.PUBLIC_SUPABASE_URL), clean(process.env.SUPABASE_SERVICE_ROLE_KEY))
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Email admin(s) when a new reported_error lands. Throttle: if the same
 * `code` was already reported in the past hour, skip the alert — keeps
 * a noisy class of failure from blowing up the inbox while still flagging
 * the first occurrence quickly.
 *
 * Recipients come from the ALERT_EMAIL env var (comma-separated list).
 * Set this in Coolify; if missing, the task no-ops and writes a warning
 * to system_logs so the gap is visible without breaking anything.
 */
export const notifyErrorReport = task({
  id: 'notify-error-report',
  maxDuration: 60,
  run: async (payload: { reportId: string }) => {
    const apiKey = process.env.MAILGUN_API_KEY ?? ''
    const recipients = (process.env.ALERT_EMAIL ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (!apiKey) {
      logger.warn('notify-error-report: MAILGUN_API_KEY missing — skipping')
      return { skipped: 'no_api_key' }
    }
    if (recipients.length === 0) {
      logger.warn('notify-error-report: ALERT_EMAIL not set — skipping')
      return { skipped: 'no_recipients' }
    }

    const supabase = await getSupabase()

    const { data: report, error: fetchErr } = await supabase
      .from('reported_errors')
      .select('id, code, title, detail, raw, url, reported_by, reported_at')
      .eq('id', payload.reportId)
      .single()
    if (fetchErr || !report) throw new Error(`report ${payload.reportId} not found: ${fetchErr?.message ?? '—'}`)

    // Throttle. If another report with the same code came in within the
    // hour before this one, suppress the email — this is a follow-up,
    // not a new incident worth waking someone for. The triage UI shows
    // both regardless.
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: priorCount } = await supabase
      .from('reported_errors')
      .select('id', { count: 'exact', head: true })
      .eq('code', report.code)
      .lt('reported_at', report.reported_at)
      .gte('reported_at', cutoff)

    if ((priorCount ?? 0) > 0) {
      logger.log(`notify-error-report: throttled — ${priorCount} prior ${report.code} report(s) within last hour`)
      return { skipped: 'throttled', priorCount }
    }

    // Resolve reporter email (nice-to-have, not blocking).
    let reporterEmail: string | null = null
    if (report.reported_by) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(report.reported_by)
        reporterEmail = user?.email ?? null
      } catch { /* swallow — we'll just show the uuid */ }
    }

    const appUrl = (process.env.PUBLIC_APP_URL ?? 'https://poc.proximity.green').replace(/\/$/, '')
    const triageUrl = `${appUrl}/reported-errors?entry=${report.id}`

    const subject = `[Error report] ${report.title}`.slice(0, 200)
    const html = `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:640px;color:#222">
        <h2 style="margin:0 0 8px;color:#c0392b">${escapeHtml(report.title)}</h2>
        <p style="margin:0 0 16px;color:#555;font-size:14px">A user reported this error in the Proximity Green admin app.</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px">
          <tr><td style="padding:6px 12px 6px 0;color:#888;width:120px">Code</td><td style="padding:6px 0;font-family:monospace">${escapeHtml(report.code)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#888">When</td><td style="padding:6px 0">${escapeHtml(new Date(report.reported_at).toLocaleString('en-ZA'))}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#888">Reported by</td><td style="padding:6px 0">${escapeHtml(reporterEmail ?? report.reported_by ?? '(signed-out)')}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#888;vertical-align:top">URL</td><td style="padding:6px 0;word-break:break-all"><a href="${escapeHtml(report.url ?? '')}" style="color:#2d6a35">${escapeHtml(report.url ?? '—')}</a></td></tr>
        </table>

        ${report.detail ? `<p style="margin:0 0 16px;font-size:14px">${escapeHtml(report.detail)}</p>` : ''}

        ${report.raw ? `<details style="margin-bottom:16px"><summary style="cursor:pointer;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Raw</summary><pre style="background:#f6f5f0;padding:10px 12px;border-radius:4px;font-size:12px;overflow:auto;margin-top:8px">${escapeHtml(report.raw)}</pre></details>` : ''}

        <p style="margin:24px 0 0">
          <a href="${triageUrl}" style="background:#2d6a35;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open in triage →</a>
        </p>

        <p style="margin-top:32px;color:#aaa;font-size:11px">This alert is throttled — only the first report of each code in a given hour gets emailed. Subsequent occurrences are visible in the triage queue.</p>
      </div>
    `

    const sent: string[] = []
    const failed: { to: string; error: string }[] = []
    for (const to of recipients) {
      try {
        const r = await sendEmail(apiKey, to, subject, html)
        sent.push(to)
        logger.log(`notify-error-report: sent to ${to}`, { messageId: r.id })
      } catch (e: any) {
        failed.push({ to, error: e?.message ?? String(e) })
        logger.error(`notify-error-report: failed to send to ${to}`, { error: e?.message })
      }
    }

    // Best-effort breadcrumb in system_logs so the audit trail is clean.
    try {
      await supabase.from('system_logs').insert({
        category: 'email',
        level: failed.length === recipients.length ? 'error' : (failed.length > 0 ? 'warning' : 'success'),
        message: `Error report alert: ${report.code} (${sent.length}/${recipients.length} delivered)`,
        details: {
          report_id: report.id,
          code: report.code,
          title: report.title,
          recipients: recipients.length,
          sent: sent.length,
          failed
        }
      })
    } catch { /* don't fail the task on audit-log write */ }

    return { reportId: report.id, sent, failed }
  }
})
