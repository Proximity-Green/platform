import { marked } from 'marked'

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
  | 'licence-creation' | 'pricing-forecast'
  | 'subscription-change' | 'onboarding' | 'freeradius'

const FILE_BY_SLUG: Record<DocSlug, string> = {
  architecture: 'ARCHITECTURE.md',
  conventions: 'CONVENTIONS.md',
  catalog: 'CATALOG.md',
  migration: 'MIGRATION.md',
  benchmark: 'BENCHMARK.md',
  testing: 'TESTING.md',
  sage: 'SAGE.md',
  'platform-school': 'PLATFORM_SCHOOL.md',
  'licence-creation': 'LICENCE_CREATION_RULES.md',
  'pricing-forecast': 'PRICING_AND_FORECAST.md',
  'subscription-change': 'SUBSCRIPTION_UPGRADE_DOWNGRADE.md',
  'onboarding': 'ONBOARDING.md',
  'freeradius': 'FREERADIUS_INTEGRATION.md'
}

export const load = async ({ url }) => {
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
      { type: 'link', slug: 'licence-creation', label: 'Licence creation rules' },
      { type: 'link', slug: 'pricing-forecast', label: 'Pricing, discounting & forecast' },
      { type: 'link', slug: 'subscription-change', label: 'Upgrade / downgrade' },
      { type: 'link', slug: 'onboarding', label: 'Onboarding & offboarding' },
      { type: 'heading', label: 'Integrations' },
      { type: 'link', slug: 'sage', label: 'Sage' },
      { type: 'link', slug: 'freeradius', label: 'FreeRADIUS (WiFi)' }
    ] as ({ type: 'link'; slug: string; label: string } | { type: 'heading'; label: string })[]
  }
}
