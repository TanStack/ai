import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MarblePlanError,
  downloadMarbleAsset,
  isAllowedMarbleSplatUrl,
  safeDownloadName,
} from './marble-splat'

describe('isAllowedMarbleSplatUrl', () => {
  it.each([
    'https://marble.worldlabs.ai/world/1.spz',
    'https://cdn.worldlabs.ai/a.spz',
    'https://storage.googleapis.com/bucket/a.spz',
    'https://abc.googleusercontent.com/a.spz',
  ])('allows %s', (url) => {
    expect(isAllowedMarbleSplatUrl(url)).toBe(true)
  })

  it.each([
    'http://marble.worldlabs.ai/a.spz',
    'https://evil.com/a.spz',
    'https://user:pass@worldlabs.ai/a.spz',
    'https://worldlabs.ai.evil.com/a.spz',
    'not-a-url',
    '',
  ])('rejects %s', (url) => {
    expect(isAllowedMarbleSplatUrl(url)).toBe(false)
  })
})

describe('safeDownloadName', () => {
  it('keeps a simple filename', () => {
    expect(safeDownloadName('world.spz')).toBe('world.spz')
  })

  it('rejects a path', () => {
    expect(safeDownloadName('../x.spz')).toBeUndefined()
  })
})

describe('downloadMarbleAsset', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([402, 403])('throws MarblePlanError on %s', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('denied', { status })),
    )
    await expect(
      downloadMarbleAsset('https://marble.worldlabs.ai/a.spz', 'world.spz'),
    ).rejects.toBeInstanceOf(MarblePlanError)
  })

  it('throws on other non-OK statuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    )
    await expect(
      downloadMarbleAsset('https://marble.worldlabs.ai/a.spz', 'world.spz'),
    ).rejects.toThrow(/Download failed/)
  })

  it('throws when the file is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(), { status: 200 })),
    )
    await expect(
      downloadMarbleAsset('https://marble.worldlabs.ai/a.spz', 'world.spz'),
    ).rejects.toThrow(/Download failed/)
  })
})
