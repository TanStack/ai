import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Harness sessions run in edge runtimes, for example inside a Cloudflare
 * Durable Object. So the harness core must load without a Node-only module.
 * Only the Node entry points in ALLOWED may import one. A lazy
 * `await import('node:http')` inside a function is allowed everywhere: it runs
 * only when that function runs (for example a loopback login on a laptop). This
 * is a fast static check of the source files.
 */

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', 'src')

/**
 * Node-only entry points, relative to `src`. A path that ends with `/` allows
 * the whole folder: `first-party/coding/` is the Node-only `plugins/coding` entry.
 */
const ALLOWED = [
  'build.ts',
  'worker.ts',
  'first-party/files.ts',
  'first-party/bound-output.ts',
  'first-party/coding/',
]

const isAllowed = (file: string) =>
  ALLOWED.some((entry) =>
    entry.endsWith('/') ? file.startsWith(entry) : file === entry,
  )

const NODE_BUILTINS = [
  'fs',
  'path',
  'os',
  'child_process',
  'worker_threads',
  'module',
  'vm',
  'crypto',
  'url',
  'stream',
  'events',
  'util',
  'http',
  'https',
  'net',
  'tls',
  'zlib',
  'buffer',
]

// Any `node:` specifier, or a bare built-in with an optional `/subpath`, in a
// form that loads with the module: `from '...'`, `import '...'`, and
// `require('...')`. A dynamic `import('...')` does not match.
const NODE_IMPORT = new RegExp(
  `(?:from\\s*|import\\s+|require\\s*\\(\\s*)['"](?:node:[^'"]+|(?:${NODE_BUILTINS.join('|')})(?:/[^'"]*)?)['"]`,
)

function collectTsFiles(dir: string): Array<string> {
  const files: Array<string> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectTsFiles(full))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

// Remove comments but keep string literals, so an import named in a JSDoc
// example does not count, and a `//` inside a string cannot hide an import.
function stripComments(text: string): string {
  return text.replace(
    /(["'`])(?:\\.|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match, quote: string | undefined) => (quote ? match : ''),
  )
}

const importsNode = (source: string) => NODE_IMPORT.test(stripComments(source))

describe('edge safety of the harness core', () => {
  it('imports no Node-only module outside the Node entry points', () => {
    const toPosix = (file: string) =>
      relative(srcDir, file).split(sep).join('/')
    const files = collectTsFiles(srcDir)
    expect(files.length).toBeGreaterThan(0)

    const offenders = files
      .filter((file) => !isAllowed(toPosix(file)))
      .filter((file) => importsNode(readFileSync(file, 'utf8')))
      .map(toPosix)

    expect(offenders).toEqual([])
  })

  it('lists only Node entry points that exist', () => {
    const missing = ALLOWED.filter((file) => !existsSync(join(srcDir, file)))
    expect(missing).toEqual([])
  })
})

describe('edge safety check', () => {
  it('flags a node: import and a bare built-in import', () => {
    expect(importsNode(`import { readFile } from 'node:fs/promises'`)).toBe(
      true,
    )
    expect(importsNode(`import { createHash } from 'crypto'`)).toBe(true)
    expect(importsNode(`const fs = require('fs')`)).toBe(true)
    expect(importsNode(`import 'node:process'`)).toBe(true)
  })

  it('allows a lazy dynamic import inside a function', () => {
    expect(
      importsNode(`async function f() { await import('node:http') }`),
    ).toBe(false)
  })

  it('ignores an import that is only in a comment', () => {
    expect(importsNode(`// import fs from 'node:fs'`)).toBe(false)
    expect(importsNode(`/** import { join } from 'path' */`)).toBe(false)
  })

  it('flags a real import on a line with a comment-like string', () => {
    expect(importsNode(`const s = "a//b"; import fs from 'fs'`)).toBe(true)
  })

  it('ignores packages whose names start like a built-in', () => {
    expect(importsNode(`import { x } from 'events-polyfill'`)).toBe(false)
    expect(importsNode(`import { chat } from '@tanstack/ai'`)).toBe(false)
  })
})
