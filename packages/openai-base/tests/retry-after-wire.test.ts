import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'

class Completions extends OpenAIBaseChatCompletionsTextAdapter<string> {}
class Responses extends OpenAIBaseResponsesTextAdapter<string> {}

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

describe.each(apis)('$api adapter on a 429', ({ adapter }) => {
  /** Runs one call that gets a 429 with `headers`. Gives back its RUN_ERROR. */
  async function runError(headers: Record<string, string>) {
    const client = new OpenAI({
      apiKey: 'test-key',
      maxRetries: 0,
      fetch: async () =>
        Response.json(
          { error: { message: 'Rate limit reached', type: 'rate_limit' } },
          { status: 429, headers },
        ),
    })
    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter(client).chatStream({
      logger,
      model,
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk)
    }
    return chunks.find((chunk) => chunk.type === 'RUN_ERROR')
  }

  it('puts retry-after on the RUN_ERROR as retryAfterMs', async () => {
    expect(await runError({ 'retry-after': '7' })).toMatchObject({
      retryAfterMs: 7000,
    })
  })

  it('prefers retry-after-ms over retry-after', async () => {
    expect(
      await runError({ 'retry-after-ms': '1500', 'retry-after': '7' }),
    ).toMatchObject({ retryAfterMs: 1500 })
  })
})
