import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'

describe('Cloudflare package contract', () => {
  it('starts at 0.0.1 and publishes the root, CLI, and D1 assets', () => {
    expect(packageJson.exports).toEqual({
      '.': {
        types: './dist/esm/index.d.ts',
        import: './dist/esm/index.js',
      },
    })
    expect(packageJson.bin).toEqual({
      'tanstack-ai-cloudflare-migrations':
        './bin/tanstack-ai-cloudflare-migrations.mjs',
    })
    expect(packageJson.files).toEqual(
      expect.arrayContaining(['bin', 'dist', 'migrations', 'src']),
    )
  })

  it('keeps Node built-ins, Buffer, and the CLI out of the root graph', async () => {
    const rootFiles = [
      'bindings.ts',
      'd1.ts',
      'index.ts',
      'locks.ts',
      'migrations.ts',
      'r2.ts',
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
    expect(root).not.toMatch(/migration-cli/)
    expect(root).not.toMatch(/\.\/cli/)
  })
})
