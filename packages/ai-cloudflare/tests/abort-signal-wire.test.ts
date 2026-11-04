import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createCloudflareDecider } from '../src/adapters/evaluate'
import { createCloudflareImage } from '../src/adapters/image'
import { createCloudflareText } from '../src/adapters/text'
import { createCloudflareTranscription } from '../src/adapters/transcription'
import { createCloudflareTTS } from '../src/adapters/tts'

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

// Binding mode (`env.AI.run`) is not covered: the binding takes no abort
// signal, so there is no request to cancel. Only REST mode can abort.
const rest = (fetch: typeof globalThis.fetch) => ({
  accountId: 'account-1',
  apiKey: 'test-key',
  fetch,
})
const audio = new Uint8Array([1, 2, 3]).buffer

describe('Cloudflare REST adapters abort the provider request', () => {
  it.each(['stream', 'structured'] as const)('text %s', async (mode) => {
    const wire = hangingFetch()
    const adapter = createCloudflareText('@cf/test', {
      ...rest(wire.fetch),
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, async (signal) => {
      const chatOptions = {
        threadId: 'thread-1',
        logger,
        model: '@cf/test',
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
    const wire = hangingFetch()
    const adapter = createCloudflareImage('@cf/test', rest(wire.fetch))
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: '@cf/test',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('speech', async () => {
    const wire = hangingFetch()
    const adapter = createCloudflareTTS('@cf/test', rest(wire.fetch))
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateSpeech({
        model: '@cf/test',
        text: 'hello',
        abortSignal,
        logger,
      }),
    )
  })

  it.each(['@cf/openai/whisper-large-v3-turbo', '@cf/deepgram/nova-3'])(
    'transcription (%s)',
    async (model) => {
      const wire = hangingFetch()
      const adapter = createCloudflareTranscription(model, rest(wire.fetch))
      await expectAbortReachesFetch(wire, (abortSignal) =>
        adapter.transcribe({ model, audio, abortSignal, logger }),
      )
    },
  )

  it('transcription: audio URL fetch', async () => {
    const wire = hangingFetch()
    const adapter = createCloudflareTranscription(
      '@cf/openai/whisper-large-v3-turbo',
      rest(wire.fetch),
    )
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.transcribe({
        model: '@cf/openai/whisper-large-v3-turbo',
        audio: 'https://example.test/a.mp3',
        abortSignal,
        logger,
      }),
    )
  })

  it('evaluate', async () => {
    const wire = hangingFetch()
    const adapter = createCloudflareDecider('typesafe/jev', rest(wire.fetch))
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.evaluate({
        model: 'typesafe/jev',
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
