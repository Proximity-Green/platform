import { fail, error, redirect } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase, sbForUser } from '$lib/services/permissions.service'
import { logFail } from '$lib/services/action-log.service'
import * as walletsService from '$lib/services/wallets.service'
import * as subsService from '$lib/services/subscription-lines.service'
import * as invoicesService from '$lib/services/invoices.service'
import { createLicence } from '$lib/services/licence-creation.service'

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

export const load = async ({ params, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'organisations', 'read')

  const id = params.id

  const { data: organisation, error: orgErr } = await supabase
    .from('organisations')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (orgErr || !organisation) throw error(404, 'Organisation not found')

  const [
    licencesRes,
    subsRes,
    contractsRes,
    invoicesRes,
    invoiceLinesRes,
    walletsRes,
    walletTxnsRes,
    accountingCustomersRes,
    membersRes,
    locationsRes,
    orgsRes,
    personsRes,
    itemsRes
  ] = await Promise.all([
    supabase
      .from('licenses')
      .select(`
        *,
        items(name),
        locations(name, short_name, currency),
        persons:user_id(first_name, last_name)
      `)
      .eq('organisation_id', id)
      .is('deleted_at', null)
      .is('items.deleted_at', null)
      .is('locations.deleted_at', null)
      .is('persons.deleted_at', null)
      .order('started_at', { ascending: false }),
    supabase
      .from('subscription_lines')
      .select(`
        *,
        items(name, accounting_tax_percentage),
        licenses(item_id, items(name, accounting_tax_percentage), locations(name)),
        locations(name),
        persons:user_id(first_name, last_name)
      `)
      .eq('organisation_id', id)
      .is('deleted_at', null)
      .is('items.deleted_at', null)
      .is('licenses.deleted_at', null)
      .is('licenses.items.deleted_at', null)
      .is('licenses.locations.deleted_at', null)
      .is('locations.deleted_at', null)
      .is('persons.deleted_at', null)
      .order('started_at', { ascending: false }),
    supabase
      .from('contracts')
      .select('*, persons!contracts_signed_by_person_id_fkey(first_name, last_name)')
      .eq('organisation_id', id)
      .is('deleted_at', null)
      .is('persons.deleted_at', null)
      .order('started_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('invoices')
      .select('*')
      .eq('organisation_id', id)
      .order('issued_at', { ascending: false, nullsFirst: false }),
    // invoice_lines: join via invoices to limit to this org's lines only
    supabase
      .from('invoice_lines')
      .select('invoice_id, invoices!inner(organisation_id)')
      .eq('invoices.organisation_id', id),
    supabase
      .from('wallets')
      .select('*')
      .eq('organisation_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('wallet_transactions')
      .select('*, wallets!inner(organisation_id)')
      .eq('wallets.organisation_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('organisation_accounting_customers')
      .select('*')
      .eq('organisation_id', id)
      .order('is_primary', { ascending: false })
      .order('connected_at', { ascending: false }),
    supabase
      .from('persons')
      .select('id, first_name, last_name, email, phone, job_title, status, started_at, onboarded_at')
      .eq('organisation_id', id)
      .is('deleted_at', null)
      .order('first_name', { ascending: true }),
    supabase.from('locations').select('id, name, short_name, currency').is('deleted_at', null).order('name'),
    supabase.from('organisations').select('id, name').is('deleted_at', null).order('name'),
    supabase
      .from('persons')
      .select('id, first_name, last_name, email, organisation_id')
      .is('deleted_at', null)
      .order('first_name'),
    supabase
      .from('items')
      .select('id, name, item_type_id, location_id, base_rate, accounting_tax_percentage, item_types(slug, requires_license, sellable_recurring, sellable_ad_hoc)')
      .eq('active', true)
      .is('deleted_at', null)
      .is('item_types.deleted_at', null)
      .order('name')
  ])

  // Item-types lookup for the Licences cascading add form. Small enough to
  // load up-front (~12 rows); avoids adding a new endpoint round-trip.
  const itemTypesPromise = supabase
    .from('item_types')
    .select('id, slug, name')
    .is('deleted_at', null)
    .order('name')
    .then(r => r.data ?? [])

  // Build licence_id → paired-sub map so the licences row can show the
  // *snapshot* rate (subscription_lines.base_rate at creation time), not the
  // live items.base_rate. Per the platform rule, item-price changes don't
  // cascade to existing licences/subs. Filter out terminal-status subs so a
  // superseded sub's rate doesn't shadow the active one.
  const TERMINAL_SUB_STATUSES = new Set(['superseded', 'cancelled', 'expired', 'ended'])
  const pairedSubByLicenceId = new Map<string, { base_rate: number; currency: string }>()
  for (const s of (subsRes.data ?? []) as any[]) {
    if (s.license_id && !TERMINAL_SUB_STATUSES.has(s.status)) {
      pairedSubByLicenceId.set(s.license_id, { base_rate: s.base_rate, currency: s.currency })
    }
  }

  // Enrich licences. Prefer location.short_name for the table cell so the
  // Location column stays compact ("20 Kloof" not "20 Kloof by Workshop17");
  // full name kept around in case future detail views need it. Rate +
  // currency come from the paired sub snapshot — `null` here means the
  // 1:1 invariant is broken (orphaned licence) and the UI should show "—".
  const licences = (licencesRes.data ?? []).map((row: any) => {
    const paired = pairedSubByLicenceId.get(row.id)
    return {
      ...row,
      item_name: row.items?.name ?? null,
      base_rate: paired?.base_rate ?? null,
      location_name: row.locations?.short_name ?? row.locations?.name ?? null,
      location_full_name: row.locations?.name ?? null,
      currency: paired?.currency ?? row.locations?.currency ?? null,
      user_name: row.persons
        ? `${row.persons.first_name ?? ''} ${row.persons.last_name ?? ''}`.trim() || null
        : null
    }
  })

  // Enrich subscription lines (with tax % for Ex/Incl VAT display + member + location)
  const subs = (subsRes.data ?? []).map((row: any) => {
    const itemName = row.items?.name ?? null
    const licItemName = row.licenses?.items?.name ?? null
    const itemTax = row.items?.accounting_tax_percentage
    const licTax = row.licenses?.items?.accounting_tax_percentage
    const taxPct = (itemTax ?? licTax ?? 15) as number
    const p = row.persons
    const memberName = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : null
    return {
      ...row,
      item_name: itemName,
      license_item_name: licItemName,
      source_kind: row.item_id ? 'Product' : 'License',
      description_title: itemName ?? licItemName ?? '—',
      member_name: memberName,
      location_name: row.locations?.name ?? row.licenses?.locations?.name ?? null,
      tax_percentage: taxPct
    }
  })

  // Enrich contracts
  const contracts = (contractsRes.data ?? []).map((row: any) => {
    const p = row.persons
    const signer = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : null
    return { ...row, signer_name: signer || null }
  })

  // Invoice line count map
  const invoiceLineCounts = new Map<string, number>()
  for (const l of invoiceLinesRes.data ?? []) {
    const key = (l as any).invoice_id
    invoiceLineCounts.set(key, (invoiceLineCounts.get(key) ?? 0) + 1)
  }
  const invoices = (invoicesRes.data ?? []).map((i: any) => ({
    ...i,
    line_count: invoiceLineCounts.get(i.id) ?? 0
  }))

  // Wallet transactions grouped per wallet (recent 10 only)
  const walletTxnsByWalletId: Record<string, any[]> = {}
  for (const t of walletTxnsRes.data ?? []) {
    const key = (t as any).wallet_id
    const list = (walletTxnsByWalletId[key] ??= [])
    if (list.length < 10) list.push(t)
  }

  const members = membersRes.data ?? []
  const allPersons = personsRes.data ?? []
  const allItemTypes = await itemTypesPromise

  // Licences are reserved for licence-flow item types — currently the
  // platform only uses the licences table for memberships, but the schema
  // is permissive (any item_type with `requires_license = true` qualifies).
  // Pre-compute the eligible items + types so the cascading add form
  // doesn't have to know the rule.
  const allItems = (itemsRes.data ?? []) as any[]
  const licenceItemTypeIds = new Set(
    allItems
      .filter(i => i.item_types?.requires_license === true)
      .map(i => i.item_type_id)
      .filter(Boolean)
  )
  const licenceableItemTypes = allItemTypes.filter((t: any) => licenceItemTypeIds.has(t.id))
  const licenceableItems = allItems
    .filter(i => i.item_types?.requires_license === true)
    .map(i => ({
      id: i.id,
      name: i.name,
      item_type_id: i.item_type_id,
      location_id: i.location_id
    }))

  return {
    organisation,
    licences,
    subs,
    contracts,
    invoices,
    wallets: walletsRes.data ?? [],
    walletTxnsByWalletId,
    accountingCustomers: accountingCustomersRes.data ?? [],
    members,
    locations: locationsRes.data ?? [],
    organisations: (orgsRes.data ?? []).filter((o: any) => o.id !== id),
    persons: allPersons,
    items: itemsRes.data ?? [],
    licenceableItems,
    licenceableItemTypes,
    viewerId: userId
  }
}

export const actions = {
  update: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'organisations', 'update')

    const data = await request.formData()
    const id = params.id

    const status = (data.get('status') as string) || 'active'
    const type = (data.get('type') as string) || 'member'

    const patch: Record<string, any> = {
      name: (data.get('name') as string) ?? '',
      legal_name: blank(data, 'legal_name'),
      short_name: blank(data, 'short_name'),
      slug: blank(data, 'slug'),
      company_registration_number: blank(data, 'company_registration_number'),
      vat_number: blank(data, 'vat_number'),
      logo_url: blank(data, 'logo_url'),
      about: blank(data, 'about'),
      industry: blank(data, 'industry'),
      type,
      status,

      email: blank(data, 'email'),
      phone: blank(data, 'phone'),
      mobile: blank(data, 'mobile'),
      website: blank(data, 'website'),

      accounting_email: blank(data, 'accounting_email'),
      accounting_address_line_1: blank(data, 'accounting_address_line_1'),
      accounting_address_line_2: blank(data, 'accounting_address_line_2'),
      accounting_city: blank(data, 'accounting_city'),
      accounting_postal_code: blank(data, 'accounting_postal_code'),
      accounting_country_code: blank(data, 'accounting_country_code'),

      delivery_address_line_1: blank(data, 'delivery_address_line_1'),
      delivery_address_line_2: blank(data, 'delivery_address_line_2'),
      delivery_city: blank(data, 'delivery_city'),
      delivery_postal_code: blank(data, 'delivery_postal_code'),
      delivery_country_code: blank(data, 'delivery_country_code'),

      started_at: blank(data, 'started_at'),
      onboarded_at: blank(data, 'onboarded_at'),
      offboarded_at: blank(data, 'offboarded_at'),

      signatory_person_id: blank(data, 'signatory_person_id'),
      parent_organisation_id: blank(data, 'parent_organisation_id'),
      billing_currency: blank(data, 'billing_currency') ?? 'ZAR',
      updated_at: new Date().toISOString()
    }

    if (!patch.name) return fail(400, { error: 'Name is required' })

    const { error: upErr } = await sbForUser(userId).from('organisations').update(patch).eq('id', id)
    if (upErr) return await logFail(userId, 'organisations.update', upErr)
    return { success: true, message: 'Organisation updated' }
  },

  addAccountingCustomer: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'organisations', 'update')

    const data = await request.formData()
    const provider = blank(data, 'provider')
    const tenantId = blank(data, 'accounting_external_tenant_id')
    const customerId = blank(data, 'accounting_external_customer_id')
    if (!provider) return fail(400, { error: 'Provider is required' })
    if (!tenantId) return fail(400, { error: 'Tenant ID is required' })
    if (!customerId) return fail(400, { error: 'Customer ID is required' })

    const { error: insErr } = await sbForUser(userId).from('organisation_accounting_customers').insert({
      organisation_id: params.id,
      provider,
      accounting_external_tenant_id: tenantId,
      accounting_external_customer_id: customerId,
      accounting_external_customer_code: blank(data, 'accounting_external_customer_code'),
      is_primary: data.get('is_primary') === 'on'
    })
    if (insErr) return await logFail(userId, 'organisations.addAccountingCustomer', insErr)
    return { success: true, message: 'Accounting customer linked' }
  },

  setStatus: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'organisations', 'update')

    const data = await request.formData()
    const status = blank(data, 'status')
    if (!status) return fail(400, { error: 'status required' })

    const { error: upErr } = await sbForUser(userId)
      .from('organisations')
      .update({ status })
      .eq('id', params.id)
    if (upErr) return logFail(userId, 'organisations.setStatus', upErr, { status, id: params.id })

    return { success: true, message: `Status set to ${status}` }
  },

  addWalletTransaction: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'wallets', 'update')

    const data = await request.formData()
    const wallet_id = blank(data, 'wallet_id')
    const kindRaw = blank(data, 'kind')
    const amount = num(data, 'amount')
    if (!wallet_id) return fail(400, { error: 'Missing wallet_id' })
    if (!kindRaw) return fail(400, { error: 'Kind is required' })
    if (amount == null) return fail(400, { error: 'Amount is required' })

    const result = await walletsService.addTransaction({
      wallet_id,
      kind: kindRaw as walletsService.WalletTxnKind,
      amount,
      notes: blank(data, 'notes')
    }, userId)
    if (!result.ok) return await logFail(userId, 'organisations.addWalletTransaction', result.error)
    return { success: true, message: 'Transaction added' }
  },

  updateSub: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'update')

    const data = await request.formData()
    const id = blank(data, 'id')
    if (!id) return fail(400, { error: 'Missing sub id' })

    const patch: Record<string, any> = {}
    if (data.has('quantity')) patch.quantity = num(data, 'quantity') ?? 1
    if (data.has('base_rate')) patch.base_rate = num(data, 'base_rate') ?? 0
    if (data.has('started_at')) patch.started_at = blank(data, 'started_at')
    if (data.has('ended_at')) patch.ended_at = blank(data, 'ended_at')
    if (data.has('user_id')) patch.user_id = blank(data, 'user_id')
    if (data.has('location_id')) patch.location_id = blank(data, 'location_id')
    if (data.has('notes')) patch.notes = blank(data, 'notes')

    const result = await subsService.update(id, patch, userId)
    if (!result.ok) return await logFail(userId, 'organisations.updateSub', result.error)
    return { success: true, message: 'Subscription line updated' }
  },

  createSub: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'create')

    const data = await request.formData()
    const item_id = blank(data, 'item_id')
    const location_id = blank(data, 'location_id')
    if (!item_id) return fail(400, { error: 'Item is required' })
    if (!location_id) return fail(400, { error: 'Location is required' })

    // Branch on item type: licence-requiring items go through the V1
    // licence-creation service so the rules + atomic licence+sub insert
    // are enforced. Item-backed (no licence) products keep the existing
    // path — they don't carry licence semantics.
    const { data: it } = await supabase
      .from('items')
      .select('id, base_rate, item_types(requires_license)')
      .eq('id', item_id)
      .is('deleted_at', null)
      .is('item_types.deleted_at', null)
      .single()
    const requiresLicense = (it as any)?.item_types?.requires_license === true

    if (requiresLicense) {
      // Route through createLicence — handles overlap check, member-in-org
      // check, item validation, atomic licence+sub insert with snapshotted
      // rate from item.base_rate. Form's custom base_rate / quantity are
      // intentionally ignored per Rule 8 (no overrides at creation time);
      // operators edit the paired sub afterwards if needed.
      const result = await createLicence({
        organisation_id: params.id,
        item_id,
        location_id,
        user_id: (data.get('user_id') as string) ?? '',
        started_at: blank(data, 'started_at') ?? new Date().toISOString().slice(0, 10),
        ended_at: blank(data, 'ended_at'),
        notes: blank(data, 'notes')
      }, userId)
      if (!result.ok) {
        await logFail(userId, 'organisations.createSub', new Error(result.error.detail ?? result.error.title), {
          org_id: params.id,
          code: result.error.code
        })
        return fail(400, { error: result.error.title, actionable: result.error })
      }
      return { success: true, message: 'Licence + subscription added' }
    }

    // Item-backed (non-licence) sub: existing path stays as-is.
    const { data: loc } = await supabase.from('locations').select('currency').eq('id', location_id).is('deleted_at', null).single()
    const itemRate = Number((it as any)?.base_rate ?? 0)
    const formRate = num(data, 'base_rate')
    const subBaseRate = formRate != null && formRate > 0 ? formRate : itemRate

    const result = await subsService.create({
      item_id,
      license_id: null,
      organisation_id: params.id,
      location_id,
      user_id: blank(data, 'user_id'),
      base_rate: subBaseRate,
      currency: loc?.currency ?? 'ZAR',
      quantity: num(data, 'quantity') ?? 1,
      frequency: 'monthly',
      interval_months: 1,
      status: 'draft',
      started_at: blank(data, 'started_at') ?? new Date().toISOString().slice(0, 10),
      ended_at: blank(data, 'ended_at'),
      notes: blank(data, 'notes')
    } as any, userId)
    if (!result.ok) return await logFail(userId, 'organisations.createSub', result.error)
    return { success: true, message: 'Subscription line added' }
  },

  createInvoiceFromSubs: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'create')

    const data = await request.formData()
    const subIds = data.getAll('sub_id') as string[]
    const kind = (blank(data, 'kind') ?? 'invoice') as 'invoice' | 'quote'
    if (subIds.length === 0) return fail(400, { error: 'Select at least one line' })

    // Load subs + their items
    const { data: subs, error: subErr } = await supabase
      .from('subscription_lines')
      .select(`
        id, organisation_id, location_id, currency, base_rate, quantity, item_id, license_id,
        items(name, accounting_gl_code, accounting_item_code, accounting_tax_code, item_tracking_codes(tracking_codes(code))),
        licenses(items(name, accounting_gl_code, accounting_item_code, accounting_tax_code, item_tracking_codes(tracking_codes(code))))
      `)
      .in('id', subIds)
      .is('deleted_at', null)
      .is('items.deleted_at', null)
      .is('items.item_tracking_codes.tracking_codes.deleted_at', null)
      .is('licenses.deleted_at', null)
      .is('licenses.items.deleted_at', null)
      .is('licenses.items.item_tracking_codes.tracking_codes.deleted_at', null)
    if (subErr || !subs?.length) return fail(400, { error: subErr?.message ?? 'No subs found' })

    const first = subs[0] as any
    const subTotal = subs.reduce((s: number, x: any) => s + Number(x.base_rate) * Number(x.quantity ?? 1), 0)

    const sb = sbForUser(userId)
    const { data: invoice, error: invErr } = await sb.from('invoices').insert({
      kind,
      direction: 'customer',
      status: kind === 'quote' ? 'quote' : 'draft',
      organisation_id: params.id,
      location_id: first.location_id,
      currency: first.currency,
      tax_mode: 'exclusive',
      sub_total: subTotal,
      total: subTotal,
      amount_due: subTotal,
      issued_at: new Date().toISOString(),
      due_at: new Date(Date.now() + 14 * 86400_000).toISOString()
    }).select('id').single()

    if (invErr || !invoice) return fail(400, { error: invErr?.message ?? 'Failed to create invoice' })

    for (const s of subs as any[]) {
      const meta = s.item_id ? s.items : s.licenses?.items
      const qty = Number(s.quantity ?? 1)
      const up = Number(s.base_rate)
      await sb.from('invoice_lines').insert({
        invoice_id: invoice.id,
        subscription_line_id: s.id,
        description: meta?.name ?? 'Subscription charge',
        quantity: qty,
        unit_price: up,
        total: qty * up,
        currency: s.currency,
        accounting_gl_code: meta?.accounting_gl_code,
        accounting_item_code: meta?.accounting_item_code,
        accounting_tax_code: meta?.accounting_tax_code,
        accounting_tracking_codes: (() => {
          const codes = ((meta?.item_tracking_codes ?? []) as any[])
            .map(l => l.tracking_codes?.code)
            .filter((c: string | null | undefined): c is string => !!c)
          return codes.length ? codes : null
        })()
      })
    }

    throw redirect(303, `/invoices/${invoice.id}/edit`)
  },

  createBlankInvoice: async ({ params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'invoices', 'create')

    const { data: org } = await supabase.from('organisations').select('billing_currency').eq('id', params.id).is('deleted_at', null).single()
    const currency = (org as any)?.billing_currency ?? 'ZAR'

    const { data: invoice, error: invErr } = await sbForUser(userId).from('invoices').insert({
      kind: 'invoice',
      direction: 'customer',
      status: 'draft',
      organisation_id: params.id,
      currency,
      tax_mode: 'exclusive',
      issued_at: new Date().toISOString(),
      due_at: new Date(Date.now() + 14 * 86400_000).toISOString()
    }).select('id').single()

    if (invErr || !invoice) return fail(400, { error: invErr?.message ?? 'Failed' })
    throw redirect(303, `/invoices/${invoice.id}/edit`)
  },

  delete: async ({ params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'organisations', 'delete')

    const { error: delErr } = await sbForUser(userId).from('organisations').delete().eq('id', params.id)
    if (delErr) return await logFail(userId, 'organisations.delete', delErr)
    throw redirect(303, '/organisations')
  },

  addLicence: async ({ request, params, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'create')

    const data = await request.formData()
    // Route through the V1 licence-creation service. The service owns rules
    // 1–7 from docs/SUBSCRIPTION_LIFECYCLE.md (required inputs, item must
    // require licence, member belongs to org, location consistency, date
    // sanity, no overlap) and delegates the atomic insert to
    // add_licence_with_sub. Other entry points (the /licenses page, the
    // createSub auto-licence path) will route through the same service in
    // follow-up PRs.
    const result = await createLicence({
      organisation_id: params.id,
      item_id: (data.get('item_id') as string) ?? '',
      location_id: blank(data, 'location_id'),
      user_id: (data.get('user_id') as string) ?? '',
      started_at: (data.get('started_at') as string) ?? '',
      ended_at: blank(data, 'ended_at'),
      notes: blank(data, 'notes')
    }, userId)

    if (!result.ok) {
      // Log to action_log for diagnostic + surface ActionableError to the
      // form so <ErrorBanner> renders the user-facing message.
      await logFail(userId, 'organisations.addLicence', new Error(result.error.detail ?? result.error.title), {
        org_id: params.id,
        code: result.error.code
      })
      return fail(400, { error: result.error.title, actionable: result.error })
    }

    return {
      success: true,
      message: 'Licence + subscription added',
      result: {
        licence_id: result.licence_id,
        subscription_line_id: result.subscription_line_id,
        base_rate: result.base_rate,
        currency: result.currency
      }
    }
  },

  removeLicence: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'delete')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing id' })

    const { error: delErr } = await sbForUser(userId).from('licenses').delete().eq('id', id)
    if (delErr) return await logFail(userId, 'organisations.removeLicence', delErr, { id })
    return { success: true, message: 'Licence removed' }
  },

  updateLicence: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'subscriptions', 'update')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing licence id' })

    // Build a partial patch — only set fields the form actually carried.
    const patch: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    if (data.has('user_id'))    patch.user_id    = blank(data, 'user_id')
    if (data.has('started_at')) patch.started_at = blank(data, 'started_at')
    if (data.has('ended_at'))   patch.ended_at   = blank(data, 'ended_at')
    if (data.has('notes'))      patch.notes      = blank(data, 'notes')

    const sb = sbForUser(userId)
    const { error: licErr } = await sb.from('licenses').update(patch).eq('id', id)
    if (licErr) return await logFail(userId, 'organisations.updateLicence', licErr, { id })

    // Keep the paired sub aligned per the 1:1 invariant — same dates +
    // user. Rate is left alone (would be the snapshot pricing concern of
    // a separate edit). Status untouched.
    const subPatch: Record<string, any> = { updated_at: new Date().toISOString() }
    if (data.has('user_id'))    subPatch.user_id    = blank(data, 'user_id')
    if (data.has('started_at')) subPatch.started_at = blank(data, 'started_at')
    if (data.has('ended_at'))   subPatch.ended_at   = blank(data, 'ended_at')
    if (data.has('notes'))      subPatch.notes      = blank(data, 'notes')
    const { error: subErr } = await sb
      .from('subscription_lines')
      .update(subPatch)
      .eq('license_id', id)
      .not('status', 'in', '(superseded,cancelled,expired,ended)')
    if (subErr) return await logFail(userId, 'organisations.updateLicence.pairedSub', subErr, { id })

    return { success: true, message: 'Licence updated' }
  }
}
