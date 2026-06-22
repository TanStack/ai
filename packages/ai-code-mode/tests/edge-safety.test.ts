import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Edge-safety guard for issue #487.
 *
 * `@tanstack/ai-code-mode` must bundle cleanly for browsers and edge runtimes
 * (Cloudflare Workers/Pages etc.). That means the source must not import
 * esbuild (a Node-native binary that also pulls in `require("pnpapi")`) or any
 * Node-only built-in module. This is a fast static guard — the full
 * browser/Workers bundle smoke test lives outside the unit suite.
 */

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const srcDir = join(pkgRoot, 'src')

// Modules that break edge/browser bundling if imported from source.
const FORBIDDEN = [
  'esbuild',
  'fs',
  'path',
  'os',
  'child_process',
  'worker_threads',
  'module',
  'vm',
  'crypto',
]

// One matcher per forbidden module, compiled once. Matches the real import
// forms — `from 'mod'`, `import('mod')`, `require('mod')` — tolerating the
// `node:` prefix and a `/subpath` (so `node:fs/promises` is still caught).
const FORBIDDEN_PATTERNS = FORBIDDEN.map((mod) => ({
  mod,
  pattern: new RegExp(
    `(?:from|import|require)\\s*\\(?\\s*['"](?:node:)?${mod}(?:/[^'"]*)?['"]`,
  ),
}))

function collectTsFiles(dir: string): Array<string> {
  const out: Array<string> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectTsFiles(full))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

// Remove comments while PRESERVING string/template literals, so a JSDoc example
// that mentions esbuild (the documented opt-in `transpile` adapter) doesn't trip
// the scan, and — equally important — a `//` or `/* */` sequence inside a string
// literal can't swallow a real import on the same line. The leading
// string-literal alternative is matched first so its contents are consumed (and
// kept) before the comment alternatives can see them.
function stripComments(text: string): string {
  return text.replace(
    /(["'`])(?:\\.|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match, quote: string | undefined) => (quote ? match : ''),
  )
}

describe('edge-safety (#487)', () => {
  it('does not depend on esbuild in any install-facing bucket', () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    // Buckets that pull a package into a consumer's install (and thus its
    // bundle). devDependencies don't ship, so they're intentionally not checked.
    for (const bucket of [
      pkg.dependencies,
      pkg.peerDependencies,
      pkg.optionalDependencies,
    ]) {
      expect(bucket ?? {}).not.toHaveProperty('esbuild')
    }
  })

  it('no source file imports esbuild or a Node-only built-in', () => {
    const files = collectTsFiles(srcDir)
    expect(files.length).toBeGreaterThan(0)

    const offenders: Array<string> = []
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const { mod, pattern } of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) {
          offenders.push(`${file.replace(pkgRoot, '.')} -> ${mod}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('edge-safety guard self-test', () => {
  // Mirror the scan against crafted inputs to lock in the false-positive /
  // false-negative fixes the guard depends on (a comment-only reference must be
  // ignored; a real import must survive even when a comment-like string shares
  // its line; subpath imports must still match).
  const hits = (src: string): Array<string> => {
    const text = stripComments(src)
    return FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
      ({ mod }) => mod,
    )
  }

  it('flags a real Node-only import', () => {
    expect(hits(`import { readFile } from 'fs'`)).toContain('fs')
    expect(hits(`const x = require('esbuild')`)).toContain('esbuild')
  })

  it('ignores a reference that lives only in a comment', () => {
    expect(hits(`/** import { transformSync } from 'esbuild' */`)).toEqual([])
    expect(hits(`// import fs from 'fs'`)).toEqual([])
  })

  it('still flags a real import sharing a line with a comment-like string', () => {
    expect(hits(`const s = "a//b"; import fs from 'fs'`)).toContain('fs')
    expect(
      hits(`const a = "/*"; import { x } from 'path'; const b = "*/"`),
    ).toContain('path')
  })

  it('flags Node-only subpath imports', () => {
    expect(hits(`import { readFile } from 'node:fs/promises'`)).toContain('fs')
    expect(hits(`import x from 'path/posix'`)).toContain('path')
  })
})
