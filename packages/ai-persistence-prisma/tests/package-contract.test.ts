import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'

describe('Prisma package contract', () => {
  it('publishes the adapter, models CLI, and provider-neutral models asset', () => {
    expect(packageJson.exports).toEqual({
      '.': {
        types: './dist/esm/index.d.ts',
        import: './dist/esm/index.js',
      },
    })
    expect(packageJson.bin).toEqual({
      'tanstack-ai-prisma-models': './bin/tanstack-ai-prisma-models.mjs',
    })
    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        'bin',
        'dist',
        'src',
        'prisma/tanstack-ai.prisma',
      ]),
    )
  })

  it('requires a Prisma client with generally available multi-file schemas', () => {
    expect(packageJson.peerDependencies['@prisma/client']).toBe('>=6.7.0')
  })
})
