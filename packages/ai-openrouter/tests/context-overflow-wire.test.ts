import { describe, expect, it } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenRouterText } from '../src/adapters/text'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'openai/gpt-4o-mini'

const overflowMessage =
  "This endpoint's maximum context length is 128000 tokens. However, you requested about 300001 tokens (300000 of text input, 1 in the output). Please reduce the length of either one, or use the context-compression plugin to compress your prompt automatically."

const errorResponse = (status: number, message: string) => () =>
  new Response(
    JSON.stringify({
      error: { message, code: status, metadata: { provider_name: null } },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  )

const apis = [
  { api: 'Chat Completions', create: createOpenRouterText },
  { api: 'Responses', create: createOpenRouterResponsesText },
]

describe.each(apis)(
  'OpenRouter $api adapter on a context overflow',
  ({ create }) => {
    /** Runs one call that gets `response`. Gives back its RUN_ERROR. */
    async function runError(response: () => Response) {
      const adapter = create(model, 'sk-or-test', {
        httpClient: new HTTPClient({ fetcher: async () => response() }),
        retryConfig: { strategy: 'none' },
      })
      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.chatStream({
        threadId: 'thread-1',
        logger,
        model,
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk)
      }
      return chunks.find((chunk) => chunk.type === 'RUN_ERROR')
    }

    it('sets the context_overflow code and keeps the provider message', async () => {
      const error = await runError(errorResponse(400, overflowMessage))
      expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
      expect(error?.message).toContain(overflowMessage)
    })

    it('does not set it on another bad request', async () => {
      const error = await runError(
        errorResponse(400, 'openai/gpt-4o-mini is not a valid model ID'),
      )
      expect(error?.code).not.toBe(CONTEXT_OVERFLOW_CODE)
    })

    it('does not set it on a rate limit', async () => {
      const error = await runError(errorResponse(429, 'Rate limit exceeded'))
      expect(error?.code).not.toBe(CONTEXT_OVERFLOW_CODE)
    })
  },
)
