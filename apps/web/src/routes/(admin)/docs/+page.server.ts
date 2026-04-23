import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { marked } from 'marked'

const DOCS_DIR = resolve(process.cwd(), '../../docs')
const PAGES = ['ARCHITECTURE.md', 'CONVENTIONS.md', 'CATALOG.md', 'MIGRATION.md', 'BENCHMARK.md', 'TESTING.md', 'SAGE.md', 'PLATFORM_SCHOOL.md'] as const
type DocSlug = 'architecture' | 'conventions' | 'catalog' | 'migration' | 'benchmark' | 'testing' | 'sage' | 'platform-school'

const FILE_BY_SLUG: Record<DocSlug, (typeof PAGES)[number]> = {
  architecture: 'ARCHITECTURE.md',
  conventions: 'CONVENTIONS.md',
  catalog: 'CATALOG.md',
  migration: 'MIGRATION.md',
  benchmark: 'BENCHMARK.md',
  testing: 'TESTING.md',
  sage: 'SAGE.md',
  'platform-school': 'PLATFORM_SCHOOL.md'
}

export const load = async ({ url }) => {
  const slug = (url.searchParams.get('p') ?? 'architecture') as DocSlug
  const file = FILE_BY_SLUG[slug] ?? FILE_BY_SLUG.architecture

  let html = '<p class="muted">Doc not found.</p>'
  try {
    const md = await readFile(resolve(DOCS_DIR, file), 'utf8')
    html = await marked.parse(md, { gfm: true })
  } catch (e) {
    html = `<p class="muted">Failed to read ${file}: ${(e as Error).message}</p>`
  }

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
      { type: 'heading', label: 'Integrations' },
      { type: 'link', slug: 'sage', label: 'Sage' }
    ] as ({ type: 'link'; slug: string; label: string } | { type: 'heading'; label: string })[]
  }
}
