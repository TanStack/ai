#!/usr/bin/env node
// Fails CI if any `@ts-ignore` or `@ts-nocheck` comment slips into the
// TypeScript library source under packages/typescript/<pkg>/src/.
//
// `@ts-expect-error` is permitted (and required to carry a description by
// the `tanstack/ai/typed` ESLint block) because it self-heals — the
// suppression turns into an error if the underlying issue ever resolves,
// whereas `@ts-ignore` silently rots.
//
// Issue #564 baseline: zero matches at introduction. Adopt this guard so
// future regressions surface in CI rather than during incident triage.

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN_ROOT = join(ROOT, 'packages/typescript')
const FORBIDDEN = /@ts-(ignore|nocheck)\b/

/** Walk every `src/` directory under packages/typescript/*. */
async function* walkSrcFiles() {
  const packages = await readdir(SCAN_ROOT, { withFileTypes: true })
  for (const pkg of packages) {
    if (!pkg.isDirectory()) continue
    const srcDir = join(SCAN_ROOT, pkg.name, 'src')
    try {
      const s = await stat(srcDir)
      if (!s.isDirectory()) continue
    } catch {
      continue // package has no src/
    }
    yield* walkDir(srcDir)
  }
}

async function* walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      yield* walkDir(fullPath)
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      yield fullPath
    }
  }
}

const matches = []
for await (const file of walkSrcFiles()) {
  const text = await readFile(file, 'utf8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (FORBIDDEN.test(lines[i])) {
      matches.push(`${relative(ROOT, file)}:${i + 1}: ${lines[i].trim()}`)
    }
  }
}

if (matches.length > 0) {
  console.error(
    'Forbidden TypeScript suppression(s) detected (use `@ts-expect-error` with a description instead):',
  )
  for (const m of matches) console.error(`  ${m}`)
  process.exit(1)
}

console.log('No `@ts-ignore` or `@ts-nocheck` suppressions in library source.')
