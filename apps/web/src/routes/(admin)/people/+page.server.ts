import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase, sbForUser } from '$lib/services/permissions.service'
import * as personsService from '$lib/services/persons.service'
import * as usersService from '$lib/services/users.service'
import { logFail } from '$lib/services/action-log.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')
  const persons = await personsService.listPersons()
  const { data: orgs }  = await supabase.from('organisations').select('id, name').is('deleted_at', null).order('name')
  const { data: roles } = await supabase.from('roles').select('id, name').order('name')
  return { persons, organisations: orgs ?? [], roles: roles ?? [] }
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
    }, userId)
    if (!result.ok) return await logFail(userId, 'people.create', result.error)
    return { success: true, message: 'Person created' }
  },

  generateRandom: async ({ cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'create')

    const result = await personsService.generateRandomPersons(10, userId)
    if (!result.ok) return await logFail(userId, 'people.generateRandom', result.error)
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
    if (!result.ok) return await logFail(userId, 'people.inviteUser', result.error)
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
    }, userId)
    if (!result.ok) return await logFail(userId, 'people.update', result.error)
    return { success: true, message: 'Person updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'delete')

    const data = await request.formData()
    const result = await personsService.deletePerson(data.get('id') as string, userId)
    if (!result.ok) return await logFail(userId, 'people.delete', result.error)
    return { success: true, message: 'Person deleted' }
  },

  bulkInvite: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const ids = data.getAll('ids').map(v => String(v)).filter(Boolean)
    if (ids.length === 0) return fail(400, { error: 'No members selected' })

    // Only persons without an existing user_id
    const { data: rows } = await supabase
      .from('persons')
      .select('id, email, user_id')
      .in('id', ids)
      .is('deleted_at', null)
    const targets = (rows ?? []).filter(r => !r.user_id)
    if (targets.length === 0) {
      return { success: true, message: 'All selected members already have user accounts.' }
    }

    const session = await locals.getSession()
    const inviterEmail = session?.user?.email ?? 'an administrator'
    let ok = 0
    const errors: string[] = []
    for (const t of targets) {
      const r = await personsService.inviteAsUser({
        email: t.email as string,
        personId: t.id as string,
        invitedByUserId: userId,
        inviterEmail
      })
      if (r.ok) ok++
      else errors.push(`${t.email}: ${r.error}`)
    }
    if (ok === 0) return fail(400, { error: errors.join('; ') })
    return {
      success: true,
      message: errors.length === 0
        ? `Invited ${ok} member${ok === 1 ? '' : 's'}.`
        : `Invited ${ok}, ${errors.length} failed: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`
    }
  },

  bulkSetRole: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'users', 'manage')

    const data = await request.formData()
    const ids = data.getAll('ids').map(v => String(v)).filter(Boolean)
    const roleId = data.get('role_id') as string
    console.log(`[bulkSetRole] request — persons.ids=${ids.length} role_id=${roleId}`)
    if (!roleId) return fail(400, { error: 'Pick a role' })
    if (ids.length === 0) return fail(400, { error: 'No members selected' })

    const { data: rows, error: lookupErr } = await supabase
      .from('persons')
      .select('id, first_name, last_name, user_id')
      .in('id', ids)
      .is('deleted_at', null)
    if (lookupErr) {
      console.log('[bulkSetRole] lookup error:', lookupErr.message)
      return await logFail(userId, 'people.bulkSetRole', lookupErr)
    }

    const withUser = (rows ?? []).filter(r => !!r.user_id)
    const withoutUser = (rows ?? []).filter(r => !r.user_id)
    console.log(`[bulkSetRole] resolved — ${withUser.length} linked users, ${withoutUser.length} skipped (no user_id)`)

    if (withUser.length === 0) {
      return {
        success: true,
        message: `Skipped ${withoutUser.length} — none of the selected members have a linked user account. Invite them first.`
      }
    }

    const { data: role } = await supabase.from('roles').select('name').eq('id', roleId).single()
    const roleName = role?.name ?? roleId

    // Guard: never change the acting user's own role, and never change any
    // super_admin's role — bulk-set-role has locked people out twice already.
    const candidateIds = withUser.map(r => r.user_id as string)
    const { data: superRows } = await supabase
      .from('user_roles')
      .select('user_id, roles(name)')
      .in('user_id', candidateIds)
    const protectedIds = new Set<string>()
    if (userId) protectedIds.add(userId)
    for (const ur of (superRows ?? [])) {
      const uid = (ur as any).user_id as string
      const rname = (ur as any).roles?.name as string | undefined
      if (uid && rname === 'super_admin') protectedIds.add(uid)
    }
    const skippedProtected = withUser.filter(r => protectedIds.has(r.user_id as string))
    const actionable = withUser.filter(r => !protectedIds.has(r.user_id as string))
    if (skippedProtected.length > 0) {
      console.log(`[bulkSetRole] guard — skipping ${skippedProtected.length} protected user(s) (self or super_admin)`)
    }
    if (actionable.length === 0) {
      return {
        success: true,
        message: `Skipped ${skippedProtected.length} protected (self or super_admin) — nothing to change.`
      }
    }

    const userIdList = actionable.map(r => r.user_id as string)
    const t0 = Date.now()

    // Batch: one delete to clear existing roles, one insert with all new rows.
    // Avoids the N-queries-per-user cost of calling setUserRole in a loop.
    const sb = sbForUser(userId)
    const { error: delErr } = await sb
      .from('user_roles')
      .delete()
      .in('user_id', userIdList)
    if (delErr) {
      console.log('[bulkSetRole] delete error:', delErr.message)
      return await logFail(userId, 'people.bulkSetRole', delErr)
    }

    const newRows = userIdList.map(uid => ({ user_id: uid, role_id: roleId }))
    const { error: insErr } = await sb.from('user_roles').insert(newRows)
    if (insErr) {
      console.log('[bulkSetRole] insert error:', insErr.message)
      return await logFail(userId, 'people.bulkSetRole', insErr)
    }

    const ms = Date.now() - t0
    console.log(`[bulkSetRole] ✓ batch applied role "${roleName}" to ${userIdList.length} users in ${ms}ms`)

    const parts = [
      `Role "${roleName}" applied to ${userIdList.length} user${userIdList.length === 1 ? '' : 's'}`,
      withoutUser.length > 0 ? `${withoutUser.length} skipped (no user)` : null,
      skippedProtected.length > 0 ? `${skippedProtected.length} skipped (protected)` : null,
      `${ms}ms`
    ].filter(Boolean)
    return { success: true, message: parts.join(' · ') }
  },

  bulkEmail: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'persons', 'update')

    const data = await request.formData()
    const ids = data.getAll('ids').map(v => String(v)).filter(Boolean)
    const subject = (data.get('subject') as string ?? '').trim()
    const body = (data.get('body') as string ?? '').trim()
    if (!subject || !body) return fail(400, { error: 'Subject and body are required' })
    if (ids.length === 0) return fail(400, { error: 'No members selected' })

    // TODO: wire to Mailgun / send provider with per-recipient merge token
    // substitution ({{first_name}}, {{last_name}}, {{email}}, {{job_title}}).
    // For now, log intent and return a deferred-send message.
    console.log(`[bulk-email] queued ${ids.length} recipients, subject="${subject}"`)
    return {
      success: true,
      message: `Mail-merge queued for ${ids.length} recipient${ids.length === 1 ? '' : 's'} — sending backend not yet wired.`
    }
  }
}
