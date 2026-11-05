import { describe, expect, it } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const model = 'claude-haiku-4-5'

const sse = (events: Array<Record<string, unknown> & { type: string }>) =>
  events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')

const messageStart = {
  type: 'message_start',
  message: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model,
    content: [],
    stop_reason: null,
    usage: { input_tokens: 10, output_tokens: 1 },
  },
}
const textStart = {
  type: 'content_block_start',
  index: 0,
  content_block: { type: 'text', text: '' },
}
const textDelta = {
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text: 'Hel' },
}

/** Runs chat() on one streamed body. Gives back every chunk and the middleware calls. */
async function run(body: string) {
  const chunks: Array<StreamChunk> = []
  const calls = { finish: 0, error: 0 }
  for await (const chunk of chat({
    threadId: 'thread-1',
    adapter: createAnthropicChat(model, 'test-key', {
      maxRetries: 0,
      fetch: async () =>
        new Response(body, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    }),
    messages: [{ role: 'user', content: 'Hi' }],
    middleware: [
      {
        name: 'observe',
        onFinish: () => {
          calls.finish++
        },
        onError: () => {
          calls.error++
        },
      },
    ],
  })) {
    chunks.push(chunk)
  }
  return { chunks, calls }
}

describe('Anthropic stream that ends before message_stop', () => {
  it('ends the run with an incomplete-stream RUN_ERROR', async () => {
    const { chunks, calls } = await run(
      sse([messageStart, textStart, textDelta]),
    )
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      code: 'incomplete-stream',
      usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
    })
    expect(chunks.some((chunk) => chunk.type === 'RUN_FINISHED')).toBe(false)
    expect(calls).toEqual({ finish: 0, error: 1 })
  })

  it('finishes a stream that sent a stop reason but no message_stop', async () => {
    const { chunks, calls } = await run(
      sse([
        messageStart,
        textStart,
        textDelta,
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 2 },
        },
      ]),
    )
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_FINISHED' })
    expect(calls).toEqual({ finish: 1, error: 0 })
  })

  it('still finishes a stream that sent message_delta and message_stop', async () => {
    const { chunks, calls } = await run(
      sse([
        messageStart,
        textStart,
        textDelta,
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 2 },
        },
        { type: 'message_stop' },
      ]),
    )
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_FINISHED' })
    expect(chunks.some((chunk) => chunk.type === 'RUN_ERROR')).toBe(false)
    expect(calls).toEqual({ finish: 1, error: 0 })
  })

  it('does not report an abort as an incomplete stream', async () => {
    const controller = new AbortController()
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(
          encoder.encode(sse([messageStart, textStart, textDelta])),
        )
      },
    })
    const chunks: Array<StreamChunk> = []
    for await (const chunk of createAnthropicChat(model, 'test-key', {
      maxRetries: 0,
      fetch: async () =>
        new Response(body, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    }).chatStream({
      threadId: 'thread-1',
      logger: resolveDebugOption(false),
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      request: { signal: controller.signal },
    })) {
      chunks.push(chunk)
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') controller.abort()
    }
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === 'RUN_ERROR' && chunk.code === 'incomplete-stream',
      ),
    ).toBe(false)
  })
})
