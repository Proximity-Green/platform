import { fail, error, redirect } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase, sbForUser } from '$lib/services/permissions.service'
import * as invoicesService from '$lib/services/invoices.service'

const blank = (data: FormData, k: string): string | null => {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}
const num = (data: FormData, k: string): number | null => {
  const v = data.get(k)
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function recomputeTotals(lines: any[]): { sub_total: number; tax_total: number; discount_total: number; total: number } {
  let sub = 0, tax = 0, disc = 0
  for (const l of lines) {
    const q = Number(l.quantity ?? 1)
    const up = Number(l.unit_price ?? 0)
    const d = Number(l.discount ?? 0)
    const t = Number(l.tax_amount ?? 0)
    sub += q * up - d
    tax += t
    disc += d
  }
  return { sub_total: sub, tax_total: tax, discount_total: disc, total: sub + tax }
}

export const load = async ({ params, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'invoices', 'read')

  const id = params.id

  const [invRes, linesRes, orgsRes, locationsRes, itemsRes] = await Promise.all([
    supabase.from('invoices').select('*, organisations(name, billing_currency), locations(name)').eq('id', id).single(),
    supabase.from('invoice_lines').select('*, subscription_lines(id), items(name, accounting_tax_percentage, location_id)').eq('invoice_id', id).order('created_at'),
    supabase.from('organisations').select('id, name').order('name'),
    supabase.from('locations').select('id, name, short_name, currency').order('name'),
    supabase.from('items').select('id, name, location_id, base_price, accounting_tax_percentage, accounting_gl_code, accounting_item_code, accounting_tax_code, item_tracking_codes(tracking_codes(code)), item_types(slug, requires_license, sellable_ad_hoc)').eq('active', true).order('name')
  ])

  if (invRes.error || !invRes.data) throw error(404, 'Invoice not found')

  const invoice = invRes.data as any
  const lines = (linesRes.data ?? []).map((l: any) => ({
    ...l,
    item_name: l.items?.name ?? null,
    subscription_line_id_short: l.subscription_line_id ? l.subscription_line_id.slice(0, 8) : null
  }))

  const items = (itemsRes.data ?? []).filter((i: any) =>
    i.item_types?.sellable_ad_hoc && !i.item_types?.requires_license
  )

  return {
    invoice,
    lines,
    organisations: orgsRes.data ?? [],
    locations: locationsRes.data ?? [],
    items
  }
}

export const actions = {
  save: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'update')

    const data = await request.formData()
    const id = params.id
    const patch: any = {
      reference: blank(data, 'reference'),
      title: blank(data, 'title'),
      currency: blank(data, 'currency') ?? 'ZAR',
      issued_at: blank(data, 'issued_at'),
      due_at: blank(data, 'due_at'),
      notes: blank(data, 'notes'),
      status: blank(data, 'status') ?? 'draft',
      location_id: blank(data, 'location_id')
    }

    const sb = sbForUser(userId)
    const { error: upErr } = await sb.from('invoices').update(patch).eq('id', id)
    if (upErr) return fail(400, { error: upErr.message })

    // Recompute totals from current lines
    const { data: lines } = await sb.from('invoice_lines').select('*').eq('invoice_id', id)
    const totals = recomputeTotals(lines ?? [])
    const amount_paid = Number((await sb.from('invoices').select('amount_paid').eq('id', id).single()).data?.amount_paid ?? 0)
    await sb.from('invoices').update({
      ...totals,
      amount_due: totals.total - amount_paid,
      updated_at: new Date().toISOString()
    }).eq('id', id)

    return { success: true, message: 'Invoice saved' }
  },

  changeStatus: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'update')

    const data = await request.formData()
    const status = blank(data, 'status')
    if (!status) return fail(400, { error: 'Status required' })
    const patch: any = { status, updated_at: new Date().toISOString() }
    if (status === 'sent' || status === 'authorised') patch.sent_at = new Date().toISOString()
    if (status === 'paid') patch.paid_at = new Date().toISOString()

    const { error: upErr } = await sbForUser(userId).from('invoices').update(patch).eq('id', params.id)
    if (upErr) return fail(400, { error: upErr.message })
    return { success: true, message: `Status set to ${status}` }
  },

  addLine: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'update')

    const data = await request.formData()
    const item_id = blank(data, 'item_id')
    if (!item_id) return fail(400, { error: 'Pick an item' })

    const { data: item } = await supabase
      .from('items')
      .select('*, item_tracking_codes(tracking_codes(code))')
      .eq('id', item_id)
      .single()
    if (!item) return fail(400, { error: 'Item not found' })

    const { data: inv } = await supabase.from('invoices').select('currency').eq('id', params.id).single()

    const quantity = num(data, 'quantity') ?? 1
    const unit_price = num(data, 'unit_price') ?? Number((item as any).base_price ?? 0)
    const discount = num(data, 'discount') ?? 0
    const taxPct = Number((item as any).accounting_tax_percentage ?? 15)
    const sub = quantity * unit_price - discount
    const tax_amount = sub * (taxPct / 100)

    const trackingCodes = ((item as any).item_tracking_codes ?? [])
      .map((l: any) => l.tracking_codes?.code)
      .filter((c: string | null | undefined): c is string => !!c)

    const sb = sbForUser(userId)
    const { error: insErr } = await sb.from('invoice_lines').insert({
      invoice_id: params.id,
      item_id,
      description: blank(data, 'description') ?? (item as any).name,
      quantity,
      unit_price,
      discount,
      tax_rate: taxPct,
      tax_amount,
      total: sub + tax_amount,
      currency: (inv as any)?.currency ?? 'ZAR',
      accounting_gl_code: (item as any).accounting_gl_code,
      accounting_item_code: (item as any).accounting_item_code,
      accounting_tax_code: (item as any).accounting_tax_code,
      accounting_tracking_codes: trackingCodes.length ? trackingCodes : null
    })
    if (insErr) return fail(400, { error: insErr.message })

    // Recompute totals
    const { data: lines } = await sb.from('invoice_lines').select('*').eq('invoice_id', params.id)
    const totals = recomputeTotals(lines ?? [])
    const { data: curInv } = await sb.from('invoices').select('amount_paid').eq('id', params.id).single()
    await sb.from('invoices').update({
      ...totals,
      amount_due: totals.total - Number((curInv as any)?.amount_paid ?? 0),
      updated_at: new Date().toISOString()
    }).eq('id', params.id)

    return { success: true, message: 'Line added' }
  },

  updateLine: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'update')

    const data = await request.formData()
    const line_id = blank(data, 'line_id')
    if (!line_id) return fail(400, { error: 'Missing line_id' })

    const quantity = num(data, 'quantity') ?? 1
    const unit_price = num(data, 'unit_price') ?? 0
    const discount = num(data, 'discount') ?? 0
    const taxPct = num(data, 'tax_rate') ?? 15
    const sub = quantity * unit_price - discount
    const tax_amount = sub * (taxPct / 100)

    const patch: any = {
      description: blank(data, 'description'),
      quantity, unit_price, discount,
      tax_rate: taxPct,
      tax_amount,
      total: sub + tax_amount
    }
    const sb = sbForUser(userId)
    const { error: upErr } = await sb.from('invoice_lines').update(patch).eq('id', line_id)
    if (upErr) return fail(400, { error: upErr.message })

    const { data: lines } = await sb.from('invoice_lines').select('*').eq('invoice_id', params.id)
    const totals = recomputeTotals(lines ?? [])
    const { data: curInv } = await sb.from('invoices').select('amount_paid').eq('id', params.id).single()
    await sb.from('invoices').update({
      ...totals,
      amount_due: totals.total - Number((curInv as any)?.amount_paid ?? 0),
      updated_at: new Date().toISOString()
    }).eq('id', params.id)
    return { success: true, message: 'Line saved' }
  },

  removeLine: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'update')

    const data = await request.formData()
    const line_id = blank(data, 'line_id')
    if (!line_id) return fail(400, { error: 'Missing line_id' })

    const sb = sbForUser(userId)
    const { error: delErr } = await sb.from('invoice_lines').delete().eq('id', line_id)
    if (delErr) return fail(400, { error: delErr.message })

    const { data: lines } = await sb.from('invoice_lines').select('*').eq('invoice_id', params.id)
    const totals = recomputeTotals(lines ?? [])
    const { data: curInv } = await sb.from('invoices').select('amount_paid').eq('id', params.id).single()
    await sb.from('invoices').update({
      ...totals,
      amount_due: totals.total - Number((curInv as any)?.amount_paid ?? 0),
      updated_at: new Date().toISOString()
    }).eq('id', params.id)
    return { success: true, message: 'Line removed' }
  },

  delete: async ({ params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'delete')
    const inv = await invoicesService.remove(params.id, userId)
    if (!inv.ok) return fail(400, { error: inv.error })
    throw redirect(303, '/invoices')
  }
}
