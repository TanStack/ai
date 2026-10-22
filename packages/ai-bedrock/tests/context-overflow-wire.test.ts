import { describe, expect, it } from 'vitest'
import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createBedrockChat } from '../src/adapters/text'
import { createBedrockResponsesText } from '../src/adapters/responses-text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'openai.gpt-oss-120b-1:0'

const overflowMessage =
  'Mantle streaming error for requestId e855160d: ErrorEvent { error: APIError { type: "BadRequestError", code: Some(400), message: "Input length (250068) exceeds model\'s maximum context length (131072).", param: None } }'

const badRequest = (message: string) => () =>
  Response.json(
    {
      error: {
        message,
        type: 'invalid_request_error',
        param: null,
        code: 'validation_error',
      },
    },
    { status: 400 },
  )

const apis = [
  { api: 'chat', create: createBedrockChat },
  { api: 'responses', create: createBedrockResponsesText },
]

describe.each(apis)(
  'bedrock $api adapter on a context overflow',
  ({ create }) => {
    /** Runs one call that gets `response`. Gives back its RUN_ERROR. */
    async function runError(response: () => Response) {
      const adapter = create(model, 'test-key', {
        maxRetries: 0,
        fetch: async () => response(),
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
      const error = await runError(badRequest(overflowMessage))
      expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
      expect(error?.message).toContain(overflowMessage)
    })

    it('does not set it on another bad request', async () => {
      const error = await runError(badRequest('max_tokens must be at least 1'))
      expect(error).toMatchObject({ code: 'validation_error' })
    })
  },
)
