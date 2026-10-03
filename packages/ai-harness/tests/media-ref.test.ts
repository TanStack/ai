import { describe, expect, it } from 'vitest'
import { kindOf, mediaIdOf, mediaOfMessage, mediaPart } from '../src'
import type { ModelMessage } from '@tanstack/ai'
import type { MediaRecord } from '../src'

function record(overrides?: Partial<MediaRecord>): MediaRecord {
  return {
    id: 'm1',
    threadId: 't1',
    kind: 'image',
    mimeType: 'image/png',
    name: 'cat.png',
    size: 42,
    source: 'user',
    createdAt: 1_700_000_000_000,
    ...overrides,
  }
}

function assistantWith(metadata: ModelMessage['metadata']): ModelMessage {
  return { role: 'assistant', content: 'done', metadata }
}

describe('kindOf', () => {
  it.each([
    ['image/png', 'image'],
    ['audio/mpeg', 'audio'],
    ['video/mp4', 'video'],
    ['application/pdf', 'document'],
    ['text/plain', 'document'],
    ['text/markdown; charset=utf-8', 'document'],
    ['IMAGE/JPEG', 'image'],
  ] as const)('maps %s to %s', (mimeType, kind) => {
    expect(kindOf(mimeType)).toBe(kind)
  })

  it.each(['application/zip', 'application/json', 'image', 'image/', ''])(
    'returns undefined for %j',
    (mimeType) => {
      expect(kindOf(mimeType)).toBeUndefined()
    },
  )
})

describe('mediaPart', () => {
  it.each([
    ['image', 'image/png'],
    ['audio', 'audio/wav'],
    ['video', 'video/mp4'],
    ['document', 'application/pdf'],
  ] as const)('builds a %s part with a harness-media url', (kind, mimeType) => {
    expect(mediaPart(record({ id: 'abc', kind, mimeType }))).toEqual({
      type: kind,
      source: { type: 'url', value: 'harness-media:abc', mimeType },
    })
  })
})

describe('mediaIdOf', () => {
  it('reads the id of a harness media part', () => {
    const part = {
      type: 'audio',
      source: { type: 'url', value: 'harness-media:clip-7' },
    }
    expect(mediaIdOf(part)).toBe('clip-7')
  })

  it.each([
    [
      'a plain https url',
      {
        type: 'image',
        source: { type: 'url', value: 'https://acme.dev/cat.png' },
      },
    ],
    [
      'a data source',
      {
        type: 'image',
        source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
      },
    ],
    [
      'a file handle',
      { type: 'document', source: { type: 'file', value: 'harness-media:m1' } },
    ],
    [
      'an empty id',
      { type: 'image', source: { type: 'url', value: 'harness-media:' } },
    ],
    ['a text part', { type: 'text', content: 'harness-media:m1' }],
    ['a bare string', 'harness-media:m1'],
    ['null', null],
  ])('returns undefined for %s', (_label, part) => {
    expect(mediaIdOf(part)).toBeUndefined()
  })
})

describe('mediaOfMessage', () => {
  it('returns the media records in metadata.harness.media', () => {
    const generated = record({
      id: 'm2',
      kind: 'video',
      mimeType: 'video/mp4',
      name: 'clip.mp4',
      source: 'generated',
      runId: 'run-1',
      subagentRunId: 'sub-1',
    })
    const message = assistantWith({ harness: { media: [record(), generated] } })
    expect(mediaOfMessage(message)).toEqual([record(), generated])
  })

  it('skips entries with a bad shape', () => {
    const message = assistantWith({
      harness: {
        media: [
          record({ id: 'good' }),
          { ...record(), id: undefined },
          { ...record(), kind: 'spreadsheet' },
          { ...record(), source: 'robot' },
          { ...record(), size: '42' },
          { ...record(), runId: 7 },
          'harness-media:m1',
          null,
        ],
      },
    })
    expect(mediaOfMessage(message)).toEqual([record({ id: 'good' })])
  })

  it.each([
    ['no metadata', undefined],
    ['no harness key', { tanstack: {} }],
    ['a harness value that is not an object', { harness: 'media' }],
    ['media that is not an array', { harness: { media: { id: 'm1' } } }],
  ])('returns [] for %s', (_label, metadata) => {
    expect(mediaOfMessage(assistantWith(metadata))).toEqual([])
  })
})
