import { json } from '@sveltejs/kit'
import { supabase, getUserIdFromRequest } from '$lib/services/permissions.service'

type Hit = {
  kind: 'organisation' | 'person' | 'location' | 'item' | 'invoice' | 'subscription'
  id: string
  title: string
  subtitle: string | null
  href: string
}

const LIMIT_PER_KIND = 5

export const GET = async ({ url, cookies, locals }) => {
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return json({ hits: [] })

  // Require an authenticated user; don't surface data to anonymous callers
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) return json({ hits: [] })

  const like = `%${q.replace(/[%_]/g, '\\$&')}%`

  const [orgsRes, personsRes, locationsRes, itemsRes, invoicesRes, subsRes] = await Promise.all([
    supabase
      .from('organisations')
      .select('id, name, short_name, slug')
      .or(`name.ilike.${like},short_name.ilike.${like},slug.ilike.${like},legal_name.ilike.${like}`)
      .limit(LIMIT_PER_KIND),
    supabase
      .from('persons')
      .select('id, first_name, last_name, email')
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      .limit(LIMIT_PER_KIND),
    supabase
      .from('locations')
      .select('id, name, short_name')
      .or(`name.ilike.${like},short_name.ilike.${like}`)
      .limit(LIMIT_PER_KIND),
    supabase
      .from('items')
      .select(`
        id, name,
        locations(short_name, name),
        item_tracking_codes(tracking_codes(code))
      `)
      .ilike('name', like)
      .limit(LIMIT_PER_KIND),
    supabase
      .from('invoices')
      .select('id, reference, title, status')
      .or(`reference.ilike.${like},title.ilike.${like}`)
      .limit(LIMIT_PER_KIND),
    supabase
      .from('subscription_lines')
      .select('id, notes, organisation_id')
      .ilike('notes', like)
      .limit(LIMIT_PER_KIND)
  ])

  const hits: Hit[] = []

  for (const o of orgsRes.data ?? []) {
    hits.push({
      kind: 'organisation',
      id: o.id,
      title: o.name,
      subtitle: o.short_name ?? o.slug ?? null,
      href: `/organisations/${o.id}?tab=properties`
    })
  }
  for (const p of personsRes.data ?? []) {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || p.id
    hits.push({
      kind: 'person',
      id: p.id,
      title: name,
      subtitle: p.email ?? null,
      href: `/people?id=${p.id}`
    })
  }
  for (const l of locationsRes.data ?? []) {
    hits.push({
      kind: 'location',
      id: l.id,
      title: l.name,
      subtitle: l.short_name ?? null,
      href: `/locations?id=${l.id}`
    })
  }
  for (const i of itemsRes.data ?? []) {
    const loc = (i as any).locations?.short_name ?? (i as any).locations?.name ?? null
    const links = ((i as any).item_tracking_codes ?? []) as Array<{ tracking_codes: { code: string } | null }>
    const codes = links.map(l => l.tracking_codes?.code).filter(Boolean) as string[]
    const codeStr = codes.length ? codes.join(' · ') : null
    const parts = [loc, codeStr].filter(Boolean)
    hits.push({
      kind: 'item',
      id: i.id,
      title: i.name,
      subtitle: parts.length ? parts.join(' · ') : null,
      href: `/items?id=${i.id}`
    })
  }
  for (const inv of invoicesRes.data ?? []) {
    hits.push({
      kind: 'invoice',
      id: inv.id,
      title: inv.reference ?? inv.id.slice(0, 8),
      subtitle: inv.title ?? inv.status,
      href: `/invoices/${inv.id}/edit`
    })
  }
  for (const s of subsRes.data ?? []) {
    hits.push({
      kind: 'subscription',
      id: s.id,
      title: s.notes ?? 'Subscription line',
      subtitle: null,
      href: `/organisations/${s.organisation_id}?tab=subscription`
    })
  }

  return json({ hits })
}
