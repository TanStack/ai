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
  buildCatalogs,
  categorize,
  collectPackages,
} from './generate-plugin-catalog'

const roots: Array<string> = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
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

describe('categorize', () => {
  it('sorts a package into the skill that covers it', () => {
    expect(categorize('@tanstack/ai')).toBe('core')
    expect(categorize('@tanstack/ai-react')).toBe('clients')
    expect(categorize('@tanstack/react-ai-devtools')).toBe('clients')
    expect(categorize('@tanstack/ai-persistence')).toBe('state')
    expect(categorize('@tanstack/ai-isolate-node')).toBe('agents')
    expect(categorize('@tanstack/ai-sandbox-docker')).toBe('agents')
  })

  it('treats an unknown package as a provider adapter', () => {
    // A new provider lands in the right catalog with no edit to the generator.
    expect(categorize('@tanstack/ai-newprovider')).toBe('providers')
  })
})

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
      {
        name: '@tanstack/ai',
        description: 'Core',
        skills: ['ai-core'],
        category: 'core',
      },
      {
        name: '@tanstack/ai-zzz',
        description: 'Z',
        skills: [],
        category: 'providers',
      },
    ])
  })

  it('skips private packages', () => {
    const root = makePackages([
      { dir: 'private', manifest: { name: 'private-thing', private: true } },
    ])

    expect(collectPackages(root)).toEqual([])
  })
})

describe('buildCatalogs', () => {
  it('escapes table-breaking pipes in descriptions', () => {
    const root = makePackages([
      { dir: 'ai', manifest: { name: '@tanstack/ai', description: 'a | b' } },
    ])

    expect(buildCatalogs(root)['skills/tanstack-ai/packages.md']).toMatch(
      /\| `@tanstack\/ai` +\| — +\| a \\\| b +\|/,
    )
  })

  it('matches the catalogs committed under skills/', () => {
    // Fails when a package is added, renamed, or starts shipping a skill:
    // run `pnpm generate:plugin-catalog`.
    for (const [path, content] of Object.entries(buildCatalogs('packages'))) {
      expect(readFileSync(path, 'utf8'), path).toBe(content)
    }
  })

  it('puts every published package in the full catalog and one skill', () => {
    const catalogs = buildCatalogs('packages')
    const full = catalogs['skills/tanstack-ai/packages.md'] ?? ''
    const perSkill = Object.entries(catalogs).filter(
      ([path]) => path !== 'skills/tanstack-ai/packages.md',
    )

    for (const pkg of collectPackages('packages')) {
      const row = `| \`${pkg.name}\` `
      expect(full, pkg.name).toContain(row)

      const hits = perSkill.filter(([, content]) => content.includes(row))
      // Core packages are covered by the entry skill itself.
      expect(hits.length, `${pkg.name} (${pkg.category})`).toBe(
        pkg.category === 'core' ? 0 : 1,
      )
    }
  })
})
