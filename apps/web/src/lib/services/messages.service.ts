import { supabase } from '$lib/services/permissions.service'
import { log } from '$lib/services/system-log.service'
import { MAILGUN_API_KEY as CONFIGURED_MAILGUN_API_KEY } from '$lib/server/env'

export type ServiceResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string }

export type Channel = 'email' | 'sms' | 'push'

export type Template = {
  id: string
  slug: string
  name: string
  channel: Channel
  subject: string
  html_body: string
  text_body: string
  title: string
  description: string
  variables: string[]
  updated_at?: string
}

export async function listTemplates(): Promise<ServiceResult<Template[]>> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .order('channel, name')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data ?? [] }
}

export type TemplateUpdate = {
  subject: string
  html_body: string
  text_body: string
  title: string
  variables?: string[]
}

export async function updateTemplate(id: string, update: TemplateUpdate): Promise<ServiceResult> {
  const { error } = await supabase
    .from('message_templates')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Template updated' }
}

export type TemplateCreate = {
  slug: string
  name: string
  channel: Channel
  subject: string
  html_body: string
  text_body: string
  title: string
  description: string
  variables: string[]
}

export async function createTemplate(input: TemplateCreate): Promise<ServiceResult> {
  const { error } = await supabase.from('message_templates').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Template created' }
}

export async function deleteTemplate(id: string): Promise<ServiceResult> {
  const { error } = await supabase.from('message_templates').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Template deleted' }
}

// Build stub values for every declared variable so test sends don't leak
// raw {{placeholder}} tokens when the template declares a variable we haven't
// hardcoded a default for.
function buildTestVars(template: Template, testEmail: string): Record<string, string> {
  const known: Record<string, string> = {
    firstName: 'Test',
    lastName: 'User',
    email: testEmail,
    invitedBy: 'admin@proximity.green'
  }
  const stubbed: Record<string, string> = {}
  for (const name of template.variables ?? []) {
    stubbed[name] = known[name] ?? `[${name}]`
  }
  return { ...known, ...stubbed }
}

export async function sendTestEmail(
  templateId: string,
  testEmail: string,
  userId: string | null
): Promise<ServiceResult> {
  if (!CONFIGURED_MAILGUN_API_KEY) {
    await log('email', 'error', 'Test email aborted: MAILGUN_API_KEY not configured', { to: testEmail }, userId)
    return { ok: false, error: 'MAILGUN_API_KEY is not configured' }
  }
  const MAILGUN_API_KEY = CONFIGURED_MAILGUN_API_KEY

  const { data: template } = await supabase.from('message_templates').select('*').eq('id', templateId).single<Template>()
  if (!template) return { ok: false, error: 'Template not found' }

  const vars = buildTestVars(template, testEmail)
  let subject = template.subject
  let html = template.html_body || ''
  for (const [key, val] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
  }

  const formBody = new URLSearchParams()
  formBody.append('from', 'Proximity Green <noreply@proximity.green>')
  formBody.append('to', testEmail)
  formBody.append('subject', `[TEST] ${subject}`)
  formBody.append('html', html)

  const response = await fetch('https://api.mailgun.net/v3/mg.proximity.green/messages', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}` },
    body: formBody
  })

  if (!response.ok) {
    const errorText = await response.text()
    await log('email', 'error', `Test email failed: ${template.name} to ${testEmail}`, { template: template.slug, to: testEmail, error: errorText, source: 'mailgun' }, userId)
    return { ok: false, error: `Send failed: ${errorText}` }
  }

  await log('email', 'success', `Test email sent: ${template.name} to ${testEmail}`, { template: template.slug, to: testEmail, channel: template.channel, source: 'mailgun' }, userId)
  return { ok: true, message: `Test email sent to ${testEmail}` }
}
