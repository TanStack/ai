import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGrokImage } from '../src/adapters/image'
import { createGrokText } from '../src/adapters/text'
import { createGrokTranscription } from '../src/adapters/transcription'
import { createGrokSpeech } from '../src/adapters/tts'
import { createGrokVideo } from '../src/adapters/video'

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

describe('Grok adapters abort the provider request', () => {
  it('image generate', async () => {
    const wire = hangingFetch()
    const adapter = createGrokImage('grok-imagine-image', 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'grok-imagine-image',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('image edit', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createGrokImage('grok-imagine-image', 'test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'grok-imagine-image',
        prompt: [
          { type: 'text', content: 'make it blue' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.test/in.png' },
          },
        ],
        abortSignal,
        logger,
      }),
    )
  })

  it('transcription', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createGrokTranscription('grok-stt', 'test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.transcribe({
        model: 'grok-stt',
        audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
        abortSignal,
        logger,
      }),
    )
  })

  it('speech', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createGrokSpeech('grok-tts', 'test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateSpeech({
        model: 'grok-tts',
        text: 'hello',
        abortSignal,
        logger,
      }),
    )
  })

  it.each([undefined, 'edit', 'extend'] as const)(
    'video create (mode %s)',
    async (mode) => {
      const wire = hangingFetch()
      const adapter = createGrokVideo('grok-imagine-video', 'test-key', {
        fetch: wire.fetch,
      })
      await expectAbortReachesFetch(wire, (abortSignal) =>
        adapter.createVideoJob({
          model: 'grok-imagine-video',
          prompt: mode
            ? [
                { type: 'text', content: 'make the sky stormy' },
                {
                  type: 'video',
                  source: { type: 'url', value: 'https://example.test/a.mp4' },
                },
              ]
            : 'a cat',
          ...(mode && { modelOptions: { mode } }),
          abortSignal,
          logger,
        }),
      )
    },
  )

  it.each(['stream', 'structured'] as const)('text %s', async (mode) => {
    const wire = hangingFetch()
    const model = 'grok-4.3'
    const adapter = createGrokText(model, 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
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
  })
})
