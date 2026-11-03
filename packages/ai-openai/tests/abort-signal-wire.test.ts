import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenaiDecider } from '../src/adapters/evaluate'
import { createOpenaiImage } from '../src/adapters/image'
import { createOpenaiChat } from '../src/adapters/text'
import { createOpenaiChatCompletions } from '../src/adapters/text-chat-completions'
import { createOpenaiTranscription } from '../src/adapters/transcription'
import { createOpenaiSpeech } from '../src/adapters/tts'
import { createOpenaiVideo } from '../src/adapters/video'

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

const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' })
const dataImage = {
  type: 'image' as const,
  source: { type: 'data' as const, value: 'aGk=', mimeType: 'image/png' },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenAI adapters abort the provider request', () => {
  it('image generate', async () => {
    const wire = hangingFetch()
    const adapter = createOpenaiImage('gpt-image-2', 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'gpt-image-2',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('image edit', async () => {
    const wire = hangingFetch()
    const adapter = createOpenaiImage('gpt-image-2', 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'gpt-image-2',
        prompt: [{ type: 'text', content: 'make it blue' }, dataImage],
        abortSignal,
        logger,
      }),
    )
  })

  it('image edit: input image URL fetch', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createOpenaiImage('gpt-image-2', 'test-key', {
      allowUrlFetch: true,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'gpt-image-2',
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

  it.each([
    ['plain', 'gpt-4o-transcribe'],
    ['verbose', 'whisper-1'],
    ['diarized', 'gpt-4o-transcribe-diarize'],
  ] as const)('transcription (%s)', async (_mode, model) => {
    const wire = hangingFetch()
    const adapter = createOpenaiTranscription(model, 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.transcribe({ model, audio, abortSignal, logger }),
    )
  })

  it('speech', async () => {
    const wire = hangingFetch()
    const adapter = createOpenaiSpeech('gpt-4o-mini-tts', 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateSpeech({
        model: 'gpt-4o-mini-tts',
        text: 'hello',
        abortSignal,
        logger,
      }),
    )
  })

  it('video create', async () => {
    const wire = hangingFetch()
    const adapter = createOpenaiVideo('sora-2', 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'sora-2',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('evaluate', async () => {
    const wire = hangingFetch()
    const adapter = createOpenaiDecider('gpt-6-luna', 'test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.evaluate({
        model: 'gpt-6-luna',
        state: 'Charged twice',
        questions: {
          refund: { type: 'noul', instructions: 'Refund asked?' },
        },
        abortSignal,
        logger,
      }),
    )
  })

  it.each([
    ['Responses', createOpenaiChat],
    ['Chat Completions', createOpenaiChatCompletions],
  ] as const)(
    'text %s: chatStream + structuredOutput',
    async (_api, create) => {
      for (const mode of ['stream', 'structured'] as const) {
        const wire = hangingFetch()
        const adapter = create('gpt-5.5', 'test-key', {
          fetch: wire.fetch,
          maxRetries: 0,
        })
        await expectAbortReachesFetch(wire, async (signal) => {
          const chatOptions = {
            threadId: 'thread-1',
            logger,
            model: 'gpt-5.5' as const,
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

  it('video create: input reference URL fetch', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createOpenaiVideo('sora-2', 'test-key', {
      allowUrlFetch: true,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'sora-2',
        prompt: [
          { type: 'text', content: 'a cat' },
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
})
