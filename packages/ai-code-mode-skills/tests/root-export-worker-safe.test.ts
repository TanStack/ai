import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as rootEntry from '../src/index'

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src')

/** Resolve a `.`-relative import specifier to its on-disk source file. */
async function resolveRelative(
  entry: string,
  spec: string,
): Promise<string | undefined> {
  const base = resolve(dirname(entry), spec)
  // Try the literal path first (covers `./foo.js` NodeNext/ESM-style specifiers
  // whose source is `foo.ts`), then the usual TS source extensions and barrels.
  const candidates = [
    base,
    base.replace(/\.[cm]?js$/, '.ts'),
    base.replace(/\.[cm]?js$/, '.tsx'),
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ]
  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8')
      return candidate
    } catch (err) {
      // Only "file not found" means "try the next candidate"; anything else
      // (permissions, decode failure) is a real problem and must surface.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
  return undefined
}

/**
 * Walk the transitive module graph of an entry file (following only relative
 * imports — package imports are treated as leaves) and collect every
 * `node:`-prefixed builtin it statically references. Both static `from '…'`
 * forms and dynamic `import('…')` calls are followed.
 *
 * This guards the regression behind issue #486: the root entry must stay safe
 * to bundle for Cloudflare Workers / browsers, so it must not statically reach
 * the Node-only file storage that imports `node:fs` / `node:path`.
 */
async function collectNodeBuiltins(
  entry: string,
  seen = new Set<string>(),
  builtins = new Set<string>(),
): Promise<Set<string>> {
  if (seen.has(entry)) return builtins
  seen.add(entry)

  const source = await readFile(entry, 'utf8')
  // Static `import/export … from '…'` plus dynamic `import('…')`.
  const specRe =
    /(?:(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"])|(?:import\s*\(\s*['"]([^'"]+)['"]\s*\))/g

  for (const match of source.matchAll(specRe)) {
    const spec = match[1] ?? match[2]
    if (!spec) continue

    if (spec.startsWith('node:')) {
      builtins.add(spec)
      continue
    }

    if (spec.startsWith('.')) {
      const resolved = await resolveRelative(entry, spec)
      if (!resolved) {
        // A real relative import the walker can't follow would silently drop a
        // subtree (and any node: import in it), turning this guard into a false
        // pass. Fail loudly instead.
        throw new Error(
          `Could not resolve relative import "${spec}" from "${entry}". ` +
            `The module-graph walk would silently skip this subtree and the ` +
            `#486 guard would be unsound.`,
        )
      }
      await collectNodeBuiltins(resolved, seen, builtins)
    }
  }

  return builtins
}

describe('root export worker/browser safety (#486)', () => {
  it('does not statically import any node: builtin from the root entry', async () => {
    const builtins = await collectNodeBuiltins(resolve(SRC_DIR, 'index.ts'))
    expect([...builtins]).toEqual([])
  })

  it('keeps node: builtins reachable through the /storage subpath', async () => {
    const builtins = await collectNodeBuiltins(
      resolve(SRC_DIR, 'storage/index.ts'),
    )
    expect([...builtins].sort()).toEqual([
      'node:fs',
      'node:fs/promises',
      'node:path',
    ])
  })

  it('re-exports the browser-safe memory storage but not the Node-only file storage from root', () => {
    // The public contract issue #486 is about: the root entry must expose the
    // in-memory storage and must NOT expose the Node-only file storage.
    expect(typeof rootEntry.createMemorySkillStorage).toBe('function')
    expect(
      (rootEntry as Record<string, unknown>).createFileSkillStorage,
    ).toBeUndefined()
  })
})
