import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'

describe('drizzle package contract', () => {
  it('publishes the edge root, Node sqlite subpath, CLI, and migration assets', () => {
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
      'tanstack-ai-drizzle-migrations':
        './bin/tanstack-ai-drizzle-migrations.mjs',
    })
    expect(packageJson.files).toEqual(
      expect.arrayContaining(['bin', 'dist', 'src', 'drizzle']),
    )
  })

  it('keeps Node built-ins and Buffer out of the root import graph', async () => {
    const rootFiles = ['index.ts', 'migrations.ts', 'schema.ts', 'stores.ts']
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
    expect(root).not.toMatch(/from ['"].*sqlite/)
  })

  it('keeps the shipped drizzle-kit migration equal to the embedded asset', async () => {
    const embedded = await readFile(
      fileURLToPath(
        new URL('../src/assets/0000_tanstack_ai_initial.sql', import.meta.url),
      ),
      'utf8',
    )
    const shipped = await readFile(
      fileURLToPath(
        new URL('../drizzle/0000_tanstack_ai_initial.sql', import.meta.url),
      ),
      'utf8',
    )
    expect(shipped).toBe(embedded)
  })
})
