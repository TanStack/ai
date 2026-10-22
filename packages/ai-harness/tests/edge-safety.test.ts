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
 * the whole folder. `build.ts` and `worker.ts` are the Node-only `./build`
 * and `./worker` entries. `first-party/files.ts` and
 * `first-party/bound-output.ts` are behind the Node-only `plugins/node` entry.
 * `first-party/coding/` is the Node-only `plugins/coding` entry.
 */
const ALLOWED: Array<string> = [
  'build.ts',
  'worker.ts',
  'first-party/files.ts',
  'first-party/bound-output.ts',
  'first-party/coding/',
]

/** The edge-safe entry points, relative to `src`. */
const EDGE_ENTRIES: Array<string> = [
  'index.ts',
  'client.ts',
  'view/index.ts',
  'server.ts',
  'media-entry.ts',
  'oauth.ts',
  'first-party/index.ts',
]

const isAllowed = (file: string) =>
  ALLOWED.some((entry) =>
    entry.endsWith('/') ? file.startsWith(entry) : file === entry,
  )

const toPosix = (file: string) => relative(srcDir, file).split(sep).join('/')

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

// A relative `import … from`, `export … from`, or `import '…'` that loads with
// the module. `import type`, `export type`, and a dynamic `import('…')` do not
// match: they load nothing when the module loads.
const STATIC_RELATIVE_IMPORT =
  /(?:^|\n)\s*(?:(?:import|export)\s+(?!type\s)[^'"]*?\bfrom\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g

/** The relative specifiers that `source` loads statically. */
const staticRelativeImports = (source: string) =>
  [...stripComments(source).matchAll(STATIC_RELATIVE_IMPORT)].flatMap(
    (match) => match[1] ?? [],
  )

/** The `src` file behind `specifier`, imported from `fromFile`. */
function resolveImport(fromFile: string, specifier: string) {
  const base = resolve(dirname(fromFile), specifier)
  const file = [`${base}.ts`, join(base, 'index.ts')].find(existsSync)
  if (file === undefined) {
    throw new Error(`cannot resolve '${specifier}' from ${toPosix(fromFile)}`)
  }
  return file
}

/** Every `src` file that `entry` loads through static relative imports. */
function staticGraphOf(entry: string) {
  const seen = new Set<string>()
  const queue = [join(srcDir, entry)]
  // The loop also visits the files that it adds to `queue`.
  for (const file of queue) {
    if (seen.has(file)) continue
    seen.add(file)
    const specifiers = staticRelativeImports(readFileSync(file, 'utf8'))
    queue.push(...specifiers.map((specifier) => resolveImport(file, specifier)))
  }
  return [...seen].map(toPosix)
}

describe('edge safety of the harness core', () => {
  it('imports no Node-only module outside the Node entry points', () => {
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

  it('loads no Node entry point from an edge-safe entry point', () => {
    const reached = EDGE_ENTRIES.flatMap((entry) =>
      staticGraphOf(entry)
        .filter(isAllowed)
        .map((file) => `${entry} -> ${file}`),
    )
    expect(reached).toEqual([])
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

  it('follows only the relative imports that load with the module', () => {
    const source = [
      `import { a } from './a'`,
      `import {\n  b,\n} from '../b'`,
      `export { c } from './c'`,
      `import './d'`,
      `import type { E } from './e'`,
      `export type { F } from './f'`,
      `import { chat } from '@tanstack/ai'`,
      `// import { g } from './g'`,
      `async function h() { await import('./h') }`,
    ].join('\n')
    expect(staticRelativeImports(source)).toEqual(['./a', '../b', './c', './d'])
  })

  it('ignores packages whose names start like a built-in', () => {
    expect(importsNode(`import { x } from 'events-polyfill'`)).toBe(false)
    expect(importsNode(`import { chat } from '@tanstack/ai'`)).toBe(false)
  })
})
