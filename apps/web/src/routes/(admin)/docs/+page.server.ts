import { error } from '@sveltejs/kit'
import { marked } from 'marked'
import { getUserIdFromRequest, getUserPermissions } from '$lib/services/permissions.service'

// Docs are bundled into the Vite build at compile time via import.meta.glob.
// This avoids any runtime filesystem access — works identically in dev and
// inside the Docker image (where the repo-root /docs/ folder is not shipped).
// Source of truth: apps/web/src/lib/docs-content/*.md.
const rawDocs = import.meta.glob('../../../lib/docs-content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

const DOC_CONTENT: Record<string, string> = {}
for (const [path, content] of Object.entries(rawDocs)) {
  const filename = path.split('/').pop() as string
  DOC_CONTENT[filename] = content
}

type DocSlug =
  | 'architecture' | 'conventions' | 'catalog' | 'migration'
  | 'benchmark' | 'testing' | 'sage' | 'platform-school'
  | 'subscription-lifecycle' | 'onboarding'
  | 'occupancy' | 'radius'

const FILE_BY_SLUG: Record<DocSlug, string> = {
  architecture: 'ARCHITECTURE.md',
  conventions: 'CONVENTIONS.md',
  catalog: 'CATALOG.md',
  migration: 'MIGRATION.md',
  benchmark: 'BENCHMARK.md',
  testing: 'TESTING.md',
  sage: 'SAGE.md',
  'platform-school': 'PLATFORM_SCHOOL.md',
  'subscription-lifecycle': 'SUBSCRIPTION_LIFECYCLE.md',
  'onboarding': 'ONBOARDING.md',
  'occupancy': 'OCCUPANCY.md',
  'radius': 'RADIUS_INTEGRATION.md'
}

export const load = async ({ url, cookies, locals }) => {
  // Docs are restricted to super_admin only — these are internal design
  // parcels + architecture references, not user-facing material. Layout +
  // TopNav already hide the link for non-super-admins; this server-side
  // gate covers direct-URL access.
  const userId = await getUserIdFromRequest(locals, cookies)
  if (!userId) throw error(401, 'Not signed in')
  const perms = await getUserPermissions(userId)
  if (perms.role !== 'super_admin') throw error(403, 'Docs are restricted to super admins.')

  const slug = (url.searchParams.get('p') ?? 'architecture') as DocSlug
  const file = FILE_BY_SLUG[slug] ?? FILE_BY_SLUG.architecture

  const md = DOC_CONTENT[file]
  const html = md
    ? await marked.parse(md, { gfm: true })
    : `<p class="muted">Doc not found: ${file}</p>`

  return {
    slug,
    html,
    pages: [
      { type: 'link', slug: 'architecture', label: 'Architecture' },
      { type: 'link', slug: 'conventions', label: 'Conventions' },
      { type: 'link', slug: 'catalog', label: 'Catalog & Tracking' },
      { type: 'link', slug: 'migration', label: 'Migration' },
      { type: 'link', slug: 'benchmark', label: 'Benchmark' },
      { type: 'link', slug: 'testing', label: 'Testing' },
      { type: 'link', slug: 'platform-school', label: 'Platform School' },
      { type: 'heading', label: 'Design parcels' },
      { type: 'link', slug: 'subscription-lifecycle', label: 'Subscription lifecycle' },
      { type: 'link', slug: 'onboarding', label: 'Onboarding & offboarding' },
      { type: 'link', slug: 'occupancy', label: 'Occupancy' },
      { type: 'heading', label: 'Integrations' },
      { type: 'link', slug: 'sage', label: 'Sage' },
      { type: 'link', slug: 'radius', label: 'RADIUS (WiFi)' }
    ] as ({ type: 'link'; slug: string; label: string } | { type: 'heading'; label: string })[]
  }
}
