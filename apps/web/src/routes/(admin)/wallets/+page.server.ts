import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as walletsService from '$lib/services/wallets.service'
import { logFail } from '$lib/services/action-log.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'wallets', 'read')

  const [wallets, { data: orgs }, { data: txns }] = await Promise.all([
    walletsService.listAll(),
    supabase.from('organisations').select('id, name').is('deleted_at', null).order('name'),
    supabase
      .from('wallet_transactions')
      .select('*')
      .order('created_at', { ascending: false })
  ])

  const txnsByWalletId: Record<string, any[]> = {}
  for (const t of txns ?? []) {
    const key = (t as any).wallet_id
    ;(txnsByWalletId[key] ??= []).push(t)
  }

  return {
    wallets,
    txnsByWalletId,
    organisations: orgs ?? []
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
    if (userId) await requirePermission(userId, 'wallets', 'create')

    const data = await request.formData()
    const organisation_id = blank(data, 'organisation_id')
    const currency = blank(data, 'currency')
    if (!organisation_id) return fail(400, { error: 'Organisation is required' })
    if (!currency) return fail(400, { error: 'Currency is required' })

    const result = await walletsService.create({
      organisation_id,
      currency,
      balance: num(data, 'balance') ?? 0
    }, userId)
    if (!result.ok) return await logFail(userId, 'wallets.create', result.error)
    return { success: true, message: 'Wallet created' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'wallets', 'update')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing id' })

    const result = await walletsService.update(id, {
      currency: blank(data, 'currency') ?? undefined
    }, userId)
    if (!result.ok) return await logFail(userId, 'wallets.update', result.error)
    return { success: true, message: 'Wallet updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'wallets', 'delete')

    const data = await request.formData()
    const result = await walletsService.remove(data.get('id') as string, userId)
    if (!result.ok) return await logFail(userId, 'wallets.delete', result.error)
    return { success: true, message: 'Wallet deleted' }
  },

  addTransaction: async ({ request, cookies, locals }) => {
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
    if (!result.ok) return await logFail(userId, 'wallets.addTransaction', result.error)
    return { success: true, message: 'Transaction added' }
  }
}
