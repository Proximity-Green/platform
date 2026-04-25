import { supabase, sbForUser } from '$lib/services/permissions.service'

// A space is a named saved query over items. Filter shape:
//   { item_type_slugs?: string[]; location_ids?: string[]; capacity_min?: number; capacity_max?: number; area_min?: number; area_max?: number; ... }
// `manual_item_ids` lets the user pin specific items into the result regardless of filter.
export type SpaceFilter = {
  item_type_slugs?: string[]
  location_ids?: string[]
  capacity_min?: number
  capacity_max?: number
  area_min?: number
  area_max?: number
}

export type Space = {
  id: string
  name: string
  description: string | null
  filter: SpaceFilter
  manual_item_ids: string[] | null
  active: boolean
  created_at: string
  updated_at: string
}

export type SpaceInput = {
  name: string
  description?: string | null
  filter?: SpaceFilter
  manual_item_ids?: string[] | null
  active?: boolean
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export async function listSpaces(): Promise<Space[]> {
  const { data } = await supabase
    .from('spaces')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as Space[]
}

export async function createSpace(input: SpaceInput, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('spaces').insert({
    name: input.name,
    description: input.description ?? null,
    filter: input.filter ?? {},
    manual_item_ids: input.manual_item_ids ?? null,
    active: input.active ?? true
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateSpace(id: string, input: Partial<SpaceInput>, actorId: string | null = null): Promise<ServiceResult> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.filter !== undefined) patch.filter = input.filter
  if (input.manual_item_ids !== undefined) patch.manual_item_ids = input.manual_item_ids
  if (input.active !== undefined) patch.active = input.active
  const { error } = await sbForUser(actorId).from('spaces').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteSpace(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('spaces').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
