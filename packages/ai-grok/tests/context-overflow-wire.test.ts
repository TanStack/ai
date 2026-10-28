import { describe, expect, it } from 'vitest'
import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGrokText } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'grok-4.3'

/** Runs one call that gets `status` and `body`. Gives back its RUN_ERROR. */
async function runError(status: number, body: object) {
  const fetch = async () => Response.json(body, { status })
  const chunks: Array<StreamChunk> = []
  for await (const chunk of createGrokText(model, 'test-key', {
    fetch,
    maxRetries: 0,
  }).chatStream({
    threadId: 'thread-1',
    logger,
    model,
    messages: [{ role: 'user', content: 'Hi' }],
  })) {
    chunks.push(chunk)
  }
  return chunks.find((chunk) => chunk.type === 'RUN_ERROR')
}

describe('Grok adapter on a context overflow', () => {
  it('sets the context_overflow code and keeps the provider message', async () => {
    const error = await runError(400, {
      code: 'invalid-argument',
      error:
        "Failed to start sampling: [input_too_large] The prompt is too long for this model's context window (3000193 tokens > 1000000 tokens)",
    })
    expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
    expect(error?.message).toContain('[input_too_large]')
  })

  it('does not set it on another bad request', async () => {
    const error = await runError(400, {
      code: 'invalid-argument',
      error: 'Invalid request content: max_output_tokens is too large.',
    })
    expect(error).toMatchObject({ code: '400' })
  })
})
