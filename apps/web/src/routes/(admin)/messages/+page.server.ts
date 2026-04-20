import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, getActualUserId } from '$lib/services/permissions.service'
import * as messagesService from '$lib/services/messages.service'
import type { Channel } from '$lib/services/messages.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'settings', 'read')
  const result = await messagesService.listTemplates()
  return { templates: result.ok ? result.data : [], error: result.ok ? null : result.error }
}

export const actions = {
  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'settings', 'manage')

    const data = await request.formData()
    const result = await messagesService.updateTemplate(data.get('id') as string, {
      subject: data.get('subject') as string,
      html_body: data.get('html_body') as string,
      text_body: data.get('text_body') as string,
      title: data.get('title') as string
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  },

  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'settings', 'manage')

    const data = await request.formData()
    const result = await messagesService.createTemplate({
      slug: data.get('slug') as string,
      name: data.get('name') as string,
      channel: data.get('channel') as Channel,
      subject: (data.get('subject') as string) || '',
      html_body: (data.get('html_body') as string) || '',
      text_body: (data.get('text_body') as string) || '',
      title: (data.get('title') as string) || '',
      description: (data.get('description') as string) || '',
      variables: ((data.get('variables') as string) || '').split(',').map(v => v.trim()).filter(Boolean)
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'settings', 'manage')

    const data = await request.formData()
    const result = await messagesService.deleteTemplate(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  },

  sendTest: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'settings', 'manage')
    const actualUserId = await getActualUserId(locals)

    const data = await request.formData()
    const result = await messagesService.sendTestEmail(
      data.get('id') as string,
      data.get('test_email') as string,
      actualUserId
    )
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: result.message }
  }
}
