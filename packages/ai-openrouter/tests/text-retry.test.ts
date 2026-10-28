import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { HTTPClient } from '@openrouter/sdk'
import { createOpenRouterText } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'
import type {
  OpenRouterTextAdapter,
  OpenRouterConfig,
} from '../src/adapters/text'

// Drive the REAL @openrouter/sdk retry loop against a stubbed fetch, so the
// test proves a configured `retryCodes` actually changes SDK behaviour rather
// than only reaching a mocked `chat.send`.
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const testLogger = resolveDebugOption(false)

// `maxInterval: 1` caps the SDK's backoff (which adds up to 1s of jitter) so
// the retry is near-instant.
const retryConfig = {
  strategy: 'backoff' as const,
  backoff: {
    initialInterval: 1,
    maxInterval: 1,
    exponent: 1,
    maxElapsedTime: 5000,
  },
  retryConnectionErrors: false,
}

function rateLimited(): Response {
  return new Response(
    JSON.stringify({ error: { code: 429, message: 'Rate limited' } }),
    { status: 429, headers: { 'content-type': 'application/json' } },
  )
}

function completion(content: string): Response {
  return new Response(
    JSON.stringify({
      id: 'gen-1',
      object: 'chat.completion',
      created: 0,
      system_fingerprint: 'fp-test',
      model: 'openai/gpt-4o-mini',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content },
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

const structuredOutput = (
  adapter: OpenRouterTextAdapter<'openai/gpt-4o-mini'>,
) =>
  adapter.structuredOutput({
    chatOptions: {
      threadId: 'thread-1',
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
    },
    outputSchema: { type: 'object' },
  })

describe('OpenRouter text adapter retryCodes', () => {
  it('retries a 429 when retryCodes includes it', async () => {
    fetchMock
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(completion('{"ok":true}'))
    const adapter = createOpenRouterText('openai/gpt-4o-mini', 'sk-or-test', {
      retryConfig,
      retryCodes: ['429', '5XX'],
    })

    const result = await structuredOutput(adapter)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.data).toEqual({ ok: true })
  })

  it('does not retry a 429 by default', async () => {
    fetchMock
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(completion('{"ok":true}'))
    const adapter = createOpenRouterText('openai/gpt-4o-mini', 'sk-or-test', {
      retryConfig,
    })

    await expect(structuredOutput(adapter)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// OpenRouter can send status 200 before the provider fails. The provider
// error then arrives as an error chunk in the stream.
const sse = (chunk: object) =>
  new Response(
    `data: ${JSON.stringify({
      id: 'gen-1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'openai/gpt-4o-mini',
      ...chunk,
    })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )

// Sends an error chunk with `code` on the first call, then text.
async function runChat(
  code: number,
  config: Omit<OpenRouterConfig, 'apiKey'> = {},
) {
  let calls = 0
  const httpClient = new HTTPClient({
    fetcher: async () =>
      calls++ === 0
        ? sse({ error: { code, message: 'Provider failed' }, choices: [] })
        : sse({
            choices: [
              { index: 0, delta: { content: 'hello' }, finish_reason: 'stop' },
            ],
          }),
  })
  const adapter = createOpenRouterText('openai/gpt-4o-mini', 'sk-or-test', {
    retryConfig,
    ...config,
    httpClient,
  })
  const events: Array<StreamChunk> = []
  for await (const event of chat({
    threadId: 'thread-1',
    adapter,
    messages: [{ role: 'user', content: 'Hello' }],
    retry: { maxRetries: 1 },
  })) {
    events.push(event)
  }
  return { calls, error: events.find((e) => e.type === 'RUN_ERROR') }
}

describe('OpenRouter text adapter error chunk in the stream', () => {
  it('retries a code in retryCodes with chat({ retry })', async () => {
    expect(await runChat(429, { retryCodes: ['429'] })).toEqual({
      calls: 2,
      error: undefined,
    })
  })

  it('retries a 5xx code by default', async () => {
    expect(await runChat(503)).toEqual({ calls: 2, error: undefined })
  })

  it('does not retry a 429 by default', async () => {
    const { calls, error } = await runChat(429)
    expect(calls).toBe(1)
    expect(error).toMatchObject({ code: '429' })
  })

  it('does not retry when the retry strategy is none', async () => {
    const { calls } = await runChat(503, {
      retryConfig: { strategy: 'none' },
    })
    expect(calls).toBe(1)
  })
})
