import { describe, expect, it } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'claude-haiku-4-5'

const rateLimited = (headers: Record<string, string>) =>
  createAnthropicChat(model, 'test-key', {
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

/** Runs one call that gets a 429 with `headers`. Gives back its RUN_ERROR. */
async function runError(headers: Record<string, string>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of rateLimited(headers).chatStream({
    threadId: 'thread-1',
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

  it('chat() moves retryAfterMs to metadata.tanstack', async () => {
    let retryAfterMs: number | undefined
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: rateLimited({ 'retry-after': '7' }),
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'RUN_ERROR') {
        retryAfterMs = chunk.metadata?.tanstack?.retryAfterMs
      }
    }
    expect(retryAfterMs).toBe(7000)
  })
})

const overloadedBody = {
  type: 'error',
  error: { type: 'overloaded_error', message: 'Overloaded' },
}

/** Runs one call through `fetch`. Gives back its RUN_ERROR. */
async function runErrorWith(fetch: () => Promise<Response>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of createAnthropicChat(model, 'test-key', {
    maxRetries: 0,
    fetch,
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

describe('Anthropic adapter on an overloaded error', () => {
  it('puts the error type and request id on a 529 RUN_ERROR', async () => {
    const runError = await runErrorWith(async () =>
      Response.json(overloadedBody, {
        status: 529,
        headers: { 'request-id': 'req_011' },
      }),
    )
    expect(runError).toMatchObject({
      code: '529',
      errorType: 'overloaded_error',
      requestId: 'req_011',
    })
  })

  it('puts them on a RUN_ERROR from a stream error event', async () => {
    const runError = await runErrorWith(
      async () =>
        new Response(
          `event: error\ndata: ${JSON.stringify(overloadedBody)}\n\n`,
          {
            headers: {
              'content-type': 'text/event-stream',
              'request-id': 'req_012',
            },
          },
        ),
    )
    expect(runError).toMatchObject({
      errorType: 'overloaded_error',
      requestId: 'req_012',
    })
  })

  it('chat() moves them to metadata.tanstack', async () => {
    let tanstack: unknown
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: createAnthropicChat(model, 'test-key', {
        maxRetries: 0,
        fetch: async () =>
          Response.json(overloadedBody, {
            status: 529,
            headers: { 'request-id': 'req_011' },
          }),
      }),
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'RUN_ERROR') tanstack = chunk.metadata?.tanstack
    }
    expect(tanstack).toMatchObject({
      errorType: 'overloaded_error',
      requestId: 'req_011',
    })
  })
})
