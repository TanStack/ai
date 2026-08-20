import { describe, expect, it } from 'vitest'
import {
  mergeMetadata,
  tanstackMetadata,
  withTanstackMetadata,
} from './merge-metadata'

describe('mergeMetadata', () => {
  it('last write wins per key and does not deep merge', () => {
    const merged = mergeMetadata(
      { author: 'dana', tanstack: { model: 'gpt-5.5' } },
      { tanstack: { createdAt: '2026-08-20T00:00:00.000Z' } },
    )
    expect(merged).toEqual({
      author: 'dana',
      tanstack: { createdAt: '2026-08-20T00:00:00.000Z' },
    })
  })

  it('keeps a null value under a key', () => {
    expect(mergeMetadata({ author: 'dana' }, { author: null })).toEqual({
      author: null,
    })
  })

  it('treats incoming null as absent', () => {
    expect(mergeMetadata({ author: 'dana' }, null)).toEqual({ author: 'dana' })
  })

  it('treats incoming undefined as absent', () => {
    expect(mergeMetadata({ author: 'dana' }, undefined)).toEqual({
      author: 'dana',
    })
  })

  it('returns incoming when current is missing', () => {
    expect(mergeMetadata(undefined, { author: 'dana' })).toEqual({
      author: 'dana',
    })
  })
})

describe('tanstackMetadata', () => {
  it('reads metadata.tanstack when it is an object', () => {
    expect(
      tanstackMetadata({ metadata: { tanstack: { model: 'gpt-5.5' } } }),
    ).toEqual({ model: 'gpt-5.5' })
  })

  it('returns undefined when tanstack is missing or not an object', () => {
    expect(tanstackMetadata({})).toBeUndefined()
    expect(tanstackMetadata({ metadata: { tanstack: 'nope' } })).toBeUndefined()
    expect(tanstackMetadata({ metadata: { tanstack: [] } })).toBeUndefined()
  })

  it('returns undefined when nested metadata is null', () => {
    expect(tanstackMetadata({ metadata: null })).toBeUndefined()
  })

  it('reads tanstack from a raw record', () => {
    expect(tanstackMetadata({ tanstack: { model: 'gpt-5.5' } })).toEqual({
      model: 'gpt-5.5',
    })
  })
})

describe('withTanstackMetadata', () => {
  it('writes metadata.tanstack and does not set the reserved ag-ui key', () => {
    const next = withTanstackMetadata(
      { type: 'RUN_STARTED' },
      { model: 'gpt-5.5' },
    )
    expect(next.metadata).toEqual({ tanstack: { model: 'gpt-5.5' } })
    expect(next.metadata).not.toHaveProperty('ag-ui')
  })

  it('merges new tanstack keys into existing metadata without dropping user keys', () => {
    const next = withTanstackMetadata(
      { metadata: { author: 'dana', tanstack: { model: 'gpt-5.5' } } },
      { finishReason: 'stop' },
    )
    expect(next.metadata).toEqual({
      author: 'dana',
      tanstack: { model: 'gpt-5.5', finishReason: 'stop' },
    })
  })

  it('last write wins for overlapping tanstack keys', () => {
    const next = withTanstackMetadata(
      { metadata: { tanstack: { model: 'gpt-5.5' } } },
      { model: 'claude' },
    )
    expect(next.metadata).toEqual({ tanstack: { model: 'claude' } })
  })

  it('treats null metadata as absent and still writes tanstack', () => {
    expect(() =>
      withTanstackMetadata({ metadata: null }, { model: 'gpt-5.5' }),
    ).not.toThrow()
    expect(
      withTanstackMetadata({ metadata: null }, { model: 'gpt-5.5' }).metadata,
    ).toEqual({ tanstack: { model: 'gpt-5.5' } })
  })
})
