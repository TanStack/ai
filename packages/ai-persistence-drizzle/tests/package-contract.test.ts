import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'

describe('drizzle package contract', () => {
  it('publishes the edge root, Node sqlite subpath, and schema-emit CLI only', () => {
    expect(packageJson.exports).toEqual({
      '.': {
        types: './dist/esm/index.d.ts',
        import: './dist/esm/index.js',
      },
      './sqlite': {
        types: './dist/esm/sqlite.d.ts',
        import: './dist/esm/sqlite.js',
      },
    })
    expect(packageJson.bin).toEqual({
      'tanstack-ai-drizzle-schema': './bin/tanstack-ai-drizzle-schema.mjs',
    })
    expect(packageJson.files).toEqual(['bin', 'dist', 'src'])
    expect(packageJson.bin).not.toHaveProperty('tanstack-ai-drizzle-migrations')
    expect(packageJson.description.toLowerCase()).toMatch(/schema-first/)
  })

  it('does not ship SQL migrations or drizzle-kit journals', async () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    await expect(
      readFile(`${root}/src/assets/0000_tanstack_ai_initial.sql`, 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      readFile(`${root}/drizzle/0000_tanstack_ai_initial.sql`, 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps Node built-ins and Buffer out of the root import graph', async () => {
    const rootFiles = [
      'index.ts',
      'default-sqlite-schema.ts',
      'ensure-sqlite-tables.ts',
      'schema-contract.ts',
      'schema-source.ts',
      'stores.ts',
    ]
    for (const filename of rootFiles) {
      const contents = await readFile(
        fileURLToPath(new URL(`../src/${filename}`, import.meta.url)),
        'utf8',
      )
      expect(contents, filename).not.toMatch(/from ['"]node:/)
      expect(contents, filename).not.toMatch(/\bBuffer\b/)
    }
    const root = await readFile(
      fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      'utf8',
    )
    // Root must not pull the Node-only `/sqlite` entry or `node:sqlite`.
    expect(root).not.toMatch(/from ['"]\.\/sqlite['"]/)
    expect(root).not.toMatch(/from ['"]node:sqlite['"]/)
    expect(root).not.toMatch(/sqliteMigrations/)
  })
})
