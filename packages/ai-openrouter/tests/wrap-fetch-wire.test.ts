import { describe, expect, it } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenRouterTextAdapter } from '../src/adapters/text'
import { OpenRouterResponsesTextAdapter } from '../src/adapters/responses-text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'openai/gpt-5.5'
const messages = [{ role: 'user' as const, content: 'Hi' }]

// The wrapper style of the middleware docs: it reads the headers from `init`.
const addTag: FetchWrapper = (next) => (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('x-wrapped', 'yes')
  return next(input, { ...init, headers })
}

/** Runs one streaming call and returns the headers that were sent. */
async function sentHeaders(
  api: 'chat' | 'responses',
  wrapFetch?: FetchWrapper,
) {
  let sent = ''
  // The config's own HTTP client is the base fetch of the wrapper.
  const httpClient = new HTTPClient({
    fetcher: async (input) => {
      if (!(input instanceof Request)) throw new Error('Missing SDK request')
      sent = `${input.headers.get('x-wrapped')} ${input.headers.get('authorization')}`
      return new Response('', {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  const config = { apiKey: 'test-key', httpClient }
  const options = { logger, model, messages, wrapFetch }
  const stream =
    api === 'chat'
      ? new OpenRouterTextAdapter(config, model).chatStream(options)
      : new OpenRouterResponsesTextAdapter(config, model).chatStream(options)
  for await (const _ of stream) {
    // drain
  }
  return sent
}

describe.each(['chat', 'responses'] as const)('%s wrapFetch', (api) => {
  it('sends the request through the wrapper', async () => {
    expect(await sentHeaders(api, addTag)).toBe('yes Bearer test-key')
  })

  it('sends the same request without a wrapper', async () => {
    expect(await sentHeaders(api)).toBe('null Bearer test-key')
  })
})
