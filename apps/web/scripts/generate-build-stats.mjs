#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = join(__dirname, '..')
const REPO_ROOT = join(WEB_ROOT, '..', '..')
const OUT_FILE = join(WEB_ROOT, 'src/lib/generated/build-stats.ts')

const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', '.git', 'build', 'dist', '.vercel', '.turbo'])
const EXTS_CODE = new Set(['.ts', '.tsx', '.js', '.mjs', '.svelte', '.css', '.sql'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    if (entry.name.startsWith('.') && entry.name !== '.') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function extOf(f) {
  const i = f.lastIndexOf('.')
  return i < 0 ? '' : f.slice(i).toLowerCase()
}

function countLines(path) {
  try {
    const s = readFileSync(path, 'utf8')
    return s.length === 0 ? 0 : s.split('\n').length
  } catch { return 0 }
}

function sh(cmd, cwd = REPO_ROOT) {
  try { return execSync(cmd, { cwd, encoding: 'utf8' }).trim() } catch { return '' }
}

const allFiles = walk(REPO_ROOT)

let linesOfCode = 0
let svelteFiles = 0
let tsFiles = 0
let sqlFiles = 0
let cssFiles = 0
let routes = 0
let components = 0

for (const f of allFiles) {
  const ext = extOf(f)
  if (!EXTS_CODE.has(ext)) continue
  linesOfCode += countLines(f)
  if (ext === '.svelte') svelteFiles++
  if (ext === '.ts') tsFiles++
  if (ext === '.sql') sqlFiles++
  if (ext === '.css') cssFiles++
  if (f.includes('/apps/web/src/routes/') && (f.endsWith('+page.svelte') || f.endsWith('+server.ts'))) routes++
  if (f.includes('/apps/web/src/lib/components/')) components++
}

const migrations = allFiles.filter(f => f.includes('/packages/database/migrations/') && f.endsWith('.sql')).length
const commitCount = Number(sh('git rev-list --count HEAD')) || 0
const commitShort = sh('git rev-parse --short HEAD')
const firstCommitIso = sh('git log --reverse --format=%aI | head -1').split('\n')[0] || new Date().toISOString()
const lastCommitIso = sh('git log -1 --format=%aI')
const branch = sh('git rev-parse --abbrev-ref HEAD')
const generatedAt = new Date().toISOString()

mkdirSync(dirname(OUT_FILE), { recursive: true })

const body = `// AUTO-GENERATED at build time by scripts/generate-build-stats.mjs — do not edit.
export const buildStats = {
  linesOfCode: ${linesOfCode},
  svelteFiles: ${svelteFiles},
  tsFiles: ${tsFiles},
  sqlFiles: ${sqlFiles},
  cssFiles: ${cssFiles},
  routes: ${routes},
  components: ${components},
  migrations: ${migrations},
  commitCount: ${commitCount},
  commitShort: ${JSON.stringify(commitShort)},
  branch: ${JSON.stringify(branch)},
  firstCommitIso: ${JSON.stringify(firstCommitIso)},
  lastCommitIso: ${JSON.stringify(lastCommitIso)},
  generatedAt: ${JSON.stringify(generatedAt)}
} as const
`
writeFileSync(OUT_FILE, body, 'utf8')
console.log(`[build-stats] wrote ${relative(WEB_ROOT, OUT_FILE)} — ${linesOfCode.toLocaleString()} LOC across ${allFiles.filter(f => EXTS_CODE.has(extOf(f))).length} files`)
