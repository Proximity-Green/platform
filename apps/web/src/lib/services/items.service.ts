import { supabase, sbForUser } from '$lib/services/permissions.service'

export type Item = {
  id: string
  wsm_id: string | null
  item_type_id: string
  location_id: string | null
  name: string
  description: string | null
  sku: string | null
  base_rate: number | null
  base_rate_override: boolean
  accounting_gl_code: string | null
  accounting_item_code: string | null
  accounting_tax_code: string | null
  accounting_tax_percentage: number | null
  accounting_description: string | null
  active: boolean
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
}

export type ItemEnriched = Item & {
  item_type_name: string | null
  item_type_slug: string | null
  location_name: string | null
}

export type ItemInput = {
  item_type_id: string
  location_id?: string | null
  name: string
  description?: string | null
  sku?: string | null
  base_rate?: number | null
  base_rate_override?: boolean
  accounting_gl_code?: string | null
  accounting_item_code?: string | null
  accounting_tax_code?: string | null
  accounting_tax_percentage?: number | null
  accounting_description?: string | null
  active?: boolean
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export async function listAll(): Promise<ItemEnriched[]> {
  const { data } = await supabase
    .from('items')
    .select('*, item_types!inner(slug, name), locations(name, short_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row: any) => ({
    ...row,
    item_type_name: row.item_types?.name ?? null,
    item_type_slug: row.item_types?.slug ?? null,
    location_name: row.locations?.short_name ?? row.locations?.name ?? null
  })) as ItemEnriched[]
}

export async function create(input: ItemInput, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('items').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function update(id: string, input: Partial<ItemInput>, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId)
    .from('items')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function remove(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('items').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
