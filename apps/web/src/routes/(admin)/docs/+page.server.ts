import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { marked } from 'marked'

const DOCS_DIR = resolve(process.cwd(), '../../docs')
const PAGES = ['ARCHITECTURE.md', 'CONVENTIONS.md'] as const
type DocSlug = 'architecture' | 'conventions'

const FILE_BY_SLUG: Record<DocSlug, (typeof PAGES)[number]> = {
  architecture: 'ARCHITECTURE.md',
  conventions: 'CONVENTIONS.md'
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
      { slug: 'architecture', label: 'Architecture' },
      { slug: 'conventions', label: 'Conventions' }
    ]
  }
}
