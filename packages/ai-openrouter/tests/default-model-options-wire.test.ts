import { describe, expect, it } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '../src/adapters/text'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'

const model = 'openai/gpt-5.5'

function capture() {
  const sent: { body?: Record<string, unknown> } = {}
  const httpClient = new HTTPClient({
    fetcher: async (input) => {
      if (!(input instanceof Request)) throw new Error('Missing SDK request')
      sent.body = JSON.parse(await input.text())
      return new Response('', {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  return { sent, httpClient }
}

const adapters = [
  {
    name: 'Chat Completions',
    create: (httpClient: HTTPClient) =>
      createOpenRouterText(model, 'test-key', {
        httpClient,
        defaultModelOptions: { provider: { sort: 'latency' } },
      }),
  },
  {
    name: 'Responses',
    create: (httpClient: HTTPClient) =>
      createOpenRouterResponsesText(model, 'test-key', {
        httpClient,
        defaultModelOptions: { provider: { sort: 'latency' } },
      }),
  },
] as const

describe.each(adapters)('$name defaultModelOptions', ({ create }) => {
  it('sends the default provider routing', async () => {
    const { sent, httpClient } = capture()
    for await (const _ of chat({
      threadId: 'thread-1',
      adapter: create(httpClient),
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      // drain
    }
    expect(sent.body?.provider).toEqual({ sort: 'latency' })
  })

  it('lets the call provider replace the default', async () => {
    const { sent, httpClient } = capture()
    for await (const _ of chat({
      threadId: 'thread-1',
      adapter: create(httpClient),
      messages: [{ role: 'user', content: 'hi' }],
      modelOptions: { provider: { only: ['openai'] } },
    })) {
      // drain
    }
    expect(sent.body?.provider).toEqual({ only: ['openai'] })
  })
})
