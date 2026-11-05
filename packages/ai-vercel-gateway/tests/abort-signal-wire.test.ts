import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createVercelGatewayDecider } from '../src/adapters/evaluate'
import { createVercelGatewayImage } from '../src/adapters/image'
import { createVercelGatewayResponsesText } from '../src/adapters/responses-text'
import { VercelGatewayTextAdapter } from '../src/adapters/text'

const logger = resolveDebugOption(false)

/**
 * A fake `fetch` that never answers. It rejects at once when it gets no abort
 * signal. Otherwise it rejects only when its signal aborts.
 */
function hangingFetch() {
  const signals: Array<AbortSignal> = []
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (!signal) return Promise.reject(new Error('fetch got no abort signal'))
    signals.push(signal)
    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason))
    })
  })
  return { fetch, signals }
}

/** Starts the call, aborts the caller, and expects the request to abort. */
async function expectAbortReachesFetch(
  wire: ReturnType<typeof hangingFetch>,
  start: (signal: AbortSignal) => Promise<unknown>,
) {
  const controller = new AbortController()
  const run = start(controller.signal)
  run.catch(() => {})
  await vi.waitFor(() => expect(wire.fetch).toHaveBeenCalled())
  controller.abort()
  await vi.waitFor(
    () => expect(wire.signals.at(-1)?.aborted, 'request aborted').toBe(true),
    { timeout: 500 },
  )
  await expect(run).rejects.toBeDefined()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Vercel AI Gateway adapters abort the provider request', () => {
  it('image generate', async () => {
    const wire = hangingFetch()
    const adapter = createVercelGatewayImage('openai/gpt-image-1.5', 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'openai/gpt-image-1.5',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('evaluate', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createVercelGatewayDecider('typesafe-ai/jev', 'test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.evaluate({
        model: 'typesafe-ai/jev',
        state: 'Charged twice',
        questions: {
          refund: { type: 'noul', instructions: 'Refund asked?' },
        },
        abortSignal,
        logger,
      }),
    )
  })

  const model = 'openai/gpt-5.5'
  it.each([
    [
      'Chat Completions',
      (fetch: typeof globalThis.fetch) =>
        new VercelGatewayTextAdapter(
          { apiKey: 'test-key', fetch, maxRetries: 0 },
          model,
        ),
    ],
    [
      'Responses',
      (fetch: typeof globalThis.fetch) =>
        createVercelGatewayResponsesText(model, 'test-key', {
          fetch,
          maxRetries: 0,
        }),
    ],
  ] as const)(
    'text %s: chatStream + structuredOutput',
    async (_api, create) => {
      for (const mode of ['stream', 'structured'] as const) {
        const wire = hangingFetch()
        const adapter = create(wire.fetch)
        await expectAbortReachesFetch(wire, async (signal) => {
          const chatOptions = {
            threadId: 'thread-1',
            logger,
            model,
            messages: [{ role: 'user' as const, content: 'Hi' }],
            request: { signal },
          }
          if (mode === 'structured') {
            await adapter.structuredOutput({
              chatOptions,
              outputSchema: { type: 'object', properties: {} },
            })
            return
          }
          // The stream reports the abort as a RUN_ERROR chunk.
          for await (const chunk of adapter.chatStream(chatOptions)) {
            if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
          }
        })
      }
    },
  )
})
