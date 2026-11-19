import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenAIClient } from '../src/client'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { ClientOptions } from 'openai'
import type { AdapterYieldChunk, Logger } from '@tanstack/ai'

type Fetch = NonNullable<ClientOptions['fetch']>

const model = 'test-model'

/** An SSE body that sends `events`, then stays open until the request aborts. */
function openStream(events: Array<Record<string, unknown>>): Fetch {
  return async (_url, init) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
          )
        }
        init?.signal?.addEventListener('abort', () => {
          controller.error(init.signal?.reason ?? new Error('aborted'))
        })
      },
    })
    return new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
}

class Responses extends OpenAIBaseResponsesTextAdapter<string> {}
class Completions extends OpenAIBaseChatCompletionsTextAdapter<string> {}

const adapters = [
  {
    name: 'Responses',
    make: () => {
      const fetch = openStream([
        {
          type: 'response.created',
          response: { id: 'resp-1', model, status: 'in_progress' },
        },
        { type: 'response.output_text.delta', delta: 'The answer is ' },
      ])
      return new Responses(
        model,
        'openai',
        createOpenAIClient({ apiKey: 'test-key', maxRetries: 0, fetch }),
        { fetch },
      )
    },
  },
  {
    name: 'Chat Completions',
    make: () => {
      const fetch = openStream([
        {
          id: 'chatcmpl-1',
          object: 'chat.completion.chunk',
          created: 1,
          model,
          choices: [
            { index: 0, delta: { content: 'partial' }, finish_reason: null },
          ],
        },
      ])
      return new Completions(
        model,
        'openai',
        createOpenAIClient({ apiKey: 'test-key', maxRetries: 0, fetch }),
        { fetch },
      )
    },
  },
]

describe.each(adapters)('$name: a caller abort mid-stream', ({ make }) => {
  it('reaches onAbort and logs nothing on the errors channel', async () => {
    const logger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const onAbort = vi.fn()
    const onError = vi.fn()
    const controller = new AbortController()

    for await (const event of chat({
      threadId: 'thread-1',
      adapter: make(),
      messages: [{ role: 'user', content: 'Hello' }],
      abortController: controller,
      // Default categories: only `errors` is on, as when `debug` is left out.
      debug: {
        logger,
        provider: false,
        output: false,
        middleware: false,
        tools: false,
        agentLoop: false,
        config: false,
        request: false,
        sandbox: false,
      },
      middleware: [{ name: 'observe', onAbort, onError }],
    })) {
      // Abort while the adapter waits for the next SSE event, as a user's
      // Stop does between two tokens.
      if (event.type === 'TEXT_MESSAGE_CONTENT') {
        setTimeout(() => controller.abort(), 10)
      }
    }

    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(vi.mocked(logger.error).mock.calls).toEqual([])
  })

  it('a drained structuredOutputStream logs nothing on the errors channel', async () => {
    const logger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const controller = new AbortController()
    const events: Array<AdapterYieldChunk> = []

    for await (const event of make().structuredOutputStream({
      chatOptions: {
        threadId: 'thread-1',
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        request: { signal: controller.signal },
        logger: resolveDebugOption({ logger }),
      },
      outputSchema: { type: 'object', properties: {} },
    })) {
      events.push(event)
      if (event.type === 'TEXT_MESSAGE_CONTENT') {
        setTimeout(() => controller.abort(), 10)
      }
    }

    expect(events.at(-1)).toMatchObject({ type: 'RUN_ERROR', code: 'aborted' })
    expect(vi.mocked(logger.error).mock.calls).toEqual([])
  })
})
