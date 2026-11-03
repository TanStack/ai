import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenRouterDecider } from '../src/adapters/evaluate'
import { createOpenRouterImage } from '../src/adapters/image'
import { createOpenRouterRerank } from '../src/adapters/rerank'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'
import { createOpenRouterText } from '../src/adapters/text'
import { createOpenRouterVideo } from '../src/adapters/video'

const logger = resolveDebugOption(false)

type Wire = {
  fetch: { mock: { calls: Array<unknown> } }
  signals: Array<AbortSignal>
}

/** Hangs until `signal` aborts. Rejects at once when there is no signal. */
function hang(signals: Array<AbortSignal>, signal: AbortSignal | undefined) {
  if (!signal) return Promise.reject(new Error('request got no abort signal'))
  signals.push(signal)
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason))
  })
}

/** A fake `fetch` that never answers, for the adapters that call `fetch`. */
function hangingFetch(): Wire {
  const signals: Array<AbortSignal> = []
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    hang(
      signals,
      init?.signal ?? (input instanceof Request ? input.signal : undefined),
    ),
  )
  return { fetch, signals }
}

/**
 * Replaces one OpenRouter SDK method with a call that never answers. The SDK
 * sends `request.clone()`, and after a GC the signal of the clone stops
 * following the caller signal. So a fake `fetch` cannot show the abort
 * reliably. This check reads the signal that the adapter gives to the SDK.
 */
function hangingSdkCall(resource: object, method: string): Wire {
  const signals: Array<AbortSignal> = []
  const fetch = vi
    .spyOn(Object.getPrototypeOf(resource), method)
    .mockImplementation((...args: Array<unknown>) => {
      const options = args[1] as
        | {
            signal?: AbortSignal | null
            fetchOptions?: { signal?: AbortSignal | null }
          }
        | undefined
      return hang(
        signals,
        options?.signal ?? options?.fetchOptions?.signal ?? undefined,
      )
    })
  return { fetch, signals }
}

/** Starts the call, aborts the caller, and expects the request to abort. */
async function expectAbortReachesFetch(
  wire: Wire,
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

/** Reads the private SDK client of an adapter. */
function sdkOf(adapter: object) {
  const holder = adapter as {
    client?: Record<string, any>
    orClient?: Record<string, any>
  }
  const client = holder.client ?? holder.orClient
  if (!client) throw new Error('adapter has no SDK client')
  return client
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('OpenRouter adapters abort the provider request', () => {
  it.each([
    ['Chat', 'stream'],
    ['Chat', 'structured'],
    ['Responses', 'stream'],
    ['Responses', 'structured'],
  ] as const)('text %s %s', async (api, mode) => {
    const adapter =
      api === 'Chat'
        ? createOpenRouterText('openai/gpt-4o', 'sk-or-test')
        : createOpenRouterResponsesText('openai/gpt-4o', 'sk-or-test')
    const client = sdkOf(adapter)
    const wire =
      api === 'Chat'
        ? hangingSdkCall(client.chat, 'send')
        : hangingSdkCall(client.beta.responses, 'send')
    await expectAbortReachesFetch(wire, async (signal) => {
      const chatOptions = {
        threadId: 'thread-1',
        logger,
        model: 'openai/gpt-4o' as const,
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
      // The stream reports an abort as a RUN_ERROR chunk, not a throw.
      for await (const chunk of adapter.chatStream(chatOptions)) {
        if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
      }
    })
  })

  it('image', async () => {
    const adapter = createOpenRouterImage(
      'google/gemini-2.5-flash-image',
      'sk-or-test',
    )
    const wire = hangingSdkCall(sdkOf(adapter).chat, 'send')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'google/gemini-2.5-flash-image',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('video create', async () => {
    const adapter = createOpenRouterVideo(
      'bytedance/seedance-2.0',
      'sk-or-test',
    )
    const wire = hangingSdkCall(sdkOf(adapter).videoGeneration, 'generate')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'bytedance/seedance-2.0',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('rerank', async () => {
    const adapter = createOpenRouterRerank('cohere/rerank-v3.5', 'sk-or-test')
    const wire = hangingSdkCall(sdkOf(adapter).rerank, 'rerank')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.rerank({
        model: 'cohere/rerank-v3.5',
        query: 'rain',
        documents: ['a', 'b'],
        abortSignal,
        logger,
      }),
    )
  })

  it('evaluate', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createOpenRouterDecider(
      '~typesafe/jev-latest',
      'sk-or-test',
    )
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.evaluate({
        model: '~typesafe/jev-latest',
        state: { subject: 'Invoice 1842' },
        questions: {
          refund: { type: 'noul', instructions: 'Refund asked?' },
        },
        abortSignal,
        logger,
      }),
    )
  })
})
