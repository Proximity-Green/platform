import { fail } from '@sveltejs/kit'
import { supabase, requirePermission, getUserIdFromRequest, getActualUserId } from '$lib/services/permissions.service'
import { log } from '$lib/services/system-log.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'settings', 'read')

  const { data: templates } = await supabase
    .from('message_templates')
    .select('*')
    .order('channel, name')

  return { templates: templates ?? [] }
}

export const actions = {
  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'settings', 'manage')

    const data = await request.formData()
    const id = data.get('id') as string
    const subject = data.get('subject') as string
    const html_body = data.get('html_body') as string
    const text_body = data.get('text_body') as string
    const title = data.get('title') as string

    const { error } = await supabase
      .from('message_templates')
      .update({ subject, html_body, text_body, title, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Template updated' }
  },

  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'settings', 'manage')

    const data = await request.formData()
    const { error } = await supabase.from('message_templates').insert({
      slug: data.get('slug'),
      name: data.get('name'),
      channel: data.get('channel'),
      subject: data.get('subject') || '',
      html_body: data.get('html_body') || '',
      text_body: data.get('text_body') || '',
      title: data.get('title') || '',
      description: data.get('description') || '',
      variables: (data.get('variables') as string || '').split(',').map(v => v.trim()).filter(Boolean)
    })

    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Template created' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'settings', 'manage')

    const data = await request.formData()
    const { error } = await supabase.from('message_templates').delete().eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true, message: 'Template deleted' }
  },

  sendTest: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'settings', 'manage')

    const data = await request.formData()
    const id = data.get('id') as string
    const testEmail = data.get('test_email') as string

    const { data: template } = await supabase.from('message_templates').select('*').eq('id', id).single()
    if (!template) return fail(400, { error: 'Template not found' })

    const vars: Record<string, string> = {
      firstName: 'Test', lastName: 'User', email: testEmail, invitedBy: 'admin@proximity.green'
    }

    let subject = template.subject
    let html = template.html_body || ''
    for (const [key, val] of Object.entries(vars)) {
      subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
    }

    const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || ''
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
      const actualUserId = await getActualUserId(locals)
      await log('email', 'error', `Test email failed: ${template.name} to ${testEmail}`, { template: template.slug, to: testEmail, error: errorText, source: 'mailgun' }, actualUserId)
      return fail(400, { error: `Send failed: ${errorText}` })
    }

    const actualUserId = await getActualUserId(locals)
    await log('email', 'success', `Test email sent: ${template.name} to ${testEmail}`, { template: template.slug, to: testEmail, channel: template.channel, source: 'mailgun' }, actualUserId)
    return { success: true, message: `Test email sent to ${testEmail}` }
  }
}
