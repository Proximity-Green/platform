import { fail } from '@sveltejs/kit'
import { supabase, requirePermission, getUserIdFromRequest } from '$lib/server/permissions'
import { log } from '$lib/server/systemLog'
import { tasks } from '@trigger.dev/sdk/v3'
import type { sendWelcomeEmail } from '$lib/../trigger/welcome-email'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')

  const { data: persons } = await supabase
    .from('persons')
    .select('*')
    .order('created_at', { ascending: false })
  return { persons: persons ?? [] }
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'create')

    const data = await request.formData()
    const { error } = await supabase.from('persons').insert({
      first_name: data.get('first_name'),
      last_name: data.get('last_name'),
      email: data.get('email'),
      phone: data.get('phone'),
      job_title: data.get('job_title')
    })
    if (error) return fail(400, { error: error.message })
    return { success: true }
  },

  generateRandom: async ({ cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'create')

    const firstNames = ['Sarah', 'James', 'Thandi', 'Mohammed', 'Chen', 'Priya', 'David', 'Emma', 'Sipho', 'Maria', 'Liam', 'Aisha', 'Ravi', 'Nina', 'Oscar', 'Fatima', 'Johan', 'Leila', 'Tom', 'Zanele']
    const lastNames = ['Moyo', 'Van der Berg', 'Naidoo', 'Smith', 'Okonkwo', 'Patel', 'Khumalo', 'Johnson', 'Mbeki', 'Santos', 'Williams', 'Dlamini', 'Cohen', 'Ndlovu', 'Murphy', 'Govender', 'De Villiers', 'Abrahams', 'Botha', 'Singh']
    const titles = ['Community Manager', 'Software Developer', 'Graphic Designer', 'Marketing Manager', 'CEO', 'Freelance Writer', 'Data Analyst', 'HR Manager', 'Sales Director', 'Product Manager', 'UX Designer', 'Accountant', 'Operations Lead', 'Business Development', 'Project Manager']

    const people = Array.from({ length: 10 }, () => {
      const first = firstNames[Math.floor(Math.random() * firstNames.length)]
      const last = lastNames[Math.floor(Math.random() * lastNames.length)]
      return {
        first_name: first,
        last_name: last,
        email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}.${Math.floor(Math.random() * 9999)}@example.com`,
        phone: `+27${Math.floor(Math.random() * 900000000 + 100000000)}`,
        job_title: titles[Math.floor(Math.random() * titles.length)]
      }
    })

    const { error } = await supabase.from('persons').insert(people)
    if (error) return fail(400, { error: error.message })
    return { success: true }
  },

  inviteUser: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const email = data.get('email') as string
    const personId = data.get('person_id') as string

    // Generate invite link without sending Supabase's email — we send our own
    const { data: result, error } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: 'https://poc.proximity.green/auth/confirm' }
    })
    if (error) return fail(400, { error: error.message })

    // Build the invite URL from the generated link properties
    let inviteUrl = result.properties?.action_link ?? 'https://poc.proximity.green'
    // Fix internal URL if needed — replace internal supabase-kong with public URL
    inviteUrl = inviteUrl.replace('http://supabase-kong:8000', 'https://db.poc.proximity.green')
    console.log('Invite URL generated:', inviteUrl)

    // Link the new user to the person record
    await supabase.from('persons').update({ user_id: result.user.id }).eq('id', personId)

    // Auto-assign member role
    const { data: memberRole } = await supabase.from('roles').select('id').eq('name', 'member').single()
    if (memberRole) {
      await supabase.from('user_roles').insert({ user_id: result.user.id, role_id: memberRole.id })
    }

    // Get person details and inviter email for welcome email
    const { data: person } = await supabase.from('persons').select('first_name, last_name').eq('id', personId).single()
    const session = await locals.getSession()
    const inviterEmail = session?.user?.email ?? 'an administrator'

    // Trigger welcome email workflow
    let triggerRunId = null
    let triggerError = null
    try {
      const handle = await tasks.trigger('send-welcome-email', {
        email,
        firstName: person?.first_name ?? '',
        lastName: person?.last_name ?? '',
        invitedBy: inviterEmail,
        inviteUrl
      })
      triggerRunId = handle?.id ?? null
    } catch (e: any) {
      triggerError = e?.message ?? String(e)
      console.error('Trigger.dev welcome email failed:', triggerError)
    }

    const triggerBaseUrl = 'https://jobs.poc.proximity.green/orgs/proximity-green-f2c3/projects/poc-aX4R/env/dev/runs'
    await log('email', triggerError ? 'warning' : 'success', `Invitation sent to ${email} from People page`, {
      to: email, type: 'invite', person_id: personId,
      trigger_job: 'send-welcome-email',
      ...(triggerRunId ? {
        trigger_run_id: triggerRunId,
        trigger_status: 'triggered',
        trigger_url: `${triggerBaseUrl}/${triggerRunId}`
      } : {}),
      ...(triggerError ? { trigger_error: triggerError } : {})
    }, userId)
    await log('auth', 'info', `Person invited as user: ${email} (role: member)`, { email, person_id: personId, role: 'member' }, userId)

    return { success: true }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'update')

    const data = await request.formData()
    const { error } = await supabase.from('persons').update({
      first_name: data.get('first_name'),
      last_name: data.get('last_name'),
      phone: data.get('phone'),
      job_title: data.get('job_title')
    }).eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'delete')

    const data = await request.formData()
    const { error } = await supabase.from('persons').delete().eq('id', data.get('id'))
    if (error) return fail(400, { error: error.message })
    return { success: true }
  }
}
