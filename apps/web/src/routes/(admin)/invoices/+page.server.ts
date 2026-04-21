import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as invoicesService from '$lib/services/invoices.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'invoices', 'read')

  const [invoices, linesByInvoiceId, { data: orgs }, { data: locations }] = await Promise.all([
    invoicesService.listAll(),
    invoicesService.listAllLinesGrouped(),
    supabase.from('organisations').select('id, name').order('name'),
    supabase.from('locations').select('id, name, short_name').order('name')
  ])

  return {
    invoices,
    linesByInvoiceId,
    organisations: orgs ?? [],
    locations: locations ?? []
  }
}

const blank = (data: FormData, k: string): string | null => {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}

const num = (data: FormData, k: string): number | null => {
  const v = data.get(k)
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'create')

    const data = await request.formData()
    const organisation_id = blank(data, 'organisation_id')
    const currency = blank(data, 'currency')
    if (!organisation_id) return fail(400, { error: 'Organisation is required' })
    if (!currency) return fail(400, { error: 'Currency is required' })

    const result = await invoicesService.create({
      organisation_id,
      currency,
      kind: (blank(data, 'kind') ?? 'invoice') as invoicesService.InvoiceKind,
      direction: (blank(data, 'direction') ?? 'customer') as invoicesService.InvoiceDirection,
      status: (blank(data, 'status') ?? 'draft') as invoicesService.InvoiceStatus,
      location_id: blank(data, 'location_id'),
      reference: blank(data, 'reference'),
      title: blank(data, 'title'),
      summary: blank(data, 'summary'),
      issued_at: blank(data, 'issued_at'),
      due_at: blank(data, 'due_at'),
      tax_mode: (blank(data, 'tax_mode') ?? 'exclusive') as invoicesService.TaxMode
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Invoice created' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'update')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing id' })

    const result = await invoicesService.update(id, {
      kind: blank(data, 'kind') as invoicesService.InvoiceKind,
      direction: blank(data, 'direction') as invoicesService.InvoiceDirection,
      status: blank(data, 'status') as invoicesService.InvoiceStatus,
      reference: blank(data, 'reference'),
      title: blank(data, 'title'),
      summary: blank(data, 'summary'),
      organisation_id: blank(data, 'organisation_id') ?? undefined,
      location_id: blank(data, 'location_id'),
      issued_at: blank(data, 'issued_at'),
      due_at: blank(data, 'due_at'),
      sent_at: blank(data, 'sent_at'),
      paid_at: blank(data, 'paid_at'),
      currency: blank(data, 'currency') ?? undefined,
      tax_mode: blank(data, 'tax_mode') as invoicesService.TaxMode,
      sub_total: num(data, 'sub_total') ?? undefined,
      tax_total: num(data, 'tax_total') ?? undefined,
      discount_total: num(data, 'discount_total') ?? undefined,
      total: num(data, 'total') ?? undefined,
      notes: blank(data, 'notes')
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Invoice updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'delete')

    const data = await request.formData()
    const result = await invoicesService.remove(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Invoice deleted' }
  },

  loadLines: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'read')

    const data = await request.formData()
    const invoice_id = data.get('invoice_id') as string
    if (!invoice_id) return fail(400, { error: 'Missing invoice_id' })
    const lines = await invoicesService.listLines(invoice_id)
    return { success: true, lines }
  }
}
