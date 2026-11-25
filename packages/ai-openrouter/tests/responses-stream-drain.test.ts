/**
 * After a terminal Responses event the adapter stops reading. That cancels the
 * SDK's event stream and the fetch body, so a gateway logs a finished call as
 * a client cancel (499). The adapter gives the body a short time to end by
 * itself and only then cancels it (#1965).
 */
import { describe, expect, it } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenRouterResponsesTextAdapter } from '../src/adapters/responses-text'

const logger = resolveDebugOption(false)
const model = 'openai/gpt-5.5'
const messages = [{ role: 'user' as const, content: 'Hi' }]
const completed = {
  type: 'response.completed',
  sequence_number: 1,
  response: {
    id: 'resp-1',
    object: 'response',
    created_at: 0,
    model,
    status: 'completed',
    output: [],
  },
}

interface Seen {
  cancelled: boolean
  /** Whether the body had been cancelled when it ended by itself. */
  cancelledAtEnd: boolean
}

/** A body that sends `completed`, then ends after `closeAfterMs` (never if null). */
function adapterFor(closeAfterMs: number | null, seen: Seen) {
  const httpClient = new HTTPClient({
    fetcher: async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(completed)}\n\n`),
          )
          if (closeAfterMs !== null) {
            setTimeout(() => {
              seen.cancelledAtEnd = seen.cancelled
              try {
                controller.close()
              } catch {
                // the body was cancelled, so it is already closed
              }
            }, closeAfterMs)
          }
        },
        cancel() {
          seen.cancelled = true
        },
      })
      return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  return new OpenRouterResponsesTextAdapter(
    { apiKey: 'test-key', httpClient },
    model,
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const entries = [
  {
    name: 'chatStream',
    run: async (adapter: OpenRouterResponsesTextAdapter<typeof model>) => {
      for await (const _ of adapter.chatStream({
        threadId: 't',
        logger,
        model,
        messages,
      })) {
        // drain
      }
    },
  },
  {
    name: 'structuredOutputStream',
    run: async (adapter: OpenRouterResponsesTextAdapter<typeof model>) => {
      for await (const _ of adapter.structuredOutputStream({
        chatOptions: { threadId: 't', logger, model, messages },
        outputSchema: { type: 'object', properties: { a: { type: 'number' } } },
      })) {
        // drain
      }
    },
  },
]

describe.each(entries)('$name after response.completed', ({ run }) => {
  it('does not cancel a body that ends by itself soon after', async () => {
    // starts true so the test fails if the body never ends
    const seen: Seen = { cancelled: false, cancelledAtEnd: true }
    await run(adapterFor(20, seen))
    await sleep(80)
    expect(seen.cancelledAtEnd).toBe(false)
  })

  it('returns at once and cancels a body that never ends', async () => {
    const seen: Seen = { cancelled: false, cancelledAtEnd: false }
    await run(adapterFor(null, seen))
    expect(seen.cancelled).toBe(false)
    await sleep(450)
    expect(seen.cancelled).toBe(true)
  })
})
