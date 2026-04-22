import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count: n, error } = await q
  if (error) return 0
  return n ?? 0
}

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')

  const [
    organisations,
    people,
    items,
    itemTypes,
    locations,
    trackingCodes,
    subsSigned,
    subsAll,
    invoices,
    wallets,
    licences
  ] = await Promise.all([
    count('organisations'),
    count('persons'),
    count('items'),
    count('item_types'),
    count('locations'),
    count('tracking_codes', q => q.eq('active', true)),
    count('subscription_lines', q => q.eq('status', 'signed')),
    count('subscription_lines'),
    count('invoices'),
    count('wallets'),
    count('licences')
  ])

  return {
    platform: {
      organisations,
      people,
      items,
      itemTypes,
      locations,
      trackingCodes,
      subsSigned,
      subsAll,
      invoices,
      wallets,
      licences
    }
  }
}
