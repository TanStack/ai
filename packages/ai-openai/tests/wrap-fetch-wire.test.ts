import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenaiChat } from '../src/adapters/text'
import { azureOpenaiText } from '../src/adapters/azure-text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)

const addTraceHeader: FetchWrapper = (next) => (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('x-trace-id', 'trace-1')
  return next(input, { ...init, headers })
}

const adapters = [
  {
    adapter: 'openaiText (Responses)',
    create: (fetch: typeof globalThis.fetch) =>
      createOpenaiChat('gpt-5.5', 'test-key', { fetch }),
    url: 'https://api.openai.com/v1/responses',
  },
  {
    adapter: 'azureOpenaiText',
    create: (fetch: typeof globalThis.fetch) =>
      azureOpenaiText('gpt-5.5', {
        apiKey: 'test-key',
        resourceName: 'test-resource',
        fetch,
      }),
    url: 'https://test-resource.openai.azure.com/openai/v1/responses?api-version=v1',
  },
]

beforeEach(() => {
  // The Azure client must not need the env to copy itself.
  vi.stubEnv('OPENAI_API_VERSION', '')
  vi.stubEnv('AZURE_OPENAI_API_VERSION', '')
})

afterEach(() => vi.unstubAllEnvs())

describe.each(adapters)('$adapter wrapFetch', ({ create, url }) => {
  /** Runs one streaming call. Gives back the URL and headers of each request. */
  async function sent(wrapFetch?: FetchWrapper) {
    const requests: Array<{ url: string; headers: Headers }> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      requests.push({ url: request.url, headers: request.headers })
      return new Response('', {
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    for await (const _ of create(fetch).chatStream({
      logger,
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'Hi' }],
      ...(wrapFetch ? { wrapFetch } : {}),
    })) {
      // drain
    }
    return requests
  }

  it('sends the header that the wrapper adds to the same URL', async () => {
    const requests = await sent(addTraceHeader)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(url)
    expect(requests[0]?.headers.get('x-trace-id')).toBe('trace-1')
  })

  it('sends no extra header without a wrapper', async () => {
    const requests = await sent()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(url)
    expect(requests[0]?.headers.get('x-trace-id')).toBeNull()
  })
})

describe('azureOpenaiText wrapFetch with an apiVersion', () => {
  it('keeps the apiVersion and sends the header of the wrapper', async () => {
    const requests: Array<{ url: string; headers: Headers }> = []
    const adapter = azureOpenaiText('gpt-5.5', {
      apiKey: 'test-key',
      resourceName: 'test-resource',
      apiVersion: '2025-04-01-preview',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push({ url: request.url, headers: request.headers })
        return new Response('', {
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    })
    for await (const _ of adapter.chatStream({
      logger,
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'Hi' }],
      wrapFetch: addTraceHeader,
    })) {
      // drain
    }
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(
      'https://test-resource.openai.azure.com/openai/v1/responses?api-version=2025-04-01-preview',
    )
    expect(requests[0]?.headers.get('x-trace-id')).toBe('trace-1')
    expect(requests[0]?.headers.get('api-key')).toBe('test-key')
  })
})
