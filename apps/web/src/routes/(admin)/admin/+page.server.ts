import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'
import { env } from '$env/dynamic/private'

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count: n, error } = await q
  if (error) return 0
  return n ?? 0
}

export type CommitRow = {
  sha: string
  short: string
  message: string
  author: string
  date: string
  url: string
  additions: number | null
  deletions: number | null
  filesChanged: number | null
}

const REPO = 'Proximity-Green/platform'
const COMMIT_LIST_LIMIT = 20

// Last N commits on main from GitHub, each enriched with file/line stats.
// Token via GITHUB_TOKEN (or GH_TOKEN) — required because the repo is private.
// Returns null when the token is missing or the API errors so the UI can
// render a friendly empty state.
async function fetchCommits(): Promise<CommitRow[] | null> {
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN ?? ''
  if (!token) return null
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'proximity-platform-admin'
  }
  try {
    const listRes = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=${COMMIT_LIST_LIMIT}&sha=main`, { headers })
    if (!listRes.ok) return null
    const list = (await listRes.json()) as any[]
    // Fan out: one detail call per commit to pick up the stats block.
    const detailed = await Promise.all(list.map(async (r): Promise<CommitRow> => {
      const det = await fetch(`https://api.github.com/repos/${REPO}/commits/${r.sha}`, { headers })
        .then(d => (d.ok ? d.json() : null))
        .catch(() => null)
      return {
        sha: r.sha,
        short: String(r.sha).slice(0, 7),
        message: (r.commit?.message ?? '').split('\n')[0],
        author: r.commit?.author?.name ?? '—',
        date: r.commit?.author?.date ?? '',
        url: r.html_url ?? '',
        additions: det?.stats?.additions ?? null,
        deletions: det?.stats?.deletions ?? null,
        filesChanged: Array.isArray(det?.files) ? det.files.length : null
      }
    }))
    return detailed
  } catch {
    return null
  }
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
    },
    // Streamed: GitHub round-trip is ~1s+ so don't block the dashboard shell.
    commits: fetchCommits()
  }
}
