import { supabase } from '$lib/services/permissions.service'
import { log } from '$lib/services/system-log.service'
import { tasks } from '@trigger.dev/sdk/v3'
import type { sendWelcomeEmail } from '$lib/../trigger/welcome-email'
import { PUBLIC_APP_URL } from '$lib/server/env'

const APP_URL = PUBLIC_APP_URL
const AUTH_CONFIRM_URL = `${APP_URL}/auth/confirm`
const TRIGGER_RUNS_BASE_URL = 'https://jobs.poc.proximity.green/orgs/proximity-green-f2c3/projects/poc-aX4R/env/dev/runs'

export type PersonInput = {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  job_title?: string
  id_number?: string | null
  organisation_id?: string | null
  department?: string | null
  status?: 'active' | 'inactive' | 'offboarded'
  started_at?: string | null
  onboarded_at?: string | null
  offboarded_at?: string | null
  external_accounting_customer_id?: string | null
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export async function listPersons() {
  const { data } = await supabase
    .from('persons')
    .select('*')
    .order('created_at', { ascending: false })
  const persons = data ?? []

  // Resolve role_name per person via users.role_id → roles.name. Two lookups,
  // joined in memory — avoids PostgREST nested-join schema-cache quirks.
  const userIds = Array.from(new Set(persons.map((p: any) => p.user_id).filter(Boolean)))
  if (userIds.length === 0) return persons.map((p: any) => ({ ...p, role_name: null }))

  // Roles live in the user_roles junction (setUserRole writes here). One row
  // per user for now — we pick the first if there are multiples.
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('user_id, role_id, roles(name)')
    .in('user_id', userIds)

  const roleByUserId = new Map<string, string>()
  for (const ur of (userRoles ?? [])) {
    const uid = (ur as any).user_id as string
    const name = (ur as any).roles?.name as string | undefined
    if (uid && name && !roleByUserId.has(uid)) roleByUserId.set(uid, name)
  }

  return persons.map((p: any) => ({
    ...p,
    role_name: p.user_id ? (roleByUserId.get(p.user_id) ?? null) : null
  }))
}

export async function createPerson(input: PersonInput): Promise<ServiceResult> {
  const { error } = await supabase.from('persons').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updatePerson(id: string, input: Partial<PersonInput>): Promise<ServiceResult> {
  const { error } = await supabase.from('persons').update(input).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deletePerson(id: string): Promise<ServiceResult> {
  const { error } = await supabase.from('persons').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

const FIRST_NAMES = ['Sarah', 'James', 'Thandi', 'Mohammed', 'Chen', 'Priya', 'David', 'Emma', 'Sipho', 'Maria', 'Liam', 'Aisha', 'Ravi', 'Nina', 'Oscar', 'Fatima', 'Johan', 'Leila', 'Tom', 'Zanele']
const LAST_NAMES = ['Moyo', 'Van der Berg', 'Naidoo', 'Smith', 'Okonkwo', 'Patel', 'Khumalo', 'Johnson', 'Mbeki', 'Santos', 'Williams', 'Dlamini', 'Cohen', 'Ndlovu', 'Murphy', 'Govender', 'De Villiers', 'Abrahams', 'Botha', 'Singh']
const JOB_TITLES = ['Community Manager', 'Software Developer', 'Graphic Designer', 'Marketing Manager', 'CEO', 'Freelance Writer', 'Data Analyst', 'HR Manager', 'Sales Director', 'Product Manager', 'UX Designer', 'Accountant', 'Operations Lead', 'Business Development', 'Project Manager']

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export async function generateRandomPersons(count = 10): Promise<ServiceResult> {
  const people = Array.from({ length: count }, () => {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    return {
      first_name: first,
      last_name: last,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}.${Math.floor(Math.random() * 9999)}@example.com`,
      phone: `+27${Math.floor(Math.random() * 900000000 + 100000000)}`,
      job_title: pick(JOB_TITLES)
    }
  })
  const { error } = await supabase.from('persons').insert(people)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export type InviteAsUserInput = {
  email: string
  personId: string
  invitedByUserId: string | null
  inviterEmail: string
}

export async function inviteAsUser(input: InviteAsUserInput): Promise<ServiceResult> {
  const { email, personId, invitedByUserId, inviterEmail } = input

  const { data: result, error } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: AUTH_CONFIRM_URL }
  })
  if (error) return { ok: false, error: error.message }

  // Supabase generates action links with the internal kong hostname;
  // swap it for the public hostname so the emailed link works externally.
  let inviteUrl = result.properties?.action_link ?? APP_URL
  inviteUrl = inviteUrl.replace('http://supabase-kong:8000', 'https://db.poc.proximity.green')

  await supabase.from('persons').update({ user_id: result.user.id }).eq('id', personId)

  const { data: memberRole } = await supabase.from('roles').select('id').eq('name', 'member').single()
  if (memberRole) {
    await supabase.from('user_roles').insert({ user_id: result.user.id, role_id: memberRole.id })
  }

  const { data: person } = await supabase.from('persons').select('first_name, last_name').eq('id', personId).single()

  let triggerRunId: string | null = null
  let triggerError: string | null = null
  try {
    const handle = await tasks.trigger<typeof sendWelcomeEmail>('send-welcome-email', {
      email,
      firstName: person?.first_name ?? '',
      lastName: person?.last_name ?? '',
      invitedBy: inviterEmail,
      inviteUrl
    })
    triggerRunId = handle?.id ?? null
  } catch (e: any) {
    triggerError = e?.message ?? String(e)
  }

  await log('email', triggerError ? 'warning' : 'success', `Invitation sent to ${email} from People page`, {
    to: email, type: 'invite', source: 'app', via: 'trigger', person_id: personId,
    trigger_job: 'send-welcome-email',
    ...(triggerRunId ? {
      trigger_run_id: triggerRunId,
      trigger_status: 'triggered',
      trigger_url: `${TRIGGER_RUNS_BASE_URL}/${triggerRunId}`
    } : {}),
    ...(triggerError ? { trigger_error: triggerError } : {})
  }, invitedByUserId)
  await log('auth', 'info', `Person invited as user: ${email} (role: member)`, { email, person_id: personId, role: 'member' }, invitedByUserId)

  return { ok: true }
}
