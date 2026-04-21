import { supabase } from '$lib/services/permissions.service'

export type WalletTxnKind = 'topup' | 'draw' | 'refund' | 'adjustment'

export type WalletInput = {
  organisation_id: string
  currency: string
  balance?: number
}

export type WalletTxnInput = {
  wallet_id: string
  invoice_id?: string | null
  kind: WalletTxnKind
  amount: number
  notes?: string | null
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export type WalletRow = {
  id: string
  organisation_id: string
  currency: string
  balance: number
  created_at: string
  updated_at: string
  organisation_name: string | null
  transaction_count: number
}

export async function listAll(): Promise<WalletRow[]> {
  const { data: wallets, error } = await supabase
    .from('wallets')
    .select('*, organisations(name)')
    .order('created_at', { ascending: false })
  if (error || !wallets) return []

  const ids = wallets.map((w: any) => w.id)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('wallet_id')
      .in('wallet_id', ids)
    for (const t of txns ?? []) {
      counts.set((t as any).wallet_id, (counts.get((t as any).wallet_id) ?? 0) + 1)
    }
  }

  return wallets.map((w: any) => ({
    ...w,
    organisation_name: w.organisations?.name ?? null,
    transaction_count: counts.get(w.id) ?? 0
  }))
}

export async function listTransactions(wallet_id: string) {
  const { data } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('wallet_id', wallet_id)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function create(input: WalletInput): Promise<ServiceResult> {
  const { error } = await supabase.from('wallets').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function update(id: string, input: Partial<WalletInput>): Promise<ServiceResult> {
  const { error } = await supabase.from('wallets').update(input).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function remove(id: string): Promise<ServiceResult> {
  const { error } = await supabase.from('wallets').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function addTransaction(input: WalletTxnInput): Promise<ServiceResult> {
  const { data: wallet, error: wErr } = await supabase
    .from('wallets')
    .select('balance')
    .eq('id', input.wallet_id)
    .single()
  if (wErr || !wallet) return { ok: false, error: wErr?.message ?? 'Wallet not found' }

  const currentBalance = Number(wallet.balance ?? 0)
  const newBalance = currentBalance + Number(input.amount)

  const { error: txnErr } = await supabase.from('wallet_transactions').insert({
    wallet_id: input.wallet_id,
    invoice_id: input.invoice_id ?? null,
    kind: input.kind,
    amount: input.amount,
    balance_after: newBalance,
    notes: input.notes ?? null
  })
  if (txnErr) return { ok: false, error: txnErr.message }

  const { error: upErr } = await supabase
    .from('wallets')
    .update({ balance: newBalance })
    .eq('id', input.wallet_id)
  if (upErr) return { ok: false, error: upErr.message }

  return { ok: true }
}
