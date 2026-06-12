import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  verifyGeneratedSource,
  verifyProvidersDir,
} from '../scripts/verify-generated.js'

const providersDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'providers',
)

describe('generated provider modules', () => {
  // Security gate: the nightly sync feeds third-party-controlled OpenAPI
  // specs through codegen into modules that execute on import. This must
  // hold for the sync PR to be safe to merge without reading the diff.
  it('contain only data-only TypeScript', () => {
    const { fileCount, violations } = verifyProvidersDir(providersDir)
    expect(fileCount).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })
})

describe('verifyGeneratedSource', () => {
  const ok = (source: string) => verifyGeneratedSource('test.ts', source)

  it('accepts the shapes codegen emits', () => {
    expect(
      ok(
        `import * as z from 'zod'\n` +
          `export const zFoo = z.object({ bar: z.string().optional() })\n` +
          `export const zRec = z.object({ items: z.lazy((): any => zFoo) })\n` +
          `export const FooSchema = { type: 'object', 'x-key': [1, -2, true, null] }\n`,
      ),
    ).toEqual([])
    expect(ok(`export * from './zod.gen.js'\n`)).toEqual([])
    expect(
      ok(
        `import { zFoo } from './zod.gen.js'\n` +
          `export const map = { 'a/b': { input: zFoo } }\n`,
      ),
    ).toEqual([])
  })

  it.each([
    ['template substitution', 'export const x = `a${process.env.X}`'],
    ['undeclared identifier', 'export const x = process'],
    [
      'function constructor pivot',
      `import * as z from 'zod'\nexport const x = z.constructor('y')`,
    ],
    ['element access', `import * as z from 'zod'\nexport const x = z['lazy']`],
    ['new expression', 'export const x = new Function()'],
    [
      'arrow with body block',
      `import * as z from 'zod'\nexport const x = z.lazy(() => { return z })`,
    ],
    ['top-level call', 'console.log(1)'],
    ['non-zod import', `import { exec } from 'node:child_process'`],
    ['parent-directory import', `export * from '../escape.js'`],
    ['let declaration', 'export let x = 1'],
    [
      'spread element',
      `import { zFoo } from './zod.gen.js'\nexport const x = [...zFoo]`,
    ],
  ])('rejects %s', (_label, source) => {
    expect(ok(source)).not.toEqual([])
  })
})
