import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGoogleGenAI } from '../src/client'
import type { HttpOptions } from '@google/genai'

// @google/genai 2.23.0 and later have `httpOptions.fetch`. The repo installs
// 2.10.0, whose `HttpOptions` type does not have it yet.
type HttpOptionsWithFetch = HttpOptions & { fetch: typeof fetch }

/**
 * A client whose `httpOptions.fetch` answers `body`. Global `fetch` answers a
 * 400, which no client retries.
 */
function clientWithFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json(
          { error: { message: 'global fetch was called' } },
          { status: 400 },
        ),
      ),
    ),
  )
  const customFetch = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json(body)),
  )
  const httpOptions: HttpOptionsWithFetch = { fetch: customFetch }
  const client = createGoogleGenAI({ apiKey: 'test-key', httpOptions })
  return { client, customFetch }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('httpOptions.fetch', () => {
  it('sends models.generateContent through it', async () => {
    const { client, customFetch } = clientWithFetch({ candidates: [] })

    await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hi',
    })
    // Per-call httpOptions are merged over the client options.
    await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hi',
      config: { httpOptions: { headers: { 'x-call': '1' } } },
    })

    expect(customFetch).toHaveBeenCalledTimes(2)
  })

  it('sends interactions.create through it', async () => {
    const { client, customFetch } = clientWithFetch({ id: 'int_1', steps: [] })

    await client.interactions.create({ model: 'gemini-2.5-flash', input: 'Hi' })

    expect(customFetch).toHaveBeenCalledOnce()
  })
})
