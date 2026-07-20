#!/usr/bin/env node
/**
 * Scan built package declarations for dangling relative imports.
 *
 * Under bundler/node16/nodenext resolution, an explicit `.js` specifier is
 * remapped to a sibling `.d.ts` and does **not** fall back to `/index`.
 * Directory-barrel imports emitted as `../utils.js` therefore fail to resolve
 * (the real file is `utils/index.d.ts`). Consumers usually set
 * `skipLibCheck: true`, so the unresolved import silently becomes `any`
 * instead of erroring — degrading public types without a signal.
 *
 * This check runs on the producer side over built package dist declarations so
 * regressions fail CI regardless of consumer tsconfig.
 *
 * Run after a packages build:
 *   pnpm build:all && pnpm test:dts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = join(ROOT, 'packages')

/** @param {string} dir @param {string[]} out */
function walkDts(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const st = statSync(path)
    if (st.isDirectory()) {
      if (entry !== 'node_modules') walkDts(path, out)
    } else if (entry.endsWith('.d.ts') && !entry.endsWith('.d.ts.map')) {
      out.push(path)
    }
  }
  return out
}

/**
 * Whether a relative declaration import resolves to a real file.
 * Explicit `.js`/`.mjs`/`.cjs` extensions do **not** fall back to `/index`
 * (matching TypeScript bundler/node16/nodenext behavior).
 *
 * @param {string} fromFile
 * @param {string} specifier
 */
function resolves(fromFile, specifier) {
  const abs = resolve(dirname(fromFile), specifier)

  if (/\.(js|mjs|cjs)$/.test(specifier)) {
    const noext = abs.replace(/\.(js|mjs|cjs)$/, '')
    return ['.d.ts', '.d.mts', '.d.cts', '.ts', '.tsx'].some((ext) =>
      existsSync(noext + ext),
    )
  }

  return (
    ['.d.ts', '.ts', '.tsx'].some((ext) => existsSync(abs + ext)) ||
    ['/index.d.ts', '/index.ts'].some((suffix) => existsSync(abs + suffix))
  )
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+)['"]/g

const packageNames = existsSync(PACKAGES_DIR)
  ? readdirSync(PACKAGES_DIR).filter((name) => {
      try {
        return statSync(join(PACKAGES_DIR, name)).isDirectory()
      } catch {
        return false
      }
    })
  : []

const dists = packageNames
  .map((name) => join(PACKAGES_DIR, name, 'dist'))
  .filter((dir) => existsSync(dir))

if (dists.length === 0) {
  // No built declarations to scan. This is the normal state when `nx affected`
  // built nothing — e.g. a docs / skill / CI-only PR that touches no package.
  // There are no `.d.ts` files, so nothing could have regressed; skip cleanly.
  // (Running standalone? Build first — `pnpm build:all` — then re-run.)
  console.log(
    'scan-dangling-dts: no packages/*/dist directories found — nothing to scan (no packages built). Skipping.',
  )
  process.exit(0)
}

/** @type {string[]} */
const findings = []
let filesScanned = 0

for (const dist of dists) {
  for (const file of walkDts(dist)) {
    filesScanned += 1
    const src = readFileSync(file, 'utf8')
    IMPORT_RE.lastIndex = 0
    let match
    while ((match = IMPORT_RE.exec(src))) {
      const specifier = match[1]
      if (!resolves(file, specifier)) {
        findings.push(`${specifier}  <-  ${relative(ROOT, file)}`)
      }
    }
  }
}

const unique = [...new Set(findings)].sort()

if (unique.length === 0) {
  console.log(
    `scan-dangling-dts: clean (${filesScanned} .d.ts files across ${dists.length} package dist dirs)`,
  )
  process.exit(0)
}

console.error(
  'scan-dangling-dts: dangling relative imports in published .d.ts:\n',
)
console.error(unique.join('\n'))
console.error(
  `\n${unique.length} dangling specifier(s). Prefer concrete module paths (e.g. '../utils/client') or explicit '/index' so the declaration emit resolves under bundler/node16/nodenext.`,
)
process.exit(1)
