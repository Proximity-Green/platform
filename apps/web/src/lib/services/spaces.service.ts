import { supabase, sbForUser } from '$lib/services/permissions.service'

export type SpaceInput = {
  location_id: string
  name: string
  code?: string | null
  description?: string | null
  capacity?: number | null
  area_sqm?: number | null
  floor?: string | null
  active?: boolean
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export async function listSpaces() {
  const { data } = await supabase
    .from('spaces')
    .select(`
      *,
      location:locations(id, name, slug)
    `)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function createSpace(input: SpaceInput, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('spaces').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateSpace(id: string, input: Partial<SpaceInput>, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('spaces').update(input).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteSpace(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('spaces').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
