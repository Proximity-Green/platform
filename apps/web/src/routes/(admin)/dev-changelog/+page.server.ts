import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { marked } from 'marked'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'settings', 'read')

  const candidates = [
    resolve(process.cwd(), 'CHANGELOG.md'),
    resolve(process.cwd(), '../../CHANGELOG.md')
  ]

  let md = '# No changelog found'
  for (const p of candidates) {
    try {
      md = await readFile(p, 'utf8')
      break
    } catch {}
  }

  const html = await marked.parse(md, { gfm: true })
  return { html }
}
