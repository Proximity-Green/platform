import { supabase, sbForUser } from '$lib/services/permissions.service'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type FeatureRequestStatus = 'new' | 'triaged' | 'planned' | 'in_progress' | 'done'

export const STATUSES: FeatureRequestStatus[] = ['new', 'triaged', 'planned', 'in_progress', 'done']

export type FeatureRequestKind = 'feature_request' | 'note'

export const KINDS: FeatureRequestKind[] = ['feature_request', 'note']

export type Tag = { id: string; name: string; color: string }

export type FeatureRequest = {
  id: string
  kind: FeatureRequestKind
  title: string
  summary: string | null
  transcript: ChatMessage[]
  status: FeatureRequestStatus
  created_by: string | null
  created_at: string
  updated_at: string
  vote_count: number
  tags: Tag[]
  viewer_voted: boolean
  author_email: string | null
}

export type FeatureRequestInput = {
  title: string
  kind?: FeatureRequestKind
  summary?: string | null
  transcript?: ChatMessage[]
  created_by?: string | null
}

export type ServiceResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }

const ENTITY = 'feature_request'

async function tagsByEntityIds(entityIds: string[]): Promise<Record<string, Tag[]>> {
  if (!entityIds.length) return {}
  const { data, error } = await supabase
    .from('tag_assignments')
    .select('entity_id, tag_id, tags(id, name, color)')
    .eq('entity_type', ENTITY)
    .in('entity_id', entityIds)
    .is('tags.deleted_at', null)
  if (error || !data) return {}
  const byEntity: Record<string, Tag[]> = {}
  for (const row of data as any[]) {
    const list = byEntity[row.entity_id] ?? (byEntity[row.entity_id] = [])
    if (row.tags) list.push(row.tags as Tag)
  }
  return byEntity
}

async function authorsByUserIds(userIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!ids.length) return {}
  const { data } = await supabase
    .from('persons')
    .select('user_id, email, first_name, last_name')
    .in('user_id', ids)
    .is('deleted_at', null)
  const map: Record<string, string> = {}
  for (const p of (data ?? []) as any[]) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
    map[p.user_id] = name || p.email || 'Unknown'
  }
  return map
}

async function votedRequestIds(userId: string | null, requestIds: string[]): Promise<Set<string>> {
  if (!userId || !requestIds.length) return new Set()
  const { data } = await supabase
    .from('feature_request_votes')
    .select('feature_request_id')
    .eq('user_id', userId)
    .in('feature_request_id', requestIds)
  return new Set((data ?? []).map((r: any) => r.feature_request_id))
}

async function voteCountsByRequestIds(requestIds: string[]): Promise<Record<string, number>> {
  if (!requestIds.length) return {}
  const { data } = await supabase
    .from('feature_request_votes')
    .select('feature_request_id')
    .in('feature_request_id', requestIds)
  const counts: Record<string, number> = {}
  for (const v of (data ?? []) as any[]) {
    counts[v.feature_request_id] = (counts[v.feature_request_id] ?? 0) + 1
  }
  return counts
}

// List query: omit `transcript` (can be tens of KB per row) — callers only need
// it on the detail page. Keeps the list payload small enough for client-side
// filter/search to stay fast at ~1-2k rows.
export async function listAll(
  viewerId: string | null,
  kind?: FeatureRequestKind
): Promise<FeatureRequest[]> {
  let query = supabase
    .from('feature_requests')
    .select('id, kind, title, summary, status, created_by, created_at, updated_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query
  if (error || !data) return []

  const rows = data as any[]
  const ids = rows.map((r) => r.id)
  const authorIds = rows.map((r) => r.created_by).filter(Boolean) as string[]
  const [tagMap, authorMap, voted, counts] = await Promise.all([
    tagsByEntityIds(ids),
    authorsByUserIds(authorIds),
    votedRequestIds(viewerId, ids),
    voteCountsByRequestIds(ids)
  ])

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind ?? 'feature_request',
    title: r.title,
    summary: r.summary,
    transcript: [] as ChatMessage[],
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    vote_count: counts[r.id] ?? 0,
    tags: tagMap[r.id] ?? [],
    viewer_voted: voted.has(r.id),
    author_email: r.created_by ? authorMap[r.created_by] ?? null : null
  }))
}

export async function getById(id: string, viewerId: string | null): Promise<FeatureRequest | null> {
  const { data, error } = await supabase
    .from('feature_requests')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  const r = data as any
  const [tagMap, authorMap, voted, counts] = await Promise.all([
    tagsByEntityIds([r.id]),
    authorsByUserIds(r.created_by ? [r.created_by] : []),
    votedRequestIds(viewerId, [r.id]),
    voteCountsByRequestIds([r.id])
  ])
  return {
    id: r.id,
    kind: r.kind ?? 'feature_request',
    title: r.title,
    summary: r.summary,
    transcript: (r.transcript ?? []) as ChatMessage[],
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    vote_count: counts[r.id] ?? 0,
    tags: tagMap[r.id] ?? [],
    viewer_voted: voted.has(r.id),
    author_email: r.created_by ? authorMap[r.created_by] ?? null : null
  }
}

export async function create(input: FeatureRequestInput): Promise<ServiceResult<{ id: string }>> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Title is required' }
  const kind = input.kind ?? 'feature_request'
  if (!KINDS.includes(kind)) return { ok: false, error: 'Invalid kind' }
  const { data, error } = await sbForUser(input.created_by ?? null)
    .from('feature_requests')
    .insert({
      title,
      kind,
      summary: input.summary?.trim() || null,
      transcript: input.transcript ?? [],
      created_by: input.created_by ?? null
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Create failed' }
  return { ok: true, data: { id: data.id } }
}

export async function updateKind(id: string, kind: FeatureRequestKind, actorId: string | null = null): Promise<ServiceResult> {
  if (!KINDS.includes(kind)) return { ok: false, error: 'Invalid kind' }
  const { error } = await sbForUser(actorId).from('feature_requests').update({ kind }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateStatus(id: string, status: FeatureRequestStatus, actorId: string | null = null): Promise<ServiceResult> {
  if (!STATUSES.includes(status)) return { ok: false, error: 'Invalid status' }
  const { error } = await sbForUser(actorId)
    .from('feature_requests')
    .update({ status })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateDetails(
  id: string,
  input: { title?: string; summary?: string | null },
  actorId: string | null = null
): Promise<ServiceResult> {
  const patch: Record<string, unknown> = {}
  if (typeof input.title === 'string') {
    const t = input.title.trim()
    if (!t) return { ok: false, error: 'Title is required' }
    patch.title = t
  }
  if ('summary' in input) patch.summary = input.summary?.toString().trim() || null
  if (!Object.keys(patch).length) return { ok: true }
  const { error } = await sbForUser(actorId).from('feature_requests').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function remove(id: string, actorId: string | null = null): Promise<ServiceResult> {
  const { error } = await sbForUser(actorId).from('feature_requests').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function addVote(requestId: string, userId: string): Promise<ServiceResult> {
  const { error } = await supabase
    .from('feature_request_votes')
    .insert({ feature_request_id: requestId, user_id: userId })
  if (error && !/duplicate key/i.test(error.message)) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function removeVote(requestId: string, userId: string): Promise<ServiceResult> {
  const { error } = await supabase
    .from('feature_request_votes')
    .delete()
    .eq('feature_request_id', requestId)
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function listTags(): Promise<Tag[]> {
  const { data } = await supabase.from('tags').select('id, name, color').is('deleted_at', null).order('name')
  return (data ?? []) as Tag[]
}

export async function findTagByName(name: string): Promise<Tag | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const { data } = await supabase
    .from('tags')
    .select('id, name, color')
    .ilike('name', trimmed)
    .is('deleted_at', null)
    .maybeSingle()
  return (data as Tag | null) ?? null
}

export async function applyTag(
  requestId: string,
  tagId: string,
  createdBy: string | null
): Promise<ServiceResult> {
  const { error } = await supabase.from('tag_assignments').insert({
    entity_type: ENTITY,
    entity_id: requestId,
    tag_id: tagId,
    created_by: createdBy
  })
  if (error && !/duplicate key|unique/i.test(error.message)) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function removeTagAssignment(requestId: string, tagId: string): Promise<ServiceResult> {
  const { error } = await supabase
    .from('tag_assignments')
    .delete()
    .eq('entity_type', ENTITY)
    .eq('entity_id', requestId)
    .eq('tag_id', tagId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function setTags(requestId: string, tagIds: string[], createdBy: string | null): Promise<ServiceResult> {
  const unique = Array.from(new Set(tagIds))
  const sb = sbForUser(createdBy)
  const { error: delErr } = await sb
    .from('tag_assignments')
    .delete()
    .eq('entity_type', ENTITY)
    .eq('entity_id', requestId)
  if (delErr) return { ok: false, error: delErr.message }
  if (!unique.length) return { ok: true }
  const rows = unique.map((tag_id) => ({
    entity_type: ENTITY,
    entity_id: requestId,
    tag_id,
    created_by: createdBy
  }))
  const { error: insErr } = await sb.from('tag_assignments').insert(rows)
  if (insErr) return { ok: false, error: insErr.message }
  return { ok: true }
}

export async function createTag(name: string, createdBy: string | null): Promise<ServiceResult<Tag>> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Tag name is required' }
  const { data, error } = await supabase
    .from('tags')
    .insert({ name: trimmed, created_by: createdBy })
    .select('id, name, color')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Tag creation failed' }
  return { ok: true, data: data as Tag }
}
