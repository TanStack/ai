/**
 * After a terminal Responses event the adapters stop reading, which makes the
 * OpenAI SDK abort the request. A gateway then logs the finished call as a
 * client cancel (499). The adapters give the body a short time to end by
 * itself and only then abort it (#1965).
 */
import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { ClientOptions } from 'openai'
import type { OpenAIClientLike } from '../src/client'

type Fetch = NonNullable<ClientOptions['fetch']>

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'
const completed = {
  type: 'response.completed',
  response: {
    id: 'response-1',
    model,
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'message-1',
        role: 'assistant',
        content: [{ type: 'output_text', text: '{"a":1}', annotations: [] }],
      },
    ],
  },
}

class Responses extends OpenAIBaseResponsesTextAdapter<string> {}

/**
 * The SDK client as an `OpenAIClientLike`. Its method types take the SDK
 * request params, ours take the generated bodies; the runtime calls match.
 * This test needs the SDK `Stream`: only it gives the drain an `abort`.
 */
const sdkClient = (client: OpenAI) => client as unknown as OpenAIClientLike

interface Seen {
  /** Whether the request was aborted when the body ended by itself. */
  aborted: boolean
  signal?: AbortSignal | null
}

/** A body that sends `completed`, then ends after `closeAfterMs` (never if null). */
function fakeFetch(closeAfterMs: number | null, seen: Seen) {
  const fetch: Fetch = async (_url, init) => {
    seen.signal = init?.signal
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(completed)}\n\n`),
        )
        if (closeAfterMs !== null) {
          setTimeout(() => {
            seen.aborted = init?.signal?.aborted ?? false
            try {
              controller.close()
            } catch {
              // the request was aborted, so the body is already closed
            }
          }, closeAfterMs)
        }
        init?.signal?.addEventListener('abort', () => {
          try {
            controller.error(new Error('aborted'))
          } catch {
            // already closed
          }
        })
      },
    })
    return new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  return fetch
}

function adapterFor(fetch: Fetch) {
  return new Responses(
    model,
    'openai',
    sdkClient(new OpenAI({ apiKey: 'k', fetch })),
    {
      fetch,
    },
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const entries = [
  {
    name: 'chatStream',
    run: async (adapter: Responses) => {
      for await (const _ of adapter.chatStream({
        threadId: 't',
        logger,
        model,
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        // drain
      }
    },
  },
  {
    name: 'structuredOutputStream',
    run: async (adapter: Responses) => {
      for await (const _ of adapter.structuredOutputStream({
        chatOptions: {
          threadId: 't',
          logger,
          model,
          messages: [{ role: 'user', content: 'Hi' }],
        },
        outputSchema: { type: 'object', properties: { a: { type: 'number' } } },
      })) {
        // drain
      }
    },
  },
]

describe.each(entries)('$name after response.completed', ({ run }) => {
  it('does not abort a body that ends by itself soon after', async () => {
    // starts true so the test fails if the body never ends
    const seen: Seen = { aborted: true }
    await run(adapterFor(fakeFetch(20, seen)))
    await sleep(60)
    expect(seen.aborted).toBe(false)
  })

  it('returns at once and aborts a body that never ends', async () => {
    const seen: Seen = { aborted: false }
    await run(adapterFor(fakeFetch(null, seen)))
    expect(seen.signal?.aborted).toBe(false)
    await sleep(450)
    expect(seen.signal?.aborted).toBe(true)
  })
})
