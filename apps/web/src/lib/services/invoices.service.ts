import { supabase } from '$lib/services/permissions.service'

export type InvoiceKind = 'invoice' | 'credit_note' | 'quote'
export type InvoiceDirection = 'customer' | 'supplier'
export type InvoiceStatus = 'quote' | 'draft' | 'authorised' | 'sent' | 'paid' | 'cancelled'
export type TaxMode = 'inclusive' | 'exclusive'

export type InvoiceInput = {
  kind?: InvoiceKind
  direction?: InvoiceDirection
  status?: InvoiceStatus
  parent_invoice_id?: string | null
  organisation_id: string
  location_id?: string | null
  reference?: string | null
  title?: string | null
  summary?: string | null
  issued_at?: string | null
  due_at?: string | null
  sent_at?: string | null
  paid_at?: string | null
  currency: string
  tax_mode?: TaxMode
  sub_total?: number
  tax_total?: number
  discount_total?: number
  total?: number
  amount_paid?: number
  amount_due?: number
  notes?: string | null
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export type InvoiceRow = {
  id: string
  wsm_id: string | null
  kind: InvoiceKind
  direction: InvoiceDirection
  status: InvoiceStatus
  parent_invoice_id: string | null
  organisation_id: string
  location_id: string | null
  reference: string | null
  title: string | null
  summary: string | null
  issued_at: string | null
  due_at: string | null
  sent_at: string | null
  paid_at: string | null
  currency: string
  tax_mode: TaxMode
  sub_total: number
  tax_total: number
  discount_total: number
  total: number
  amount_paid: number
  amount_due: number
  accounting_sync_status: string | null
  accounting_sync_at: string | null
  accounting_sync_error: string | null
  accounting_external_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  organisation_name: string | null
  location_name: string | null
  line_count: number
}

export async function listAll(): Promise<InvoiceRow[]> {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*, organisations(name), locations(name)')
    .order('issued_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error || !invoices) return []

  const ids = invoices.map((i: any) => i.id)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('invoice_id')
      .in('invoice_id', ids)
    for (const l of lines ?? []) {
      counts.set((l as any).invoice_id, (counts.get((l as any).invoice_id) ?? 0) + 1)
    }
  }

  return invoices.map((i: any) => ({
    ...i,
    organisation_name: i.organisations?.name ?? null,
    location_name: i.locations?.name ?? null,
    line_count: counts.get(i.id) ?? 0
  }))
}

export async function listLines(invoice_id: string) {
  const { data } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoice_id)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function listAllLinesGrouped(): Promise<Record<string, any[]>> {
  const { data } = await supabase
    .from('invoice_lines')
    .select('*')
    .order('created_at', { ascending: true })
  const grouped: Record<string, any[]> = {}
  for (const l of data ?? []) {
    const key = (l as any).invoice_id
    ;(grouped[key] ??= []).push(l)
  }
  return grouped
}

export async function create(input: InvoiceInput): Promise<ServiceResult> {
  const { error } = await supabase.from('invoices').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function update(id: string, input: Partial<InvoiceInput>): Promise<ServiceResult> {
  const { error } = await supabase.from('invoices').update(input).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function remove(id: string): Promise<ServiceResult> {
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
