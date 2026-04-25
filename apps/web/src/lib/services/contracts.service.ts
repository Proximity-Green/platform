import { supabase, sbForUser } from '$lib/services/permissions.service'

export type ContractType = 'contract' | 'flexi_agreement' | 'addendum' | 'master_services_agreement'
export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated'

export type ContractInput = {
  organisation_id: string
  type?: ContractType
  reference?: string | null
  title?: string | null
  filename?: string | null
  document_url?: string | null
  signed_at?: string | null
  signed_by_person_id?: string | null
  started_at?: string | null
  ended_at?: string | null
  status?: ContractStatus
  notes?: string | null
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export type ContractRow = {
  id: string
  wsm_id: string | null
  organisation_id: string
  type: ContractType
  reference: string | null
  title: string | null
  filename: string | null
  document_url: string | null
  signed_at: string | null
  signed_by_person_id: string | null
  started_at: string | null
  ended_at: string | null
  status: ContractStatus
  notes: string | null
  created_at: string
  updated_at: string
  organisation_name: string | null
  signer_name: string | null
  linked_sub_count: number
}

export async function listAll(): Promise<ContractRow[]> {
  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('*, organisations(name), persons!contracts_signed_by_person_id_fkey(first_name, last_name)')
    .is('deleted_at', null)
    .is('organisations.deleted_at', null)
    .is('persons.deleted_at', null)
    .order('created_at', { ascending: false })
  if (error || !contracts) return []

  const ids = contracts.map((c: any) => c.id)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: links } = await supabase
      .from('contract_subscription_lines')
      .select('contract_id')
      .in('contract_id', ids)
    for (const l of links ?? []) {
      counts.set((l as any).contract_id, (counts.get((l as any).contract_id) ?? 0) + 1)
    }
  }

  return contracts.map((c: any) => {
    const p = c.persons
    const signer = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : null
    return {
      ...c,
      organisation_name: c.organisations?.name ?? null,
      signer_name: signer || null,
      linked_sub_count: counts.get(c.id) ?? 0
    }
  })
}

export async function listLinked(contract_id: string) {
  const { data } = await supabase
    .from('contract_subscription_lines')
    .select('subscription_line_id, created_at, subscription_lines(*)')
    .eq('contract_id', contract_id)
    .is('subscription_lines.deleted_at', null)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function create(input: ContractInput, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('contracts').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function update(id: string, input: Partial<ContractInput>, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('contracts').update(input).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function remove(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('contracts').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
