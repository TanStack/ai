import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  diffFiles,
  docSkipReason,
  parseDoc,
  readTree,
  withEndpointMap,
  writeTree,
} from './files'

describe('diffFiles', () => {
  it('finds no drift when the trees match', () => {
    expect(diffFiles({ 'sdk.ts': 'a' }, { 'sdk.ts': 'a' })).toEqual([])
  })

  it('reports changed, added, and removed files', () => {
    expect(
      diffFiles(
        { 'sdk.ts': 'new', 'types.ts': 't' },
        { 'sdk.ts': 'old', 'old.ts': 'x' },
      ),
    ).toEqual([
      { path: 'sdk.ts', kind: 'changed' },
      { path: 'types.ts', kind: 'added' },
      { path: 'old.ts', kind: 'removed' },
    ])
  })
})

describe('docSkipReason', () => {
  it('uses a 2xx document', () => {
    expect(docSkipReason(200, '{}')).toBeUndefined()
  })

  it.each(['missing_connect', 'no_endpoints', 'unknown_provider'])(
    'skips %s',
    (code) => {
      expect(docSkipReason(404, JSON.stringify({ error: { code } }))).toBe(code)
    },
  )

  it('fails on any other error', () => {
    expect(
      docSkipReason(500, JSON.stringify({ error: { code: 'internal' } })),
    ).toBeUndefined()
    expect(docSkipReason(502, 'Bad gateway')).toBeUndefined()
  })
})

describe('readTree and writeTree', () => {
  let dir = ''
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('round-trips nested and dot-directory files', async () => {
    dir = await mkdtemp(join(tmpdir(), 'provider-clients-test-'))
    const files = { 'sdk.ts': 's', '.kubb/core.ts': 'c' }
    await writeTree(dir, files)
    expect(await readTree(dir)).toEqual(files)
  })

  it('reads a missing directory as empty, so every file is "added"', async () => {
    expect(await readTree(join(tmpdir(), 'no-such-provider-dir'))).toEqual({})
  })
})

describe('withEndpointMap', () => {
  it('maps each model id to its input and output schemas', () => {
    const doc = withEndpointMap(
      {
        components: {
          schemas: {
            'input_fal-ai_flux_dev': {
              'x-modelschemas-model': 'fal-ai/flux/dev',
            },
            'output_fal-ai_flux_dev': {
              'x-modelschemas-model': 'fal-ai/flux/dev',
            },
            Image: { type: 'object' },
          },
        },
      },
      'FalImageEndpoints',
    )
    expect(doc?.components.schemas.FalImageEndpoints).toMatchObject({
      required: ['fal-ai/flux/dev'],
      properties: {
        'fal-ai/flux/dev': {
          properties: {
            input: { $ref: '#/components/schemas/input_fal-ai_flux_dev' },
            output: { $ref: '#/components/schemas/output_fal-ai_flux_dev' },
          },
        },
      },
    })
  })

  it('skips a document with no per-model schemas', () => {
    expect(
      withEndpointMap({ components: { schemas: { A: {} } } }, 'X'),
    ).toBeUndefined()
  })
})

describe('parseDoc', () => {
  it('drops format: byte and keeps other formats', () => {
    const doc = parseDoc(
      JSON.stringify({
        a: { type: 'string', format: 'byte' },
        b: { type: 'string', format: 'binary' },
      }),
    )
    expect(doc).toEqual({
      a: { type: 'string' },
      b: { type: 'string', format: 'binary' },
    })
  })
})
