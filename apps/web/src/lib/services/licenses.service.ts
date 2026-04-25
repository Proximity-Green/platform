import { supabase, sbForUser } from '$lib/services/permissions.service'

export type License = {
  id: string
  wsm_id: string | null
  item_id: string
  organisation_id: string
  location_id: string
  user_id: string | null
  started_at: string
  ended_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type LicenseEnriched = License & {
  item_name: string | null
  organisation_name: string | null
  location_name: string | null
  user_name: string | null
}

export type LicenseInput = {
  item_id: string
  organisation_id: string
  location_id: string
  user_id?: string | null
  started_at: string
  ended_at?: string | null
  notes?: string | null
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

export async function listAll(): Promise<LicenseEnriched[]> {
  const { data } = await supabase
    .from('licenses')
    .select(`
      *,
      items(name),
      organisations(name),
      locations(name),
      persons:user_id(first_name, last_name)
    `)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row: any) => ({
    ...row,
    item_name: row.items?.name ?? null,
    organisation_name: row.organisations?.name ?? null,
    location_name: row.locations?.name ?? null,
    user_name: row.persons
      ? `${row.persons.first_name ?? ''} ${row.persons.last_name ?? ''}`.trim() || null
      : null
  })) as LicenseEnriched[]
}

export async function create(input: LicenseInput, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('licenses').insert(input)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function update(id: string, input: Partial<LicenseInput>, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId)
    .from('licenses')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function remove(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('licenses').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
