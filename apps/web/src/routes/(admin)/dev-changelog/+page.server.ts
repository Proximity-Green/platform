import { requirePermission, getUserIdFromRequest } from '$lib/services/permissions.service'
import fs from 'fs'
import path from 'path'

export const load = async ({ cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'settings', 'read')

  // Read CHANGELOG.md from repo root
  let content = ''
  try {
    // In production build, the file is at the project root
    const filePath = path.resolve('CHANGELOG.md')
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    try {
      content = fs.readFileSync(path.resolve('../../CHANGELOG.md'), 'utf-8')
    } catch {
      content = '# No changelog found'
    }
  }

  return { content }
}
