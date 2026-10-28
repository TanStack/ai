import { describe, expect, it } from 'vitest'
import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'claude-haiku-4-5'

/** Runs one call that gets `response`. Gives back its RUN_ERROR. */
async function runError(response: Response) {
  const adapter = createAnthropicChat(model, 'test-key', {
    maxRetries: 0,
    fetch: async () => response,
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

const apiError = (status: number, type: string, message: string) =>
  Response.json({ type: 'error', error: { type, message } }, { status })

const sse = (events: Array<{ type: string }>) =>
  new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  )

describe('Anthropic adapter on a context overflow', () => {
  it('sets the context_overflow code and keeps the provider message', async () => {
    const message = 'prompt is too long: 260024 tokens > 200000 maximum'
    const error = await runError(
      apiError(400, 'invalid_request_error', message),
    )
    expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
    expect(error?.message).toContain(message)
  })

  it('does not set it on another bad request', async () => {
    const error = await runError(
      apiError(400, 'invalid_request_error', 'max_tokens: must be at least 1'),
    )
    expect(error).toMatchObject({ code: '400' })
  })

  it('does not set it on a rate limit', async () => {
    const error = await runError(
      apiError(
        429,
        'rate_limit_error',
        'This request would exceed your organization rate limit of 50,000 input tokens per minute',
      ),
    )
    expect(error).toMatchObject({ code: '429' })
  })

  it('sets it when the model stops at the end of its context window', async () => {
    const error = await runError(
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
            usage: { input_tokens: 199_990, output_tokens: 1 },
          },
        } as { type: string },
        {
          type: 'message_delta',
          delta: {
            stop_reason: 'model_context_window_exceeded',
            stop_sequence: null,
          },
          usage: { output_tokens: 10 },
        } as { type: string },
        { type: 'message_stop' },
      ]),
    )
    expect(error).toMatchObject({ code: CONTEXT_OVERFLOW_CODE })
  })
})
