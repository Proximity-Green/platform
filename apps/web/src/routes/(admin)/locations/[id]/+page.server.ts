import { fail, error } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'

const blank = (data: FormData, k: string): string | null => {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}

export const load = async ({ params, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'locations', 'read')

  const id = params.id

  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('*')
    .eq('id', id)
    .single()

  if (locErr || !location) throw error(404, 'Location not found')

  const { data: trackingCodes } = await supabase
    .from('tracking_codes')
    .select('*')
    .eq('location_id', id)
    .order('category', { ascending: true, nullsFirst: false })
    .order('is_primary', { ascending: false })
    .order('code', { ascending: true })

  return {
    location,
    trackingCodes: trackingCodes ?? []
  }
}

export const actions = {
  addTrackingCode: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const code = blank(data, 'code')
    const name = blank(data, 'name')
    if (!code) return fail(400, { error: 'Code is required' })
    if (!name) return fail(400, { error: 'Name is required' })

    const isPrimary = data.get('is_primary') === 'on'

    // Promoting to primary: unset any existing primary for this location first
    // so the unique partial index doesn't reject the insert.
    if (isPrimary) {
      const { error: unsetErr } = await supabase
        .from('tracking_codes')
        .update({ is_primary: false })
        .eq('location_id', params.id)
        .eq('is_primary', true)
      if (unsetErr) return fail(400, { error: unsetErr.message })
    }

    const { error: insErr } = await supabase.from('tracking_codes').insert({
      location_id: params.id,
      category: blank(data, 'category'),
      code,
      name,
      accounting_external_category_id: blank(data, 'accounting_external_category_id'),
      accounting_external_option_id: blank(data, 'accounting_external_option_id'),
      is_primary: isPrimary
    })
    if (insErr) return fail(400, { error: insErr.message })
    return { success: true, message: 'Tracking code added' }
  },

  setPrimary: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    if (!id) return fail(400, { error: 'Missing id' })

    // Two-step flip: the partial unique index WHERE is_primary = true rejects a
    // single UPDATE that leaves two rows true mid-statement, so demote first.
    const { error: demoteErr } = await supabase
      .from('tracking_codes')
      .update({ is_primary: false })
      .eq('location_id', params.id)
      .eq('is_primary', true)
    if (demoteErr) return fail(400, { error: demoteErr.message })

    const { error: promoteErr } = await supabase
      .from('tracking_codes')
      .update({ is_primary: true })
      .eq('id', id)
    if (promoteErr) return fail(400, { error: promoteErr.message })

    return { success: true, message: 'Primary tracking code updated' }
  },

  toggleActive: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    const active = data.get('active') === 'true'
    if (!id) return fail(400, { error: 'Missing id' })

    const { error: upErr } = await supabase
      .from('tracking_codes')
      .update({ active: !active })
      .eq('id', id)
    if (upErr) return fail(400, { error: upErr.message })
    return { success: true, message: 'Tracking code updated' }
  },

  updateTrackingCode: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    const code = blank(data, 'code')
    const name = blank(data, 'name')
    if (!id) return fail(400, { error: 'Missing id' })
    if (!code) return fail(400, { error: 'Code is required' })
    if (!name) return fail(400, { error: 'Name is required' })

    const { error: upErr } = await supabase
      .from('tracking_codes')
      .update({
        category: blank(data, 'category'),
        code,
        name,
        accounting_external_category_id: blank(data, 'accounting_external_category_id'),
        accounting_external_option_id: blank(data, 'accounting_external_option_id'),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
    if (upErr) return fail(400, { error: upErr.message })
    return { success: true, message: 'Tracking code updated' }
  },

  deleteTrackingCode: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'locations', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    if (!id) return fail(400, { error: 'Missing id' })

    const { error: delErr } = await supabase.from('tracking_codes').delete().eq('id', id)
    if (delErr) return fail(400, { error: delErr.message })
    return { success: true, message: 'Tracking code deleted' }
  }
}
