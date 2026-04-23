import { supabase, sbForUser } from '$lib/services/permissions.service'

export type ItemType = {
  id: string
  slug: string
  name: string
  description: string | null
  family: string | null
  requires_license: boolean
  sellable_ad_hoc: boolean
  sellable_recurring: boolean
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
}

export type ItemTypeInput = {
  slug: string
  name: string
  description?: string | null
  family?: string | null
  requires_license?: boolean
  sellable_ad_hoc?: boolean
  sellable_recurring?: boolean
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export async function listAll(): Promise<ItemType[]> {
  const { data } = await supabase
    .from('item_types')
    .select('*')
    .order('name', { ascending: true })
  return data ?? []
}

export async function create(input: ItemTypeInput, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('item_types').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function update(id: string, input: Partial<ItemTypeInput>, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId)
    .from('item_types')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function remove(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('item_types').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
