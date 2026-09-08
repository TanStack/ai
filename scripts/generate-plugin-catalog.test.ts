import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CATALOG_PATH,
  buildCatalog,
  collectPackages,
} from './generate-plugin-catalog'

const roots: Array<string> = []

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function makePackages(
  packages: Array<{
    dir: string
    manifest: Record<string, unknown>
    skills?: Array<string>
  }>,
) {
  const root = mkdtempSync(join(tmpdir(), 'plugin-catalog-'))
  roots.push(root)
  for (const pkg of packages) {
    mkdirSync(join(root, pkg.dir), { recursive: true })
    writeFileSync(
      join(root, pkg.dir, 'package.json'),
      JSON.stringify(pkg.manifest),
    )
    for (const skill of pkg.skills ?? []) {
      mkdirSync(join(root, pkg.dir, 'skills', skill), { recursive: true })
    }
  }
  return root
}

describe('collectPackages', () => {
  it('lists published packages alphabetically with their skills', () => {
    const root = makePackages([
      {
        dir: 'ai-zzz',
        manifest: { name: '@tanstack/ai-zzz', description: 'Z' },
      },
      {
        dir: 'ai',
        manifest: { name: '@tanstack/ai', description: 'Core' },
        skills: ['ai-core'],
      },
    ])

    expect(collectPackages(root)).toEqual([
      { name: '@tanstack/ai', description: 'Core', skills: ['ai-core'] },
      { name: '@tanstack/ai-zzz', description: 'Z', skills: [] },
    ])
  })

  it('skips private packages', () => {
    const root = makePackages([
      { dir: 'private', manifest: { name: 'private-thing', private: true } },
    ])

    expect(collectPackages(root)).toEqual([])
  })
})

describe('buildCatalog', () => {
  it('escapes table-breaking pipes in descriptions', () => {
    const root = makePackages([
      { dir: 'ai', manifest: { name: '@tanstack/ai', description: 'a | b' } },
    ])

    expect(buildCatalog(root)).toContain('| `@tanstack/ai` | — | a \\| b |')
  })

  it('matches the catalog committed for the marketplace plugin', () => {
    // Fails when a package is added, renamed, or starts shipping a skill:
    // run `pnpm generate:plugin-catalog`.
    expect(readFileSync(CATALOG_PATH, 'utf8')).toBe(buildCatalog('packages'))
  })
})
