import { fail, error } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as personsService from '$lib/services/persons.service'

export const load = async ({ params, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')

  const personRes = await supabase
    .from('persons')
    .select('*')
    .eq('id', params.id)
    .single()
  if (personRes.error || !personRes.data) throw error(404, 'Member not found')

  const organisationsPromise = supabase
    .from('organisations')
    .select('id, name')
    .order('name')
    .then(r => r.data ?? [])

  const subscriptionsPromise = supabase
    .from('subscription_lines')
    .select('id, status, base_rate, currency, quantity, started_at, ended_at, item_id, organisation_id, items(name), organisations(name)')
    .eq('person_id', params.id)
    .order('started_at', { ascending: false })
    .then(r => r.data ?? [])

  return {
    person: personRes.data,
    organisations: organisationsPromise,
    subscriptions: subscriptionsPromise,
    viewerId: userId
  }
}

export const actions = {
  update: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'update')

    const data = await request.formData()
    const blank = (k: string) => {
      const v = data.get(k)
      return v == null || v === '' ? null : (v as string)
    }
    const status = (data.get('status') as string) || 'inactive'
    const result = await personsService.updatePerson(params.id, {
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
    }, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Member updated' }
  },

  delete: async ({ params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'delete')
    const result = await personsService.deletePerson(params.id, userId)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Member deleted' }
  },

  inviteUser: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const session = await locals.getSession()
    const result = await personsService.inviteAsUser({
      email: data.get('email') as string,
      personId: params.id,
      invitedByUserId: userId,
      inviterEmail: session?.user?.email ?? 'an administrator'
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Member invited' }
  }
}
