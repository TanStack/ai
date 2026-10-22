import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'

class Completions extends OpenAIBaseChatCompletionsTextAdapter<string> {}
class Responses extends OpenAIBaseResponsesTextAdapter<string> {}

const overflowMessage =
  "This model's maximum context length is 128000 tokens. However, your messages resulted in 200008 tokens. Please reduce the length of the messages."

const overflow = () =>
  Response.json(
    {
      error: {
        message: overflowMessage,
        type: 'invalid_request_error',
        param: 'messages',
        code: 'context_length_exceeded',
      },
    },
    { status: 400 },
  )

// A request over the tokens-per-minute limit. It also talks about tokens, but
// a retry with fewer messages is not the fix.
const rateLimited = () =>
  Response.json(
    {
      error: {
        message: 'Request too large for gpt-5.5: tokens per min (TPM) limit',
        type: 'tokens',
        code: 'rate_limit_exceeded',
      },
    },
    { status: 429 },
  )

/** Runs one call that gets `response`. Gives back its RUN_ERROR. */
async function runError(
  adapter: (client: OpenAI) => Completions | Responses,
  response: () => Response,
) {
  const client = new OpenAI({
    apiKey: 'test-key',
    maxRetries: 0,
    fetch: async () => response(),
  })
  const chunks: Array<StreamChunk> = []
  for await (const chunk of adapter(client).chatStream({
    threadId: 'thread-1',
    logger,
    model,
    messages: [{ role: 'user', content: 'Hi' }],
  })) {
    chunks.push(chunk)
  }
  return chunks.find((chunk) => chunk.type === 'RUN_ERROR')
}

const apis = [
  {
    api: 'Chat Completions',
    adapter: (client: OpenAI) => new Completions(model, 'openai', client),
  },
  {
    api: 'Responses',
    adapter: (client: OpenAI) => new Responses(model, 'openai', client),
  },
]

describe.each(apis)('$api adapter on a context overflow', ({ adapter }) => {
  it('sets the context_overflow code and keeps the provider message', async () => {
    const error = await runError(adapter, overflow)
    expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
    expect(error?.message).toContain(overflowMessage)
  })

  it('does not set it on a rate limit', async () => {
    expect(await runError(adapter, rateLimited)).toMatchObject({
      code: 'rate_limit_exceeded',
    })
  })
})

describe('Responses adapter on a context overflow in the stream', () => {
  // With `stream: true` the Responses API answers 200, then sends the error
  // as stream events.
  const failed = {
    code: 'context_length_exceeded',
    message:
      'Your input exceeds the context window of this model. Please adjust your input and try again.',
  }
  const stream = (events: Array<object>) => () =>
    new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  const responses = (client: OpenAI) => new Responses(model, 'openai', client)

  it('sets the code from an error event', async () => {
    const error = await runError(
      responses,
      stream([
        {
          type: 'error',
          error: { type: 'invalid_request_error', ...failed, param: 'input' },
          sequence_number: 2,
        },
      ]),
    )
    expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
    expect(error?.message).toContain(failed.message)
  })

  it('sets the code from a response.failed event', async () => {
    const error = await runError(
      responses,
      stream([
        {
          type: 'response.failed',
          response: { id: 'resp_1', model, status: 'failed', error: failed },
          sequence_number: 3,
        },
      ]),
    )
    expect(error).toMatchObject({
      code: CONTEXT_OVERFLOW_CODE,
      message: failed.message,
    })
  })
})
