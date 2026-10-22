import { describe, expect, it } from 'vitest'
import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createCloudflareText } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = '@cf/zai-org/glm-5.3-flash'

/** Runs one call that gets `status` and `body`. Gives back its RUN_ERROR. */
async function runError(status: number, body: object) {
  const fetch = async () => Response.json(body, { status })
  const chunks: Array<StreamChunk> = []
  for await (const chunk of createCloudflareText(model, {
    accountId: 'test-account',
    apiKey: 'test-key',
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

describe('Cloudflare adapter on a context overflow', () => {
  it('sets the context_overflow code and keeps the provider message', async () => {
    const error = await runError(413, {
      errors: [
        {
          message:
            'AiError: Ai: The estimated number of input and maximum output tokens (60026) exceeded this model context window limit (24000).',
          code: 5021,
        },
      ],
      success: false,
      result: {},
      messages: [],
    })
    expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
    expect(error?.message).toContain('exceeded this model context window limit')
  })

  it('does not set it on a capacity error', async () => {
    const error = await runError(429, {
      errors: [
        { message: 'AiError: Capacity temporarily exceeded.', code: 3040 },
      ],
      success: false,
      result: {},
      messages: [],
    })
    expect(error).toMatchObject({ code: '3040' })
  })
})
