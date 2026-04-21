import { fail } from '@sveltejs/kit'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import * as contractsService from '$lib/services/contracts.service'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'contracts', 'read')

  const [contracts, { data: orgs }, { data: persons }, { data: links }] = await Promise.all([
    contractsService.listAll(),
    supabase.from('organisations').select('id, name').order('name'),
    supabase.from('persons').select('id, first_name, last_name').order('first_name'),
    supabase
      .from('contract_subscription_lines')
      .select('contract_id, subscription_line_id, subscription_lines(id, description, quantity, unit_price, currency)')
  ])

  const linksByContractId: Record<string, any[]> = {}
  for (const l of links ?? []) {
    const key = (l as any).contract_id
    ;(linksByContractId[key] ??= []).push(l)
  }

  return {
    contracts,
    linksByContractId,
    organisations: orgs ?? [],
    persons: persons ?? []
  }
}

const blank = (data: FormData, k: string): string | null => {
  const v = data.get(k)
  return v == null || v === '' ? null : (v as string)
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'contracts', 'create')

    const data = await request.formData()
    const organisation_id = blank(data, 'organisation_id')
    if (!organisation_id) return fail(400, { error: 'Organisation is required' })

    const result = await contractsService.create({
      organisation_id,
      type: (blank(data, 'type') ?? 'contract') as contractsService.ContractType,
      reference: blank(data, 'reference'),
      title: blank(data, 'title'),
      filename: blank(data, 'filename'),
      document_url: blank(data, 'document_url'),
      signed_at: blank(data, 'signed_at'),
      signed_by_person_id: blank(data, 'signed_by_person_id'),
      started_at: blank(data, 'started_at'),
      ended_at: blank(data, 'ended_at'),
      status: (blank(data, 'status') ?? 'draft') as contractsService.ContractStatus
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Contract created' }
  },

  update: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'contracts', 'update')

    const data = await request.formData()
    const id = data.get('id') as string
    if (!id) return fail(400, { error: 'Missing id' })

    const result = await contractsService.update(id, {
      type: blank(data, 'type') as contractsService.ContractType,
      reference: blank(data, 'reference'),
      title: blank(data, 'title'),
      filename: blank(data, 'filename'),
      document_url: blank(data, 'document_url'),
      signed_at: blank(data, 'signed_at'),
      signed_by_person_id: blank(data, 'signed_by_person_id'),
      started_at: blank(data, 'started_at'),
      ended_at: blank(data, 'ended_at'),
      status: blank(data, 'status') as contractsService.ContractStatus,
      notes: blank(data, 'notes')
    })
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Contract updated' }
  },

  delete: async ({ request, cookies, locals }) => {
    const userId = await getUserIdFromRequest(locals, cookies)
    if (userId) await requirePermission(userId, 'contracts', 'delete')

    const data = await request.formData()
    const result = await contractsService.remove(data.get('id') as string)
    if (!result.ok) return fail(400, { error: result.error })
    return { success: true, message: 'Contract deleted' }
  }
}
