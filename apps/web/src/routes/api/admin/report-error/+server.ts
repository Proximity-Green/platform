import { error, json } from '@sveltejs/kit'
import { getUserIdFromRequest, sbForUser } from '$lib/services/permissions.service'
import { tasks } from '@trigger.dev/sdk/v3'
import type { notifyErrorReport } from '$lib/../trigger/notify-error-report'

/**
 * Capture a user-initiated error report from the ErrorBanner.
 *
 * Body: { code, title, detail?, raw?, url?, user_agent? }
 *
 * RLS policy `reported_errors_insert_self` requires reported_by =
 * auth.uid(), so we always stamp it server-side rather than trusting the
 * client. Returns 401 if not signed in (anonymous reports could become a
 * spam vector — make signed-in a hard requirement for now).
 */
const MAX_TITLE = 500
const MAX_DETAIL = 4000
const MAX_RAW = 8000
const MAX_URL = 1000
const MAX_UA = 500
const MAX_CODE = 80
// 2MB cap on the screenshot data URL. PNG of a typical 1440-wide viewport
// at 0.75 scale lands well under this; we still defend the upper bound to
// keep one bad client from blowing up the row.
const MAX_SCREENSHOT = 2_000_000

function clip(v: unknown, max: number): string | null {
  if (v == null) return null
  const s = String(v)
  if (s.length === 0) return null
  return s.length > max ? s.slice(0, max) : s
}

function clipNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 32000 ? Math.round(n) : null
}

export async function POST({ request, cookies, locals }) {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Sign-in required to report an error')

  const body = (await request.json().catch(() => null)) as {
    code?: string
    title?: string
    detail?: string
    raw?: string
    url?: string
    user_agent?: string
    screenshot?: string
    viewport_w?: number
    viewport_h?: number
  } | null

  const code = clip(body?.code, MAX_CODE)
  const title = clip(body?.title, MAX_TITLE)
  if (!code || !title) throw error(400, 'code and title are required')

  // Validate the screenshot data URL before persisting. We only accept
  // image/* data URLs and refuse anything over the cap — silently dropping
  // is friendlier than 413'ing the whole report (the text fields are still
  // worth keeping even if the image was too big).
  let screenshot: string | null = null
  if (body?.screenshot && typeof body.screenshot === 'string') {
    if (body.screenshot.length <= MAX_SCREENSHOT && /^data:image\/(png|jpeg|webp);base64,/.test(body.screenshot)) {
      screenshot = body.screenshot
    }
  }

  const row = {
    code,
    title,
    detail: clip(body?.detail, MAX_DETAIL),
    raw: clip(body?.raw, MAX_RAW),
    url: clip(body?.url, MAX_URL),
    user_agent: clip(body?.user_agent, MAX_UA),
    screenshot,
    viewport_w: clipNum(body?.viewport_w),
    viewport_h: clipNum(body?.viewport_h),
    reported_by: userId
  }

  const { data, error: insErr } = await sbForUser(userId)
    .from('reported_errors')
    .insert(row)
    .select('id')
    .single()

  if (insErr) throw error(400, insErr.message)

  const reportId = (data as { id: string }).id

  // Fire-and-forget the alert email. Don't await — we don't want a slow
  // Mailgun call (or a missing ALERT_EMAIL config) to delay the user's
  // "✓ Reported" feedback. The task itself logs to system_logs on
  // failure so the gap is visible without blocking here.
  tasks.trigger<typeof notifyErrorReport>('notify-error-report', { reportId })
    .catch(e => console.warn('[report-error] failed to enqueue alert', e?.message ?? e))

  return json({ id: reportId }, { status: 201 })
}
