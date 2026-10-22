import { describe, expect, it } from 'vitest'
import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createBytePlusText } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'seed-1-6-250915'

/** Runs one call that gets `status` and `body`. Gives back its RUN_ERROR. */
async function runError(status: number, body: object) {
  const fetch = async () => Response.json(body, { status })
  const chunks: Array<StreamChunk> = []
  for await (const chunk of createBytePlusText(model, 'test-key', {
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

describe('BytePlus adapter on a context overflow', () => {
  it('sets the context_overflow code and keeps the provider message', async () => {
    const error = await runError(400, {
      error: {
        code: 'InvalidParameter',
        message:
          'Total tokens of image and text exceed max message tokens. Request id: 0217918724619810f20bbdfc8ca54d9bbb0533a8546905cd6382b',
        param: '',
        type: 'BadRequest',
      },
    })
    expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
    expect(error?.message).toContain('exceed max message tokens')
  })

  it('does not set it on another bad request', async () => {
    const error = await runError(400, {
      error: {
        code: 'InvalidParameter',
        message:
          'The parameter `max_tokens` specified in the request is not valid.',
        param: 'max_tokens',
        type: 'BadRequest',
      },
    })
    expect(error).toMatchObject({ code: 'InvalidParameter' })
  })
})
