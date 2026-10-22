import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const model = 'claude-haiku-4-5'

const sse = (events: Array<{ type: string }>) =>
  new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  )

describe('Anthropic adapter on a stream that fails mid-way', () => {
  it('reports the message_start usage on the RUN_ERROR of an SSE error event (#1735)', async () => {
    const adapter = createAnthropicChat(model, 'test-key', {
      maxRetries: 0,
      fetch: async () =>
        sse([
          {
            type: 'message_start',
            message: {
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 18, output_tokens: 1 },
            },
          } as { type: string },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          } as { type: string },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'One, two' },
          } as { type: string },
          {
            type: 'error',
            error: { type: 'overloaded_error', message: 'Overloaded' },
          } as { type: string },
        ]),
    })
    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      logger: resolveDebugOption(false),
      model,
      threadId: 'thread-1',
      messages: [{ role: 'user', content: 'Count to thirty' }],
    })) {
      chunks.push(chunk)
    }

    const error = chunks.find((chunk) => chunk.type === 'RUN_ERROR')
    expect(error?.message).toContain('Overloaded')
    expect(error).toMatchObject({
      usage: { promptTokens: 18, completionTokens: 1, totalTokens: 19 },
    })
  })
})
