import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as personsService from '$lib/services/persons.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')
  const persons = await personsService.listPersons()
  const { data: orgs } = await supabase.from('organisations').select('id, name').order('name')
  return { persons, organisations: orgs ?? [] }
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
    return { success: true, message: 'Person created' }
  },

  generateRandom: async ({ cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'create')

    const result = await personsService.generateRandomPersons()
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: '10 random people added' }
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
    return { success: true, message: 'Person invited' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'update')

    const data = await request.formData()
    const blank = (k: string) => {
      const v = data.get(k)
      return v == null || v === '' ? null : (v as string)
    }
    const status = (data.get('status') as string) || 'inactive'
    const result = await personsService.updatePerson(data.get('id') as string, {
      first_name: data.get('first_name') as string,
      last_name: data.get('last_name') as string,
      phone: blank('phone'),
      job_title: blank('job_title'),
      id_number: blank('id_number'),
      organisation_id: blank('organisation_id'),
      department: blank('department'),
      status: status as 'active' | 'inactive' | 'offboarded',
      started_at: blank('started_at'),
      onboarded_at: blank('onboarded_at'),
      offboarded_at: blank('offboarded_at'),
      external_accounting_customer_id: blank('external_accounting_customer_id')
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Person updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'delete')

    const data = await request.formData()
    const result = await personsService.deletePerson(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Person deleted' }
  }
}
