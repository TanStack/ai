import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'claude-haiku-4-5'

/** Runs one call that gets a 429 with `headers`. Gives back its RUN_ERROR. */
async function runError(headers: Record<string, string>) {
  const adapter = createAnthropicChat(model, 'test-key', {
    maxRetries: 0,
    fetch: async () =>
      Response.json(
        {
          type: 'error',
          error: { type: 'rate_limit_error', message: 'Rate limited' },
        },
        { status: 429, headers },
      ),
  })
  const chunks: Array<StreamChunk> = []
  for await (const chunk of adapter.chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'Hi' }],
  })) {
    chunks.push(chunk)
  }
  return chunks.find((chunk) => chunk.type === 'RUN_ERROR')
}

describe('Anthropic adapter on a 429', () => {
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
