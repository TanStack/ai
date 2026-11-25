import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElevenLabsClient } from '../src/client'
import type { ElevenLabsClientConfig } from '../src/utils/client'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Runs one `voices.getAll` call and returns the request that went out. */
async function sentRequest(config: ElevenLabsClientConfig) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ voices: [] }),
  )
  vi.stubGlobal('fetch', fetchMock)
  await createElevenLabsClient(config).voices.getAll()
  const [url, init] = fetchMock.mock.calls[0]!
  return { url, headers: new Headers(init.headers) }
}

describe('createElevenLabsClient', () => {
  it('maps baseURL and defaultHeaders onto the request', async () => {
    const { url, headers } = await sentRequest({
      apiKey: 'k',
      baseURL: 'https://gw.example/elevenlabs',
      defaultHeaders: { 'X-Gateway': 'yes' },
    })
    expect(url).toBe('https://gw.example/elevenlabs/v1/voices')
    expect(headers.get('x-gateway')).toBe('yes')
    expect(headers.get('xi-api-key')).toBe('k')
  })

  it('keeps baseUrl and headers working, normalized names win', async () => {
    const { url, headers } = await sentRequest({
      apiKey: 'k',
      baseUrl: 'https://old.example',
      headers: { a: '1', b: 'old' },
      baseURL: 'https://new.example',
      defaultHeaders: { b: 'new' },
    })
    expect(url).toBe('https://new.example/v1/voices')
    expect(headers.get('a')).toBeNull()
    expect(headers.get('b')).toBe('new')
  })
})
