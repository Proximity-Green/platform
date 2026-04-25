#!/usr/bin/env node
// Sync repo-root /docs/*.md → apps/web/src/lib/docs-content/*.md so the Vite
// build can bundle them via import.meta.glob. Runs automatically on predev /
// prebuild. In Docker, the build context is apps/web (repo-root /docs is not
// available); the script no-ops gracefully and the committed copies under
// src/lib/docs-content ship as-is.

import { readdirSync, copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../../../docs')
const DST = resolve(__dirname, '../src/lib/docs-content')

if (!existsSync(SRC) || !statSync(SRC).isDirectory()) {
  console.log('[sync-docs] repo-root /docs not present — using committed copies')
  process.exit(0)
}

mkdirSync(DST, { recursive: true })
const files = readdirSync(SRC).filter(f => f.endsWith('.md'))
for (const f of files) copyFileSync(resolve(SRC, f), resolve(DST, f))
console.log(`[sync-docs] synced ${files.length} file(s) from /docs → src/lib/docs-content`)
