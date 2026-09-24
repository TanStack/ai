import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenRouterText } from '../src/adapters/text'
import type { OpenRouterTextAdapter } from '../src/adapters/text'

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
