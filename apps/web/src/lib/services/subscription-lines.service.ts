import { supabase, sbForUser } from '$lib/services/permissions.service'

export type SubscriptionStatus =
  | 'draft'
  | 'option'
  | 'pending'
  | 'signed'
  | 'paused'
  | 'ended'
  | 'cancelled'
  | 'expired'
  | 'superseded'

export type SubscriptionFrequency = 'monthly' | 'quarterly' | 'annually' | 'custom'

export type SubscriptionLine = {
  id: string
  wsm_id: string | null
  item_id: string | null
  license_id: string | null
  organisation_id: string
  location_id: string
  user_id: string | null
  base_rate: number
  currency: string
  quantity: number
  frequency: SubscriptionFrequency | null
  interval_months: number
  status: SubscriptionStatus
  started_at: string
  ended_at: string | null
  next_invoice_at: string | null
  proposed_at: string | null
  expires_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  supersedes_subscription_line_id: string | null
  version: number
  option_group_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type SubscriptionLineEnriched = SubscriptionLine & {
  item_name: string | null
  license_item_name: string | null
  organisation_name: string | null
  location_name: string | null
  user_name: string | null
}

export type SubscriptionLineInput = {
  item_id?: string | null
  license_id?: string | null
  organisation_id: string
  location_id: string
  user_id?: string | null
  base_rate: number
  currency: string
  quantity?: number
  frequency?: SubscriptionFrequency | null
  interval_months?: number
  status?: SubscriptionStatus
  started_at: string
  ended_at?: string | null
  next_invoice_at?: string | null
  proposed_at?: string | null
  expires_at?: string | null
  accepted_at?: string | null
  rejected_at?: string | null
  cancelled_at?: string | null
  cancellation_reason?: string | null
  supersedes_subscription_line_id?: string | null
  option_group_id?: string | null
  notes?: string | null
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export async function listAll(): Promise<SubscriptionLineEnriched[]> {
  const { data } = await supabase
    .from('subscription_lines')
    .select(`
      *,
      items(name),
      licenses(item_id, items(name)),
      organisations(name),
      locations(name),
      persons:user_id(first_name, last_name)
    `)
    .is('deleted_at', null)
    .is('items.deleted_at', null)
    .is('licenses.deleted_at', null)
    .is('organisations.deleted_at', null)
    .is('locations.deleted_at', null)
    .is('persons.deleted_at', null)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row: any) => ({
    ...row,
    item_name: row.items?.name ?? null,
    license_item_name: row.licenses?.items?.name ?? null,
    organisation_name: row.organisations?.name ?? null,
    location_name: row.locations?.name ?? null,
    user_name: row.persons
      ? `${row.persons.first_name ?? ''} ${row.persons.last_name ?? ''}`.trim() || null
      : null
  })) as SubscriptionLineEnriched[]
}

export async function create(input: SubscriptionLineInput, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('subscription_lines').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function update(id: string, input: Partial<SubscriptionLineInput>, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId)
    .from('subscription_lines')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function remove(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('subscription_lines').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function setStatus(
  id: string,
  status: SubscriptionStatus,
  extras: Partial<SubscriptionLineInput> = {},
  actorId: string | null = null
): Promise<ServiceResult> {
  const patch: Record<string, any> = { status, ...extras, updated_at: new Date().toISOString() }
  const { error } = await sbForUser(actorId).from('subscription_lines').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Convert a subscription into a draft customer invoice.
 *
 * Creates:
 *   - 1 invoice row (kind=invoice, direction=customer, status=draft)
 *   - 1 invoice_line row (subscription_line_id=<sub>) with the sub's rate
 *
 * Returns the new invoice ID.
 *
 * NOTE: TypeScript-sequenced multi-write. When we hit production scale we should
 * turn this into a Postgres RPC (SECURITY DEFINER) so the 2 writes are atomic.
 * For POC it's fine — worst case an orphan invoice row, easily cleaned up.
 */
export async function convertToInvoice(
  subscriptionLineId: string,
  options: { issued_at?: string; due_days?: number } = {},
  actorId: string | null = null
): Promise<{ ok: true; invoice_id: string } | { ok: false; error: string }> {
  const sb = sbForUser(actorId)
  const { data: sub, error: subErr } = await sb
    .from('subscription_lines')
    .select(`
      id, organisation_id, location_id, currency, base_rate, quantity,
      item_id, license_id, status,
      items(name, accounting_gl_code, accounting_item_code, accounting_tax_code, item_tracking_codes(tracking_codes(code))),
      licenses(item_id, items(name, accounting_gl_code, accounting_item_code, accounting_tax_code, item_tracking_codes(tracking_codes(code))))
    `)
    .eq('id', subscriptionLineId)
    .is('deleted_at', null)
    .is('items.deleted_at', null)
    .is('items.item_tracking_codes.tracking_codes.deleted_at', null)
    .is('licenses.deleted_at', null)
    .is('licenses.items.deleted_at', null)
    .is('licenses.items.item_tracking_codes.tracking_codes.deleted_at', null)
    .single()

  if (subErr || !sub) return { ok: false, error: subErr?.message ?? 'Subscription not found' }
  if (sub.status !== 'signed')
    return { ok: false, error: `Can only invoice signed subscriptions (status=${sub.status})` }

  // Pull description + accounting codes from either direct item or licenced item
  const itemMeta: any = sub.item_id ? (sub as any).items : (sub as any).licenses?.items
  const description = itemMeta?.name ?? 'Subscription charge'

  const issuedAt = options.issued_at ?? new Date().toISOString()
  const dueAt = new Date(Date.parse(issuedAt) + (options.due_days ?? 14) * 86400_000).toISOString()

  const quantity = Number(sub.quantity ?? 1)
  const unitPrice = Number(sub.base_rate)
  const lineTotal = unitPrice * quantity

  const { data: invoice, error: invErr } = await sb
    .from('invoices')
    .insert({
      kind: 'invoice',
      direction: 'customer',
      status: 'draft',
      organisation_id: sub.organisation_id,
      location_id: sub.location_id,
      currency: sub.currency,
      tax_mode: 'exclusive',
      sub_total: lineTotal,
      tax_total: 0,
      discount_total: 0,
      total: lineTotal,
      amount_paid: 0,
      amount_due: lineTotal,
      issued_at: issuedAt,
      due_at: dueAt,
      title: description
    })
    .select('id')
    .single()

  if (invErr || !invoice) return { ok: false, error: invErr?.message ?? 'Failed to create invoice' }

  const { error: lineErr } = await sb.from('invoice_lines').insert({
    invoice_id: invoice.id,
    subscription_line_id: sub.id,
    description,
    quantity,
    unit_price: unitPrice,
    tax_amount: 0,
    discount: 0,
    total: lineTotal,
    currency: sub.currency,
    accounting_gl_code: itemMeta?.accounting_gl_code,
    accounting_item_code: itemMeta?.accounting_item_code,
    accounting_tax_code: itemMeta?.accounting_tax_code,
    accounting_tracking_codes: (itemMeta?.item_tracking_codes ?? [])
      .map((l: any) => l.tracking_codes?.code)
      .filter((c: string | null | undefined): c is string => !!c)
  })

  if (lineErr) {
    // Roll back the invoice row to avoid orphan
    await sb.from('invoices').delete().eq('id', invoice.id)
    return { ok: false, error: lineErr.message }
  }

  return { ok: true, invoice_id: invoice.id }
}
