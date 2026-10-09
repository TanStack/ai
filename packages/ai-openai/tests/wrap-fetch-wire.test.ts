import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenaiChat } from '../src/adapters/text'
import { openaiCompatibleText } from '../src/compatible'
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
    adapter: 'openaiCompatibleText',
    create: (fetch: typeof globalThis.fetch) =>
      openaiCompatibleText('deepseek-chat', {
        apiKey: 'test-key',
        baseURL: 'https://api.deepseek.test/v1',
        fetch,
      }),
    url: 'https://api.deepseek.test/v1/chat/completions',
  },
]

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
