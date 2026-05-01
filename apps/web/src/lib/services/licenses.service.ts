import { supabase, sbForUser } from '$lib/services/permissions.service'
import { createLicence } from '$lib/services/licence-creation.service'

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
    .is('deleted_at', null)
    .is('items.deleted_at', null)
    .is('organisations.deleted_at', null)
    .is('locations.deleted_at', null)
    .is('persons.deleted_at', null)
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

/**
 * Create a licence. Routes through the V1 licence-creation service so
 * rules 1–7 (member required + in-org, item must require licence + be
 * active, location consistency, date sanity, no overlap) are enforced
 * regardless of which call site invokes us. The atomic licence+sub
 * insert is delegated to add_licence_with_sub via the service.
 *
 * Returns the simpler ServiceResult shape for backwards compatibility
 * with existing call sites; the ActionableError detail is flattened to
 * its title. Call createLicence directly if you want the structured
 * error.
 */
export async function create(input: LicenseInput, actorId: string | null = null): Promise<ServiceResult> {
  if (!input.user_id) {
    return { ok: false, error: 'Member required: a licence must be assigned to a member.' }
  }
  const result = await createLicence({
    organisation_id: input.organisation_id,
    item_id: input.item_id,
    location_id: input.location_id,
    user_id: input.user_id,
    started_at: input.started_at,
    ended_at: input.ended_at ?? null,
    notes: input.notes ?? null
  }, actorId)
  if (!result.ok) return { ok: false, error: result.error.title + (result.error.detail ? ` — ${result.error.detail}` : '') }
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
