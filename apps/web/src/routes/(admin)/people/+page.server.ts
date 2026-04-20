import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import * as personsService from '$lib/services/persons.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')
  return { persons: await personsService.listPersons() }
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'create')

    const data = await request.formData()
    const result = await personsService.createPerson({
      first_name: data.get('first_name') as string,
      last_name: data.get('last_name') as string,
      email: data.get('email') as string,
      phone: data.get('phone') as string,
      job_title: data.get('job_title') as string
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true }
  },

  generateRandom: async ({ cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'create')

    const result = await personsService.generateRandomPersons()
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true }
  },

  inviteUser: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const session = await locals.getSession()
    const result = await personsService.inviteAsUser({
      email: data.get('email') as string,
      personId: data.get('person_id') as string,
      invitedByUserId: userId,
      inviterEmail: session?.user?.email ?? 'an administrator'
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'update')

    const data = await request.formData()
    const result = await personsService.updatePerson(data.get('id') as string, {
      first_name: data.get('first_name') as string,
      last_name: data.get('last_name') as string,
      phone: data.get('phone') as string,
      job_title: data.get('job_title') as string
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'delete')

    const data = await request.formData()
    const result = await personsService.deletePerson(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true }
  }
}
