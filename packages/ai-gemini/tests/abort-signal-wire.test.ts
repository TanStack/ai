import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGeminiAudio } from '../src/adapters/audio'
import { createGeminiFiles } from '../src/adapters/files'
import { createGeminiImage } from '../src/adapters/image'
import { createGeminiChat } from '../src/adapters/text'
import { createGeminiSpeech } from '../src/adapters/tts'
import { createGeminiVideo } from '../src/adapters/video'
import { createGeminiTextInteractions } from '../src/experimental'
import type { ModelMessage } from '@tanstack/ai'

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

/**
 * Replaces `interactions.create` of the adapter's client with a call that
 * never answers. This check reads the signal that the adapter gives to
 * `interactions.create`.
 */
function hangingInteractionsCreate(adapter: object) {
  const { interactions } = (
    adapter as { client: { interactions: { create: () => unknown } } }
  ).client
  const signals: Array<AbortSignal> = []
  const fetch = vi
    .spyOn(interactions, 'create')
    .mockImplementation((...args: Array<unknown>) => {
      const signal = (args[1] as { signal?: AbortSignal } | undefined)?.signal
      if (!signal)
        return Promise.reject(new Error('client got no abort signal'))
      signals.push(signal)
      return new Promise((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason)
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    })
  return { fetch, signals }
}

/** Starts the call, aborts the caller, and expects the request to abort. */
async function expectAbortReachesFetch(
  wire: { fetch: object; signals: Array<AbortSignal> },
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

/** @google/genai has no `fetch` option, so the global one is stubbed. */
function stubFetch() {
  const wire = hangingFetch()
  vi.stubGlobal('fetch', wire.fetch)
  return wire
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const text: Array<ModelMessage> = [{ role: 'user', content: 'Hi' }]
const agenticVideo: Array<ModelMessage> = [
  {
    role: 'user',
    content: [
      { type: 'text', content: 'What happens?' },
      {
        type: 'video',
        source: { type: 'url', value: 'files/abc', mimeType: 'video/mp4' },
        metadata: { processing: 'agentic' },
      },
    ],
  },
]
const urlImage = {
  type: 'image' as const,
  source: { type: 'url' as const, value: 'https://example.test/in.png' },
}

type TextAdapter = {
  chatStream: (options: never) => AsyncIterable<{ type: string }>
  structuredOutput: (options: never) => Promise<unknown>
}

/** Runs one text call with the caller signal in `request`. */
function runText(
  adapter: TextAdapter,
  mode: 'stream' | 'structured',
  messages: Array<ModelMessage>,
  signal: AbortSignal,
) {
  const chatOptions = {
    threadId: 'thread-1',
    logger,
    model: 'gemini-3.8-flash',
    messages,
    request: { signal },
  }
  if (mode === 'structured') {
    return adapter.structuredOutput({
      chatOptions,
      outputSchema: { type: 'object', properties: {} },
    } as never)
  }
  return (async () => {
    // The stream reports an abort as a RUN_ERROR chunk, not a throw.
    for await (const chunk of adapter.chatStream(chatOptions as never)) {
      if (chunk.type === 'RUN_ERROR') throw new Error('run error')
    }
  })()
}

describe('Gemini adapters abort the provider request', () => {
  it.each(['stream', 'structured'] as const)('text %s', async (mode) => {
    const wire = stubFetch()
    const adapter = createGeminiChat('gemini-3.8-flash', 'test-key')
    await expectAbortReachesFetch(wire, (signal) =>
      runText(adapter as unknown as TextAdapter, mode, text, signal),
    )
  })

  it('text stream, agentic video (Interactions API)', async () => {
    const adapter = createGeminiChat('gemini-3.8-flash', 'test-key')
    const wire = hangingInteractionsCreate(adapter)
    await expectAbortReachesFetch(wire, (signal) =>
      runText(
        adapter as unknown as TextAdapter,
        'stream',
        agenticVideo,
        signal,
      ),
    )
  })

  it.each(['stream', 'structured'] as const)(
    'experimental text interactions %s',
    async (mode) => {
      const adapter = createGeminiTextInteractions(
        'gemini-3.8-flash',
        'test-key',
      )
      const wire = hangingInteractionsCreate(adapter)
      await expectAbortReachesFetch(wire, (signal) =>
        runText(adapter as unknown as TextAdapter, mode, text, signal),
      )
    },
  )

  it('image', async () => {
    const adapter = createGeminiImage('gemini-3.1-flash-image', 'test-key')
    const wire = hangingInteractionsCreate(adapter)
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'gemini-3.1-flash-image',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('audio (Lyria)', async () => {
    const wire = stubFetch()
    const adapter = createGeminiAudio('lyria-3-clip-preview', 'test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateAudio({
        model: 'lyria-3-clip-preview',
        prompt: 'calm piano',
        abortSignal,
        logger,
      }),
    )
  })

  it('speech', async () => {
    const wire = stubFetch()
    const adapter = createGeminiSpeech(
      'gemini-2.5-flash-preview-tts',
      'test-key',
    )
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateSpeech({
        model: 'gemini-2.5-flash-preview-tts',
        text: 'hello',
        abortSignal,
        logger,
      }),
    )
  })

  it('video create (Veo)', async () => {
    const wire = stubFetch()
    const adapter = createGeminiVideo('veo-3.1-generate-preview', 'test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'veo-3.1-generate-preview',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('video create (Veo): input image URL fetch', async () => {
    const wire = stubFetch()
    const adapter = createGeminiVideo('veo-3.1-generate-preview', 'test-key', {
      allowUrlFetch: true,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'veo-3.1-generate-preview',
        prompt: [{ type: 'text', content: 'a cat' }, urlImage],
        abortSignal,
        logger,
      }),
    )
  })

  it('files upload', async () => {
    const wire = stubFetch()
    const adapter = createGeminiFiles('test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.upload(new Blob(['x'], { type: 'text/plain' }), { abortSignal }),
    )
  })

  it('files upload: a chunk request', async () => {
    const wire = hangingFetch()
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      // The start request answers with the upload URL. Chunks hang.
      if (url.includes('upload/v1beta/files')) {
        return Promise.resolve(
          new Response('{}', {
            headers: { 'x-goog-upload-url': 'https://upload.test/session' },
          }),
        )
      }
      return wire.fetch(input, init)
    })
    vi.stubGlobal('fetch', fetch)
    const adapter = createGeminiFiles('test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.upload(new Blob(['x'], { type: 'text/plain' }), { abortSignal }),
    )
  })

  it('files upload: the retry wait stops at once', async () => {
    // Every chunk answers without an upload status, so the upload waits 1 s
    // before it retries.
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const headers: Record<string, string> = url.includes('upload/v1beta')
        ? { 'x-goog-upload-url': 'https://upload.test/session' }
        : {}
      return Promise.resolve(new Response('{}', { headers }))
    })
    vi.stubGlobal('fetch', fetch)
    const adapter = createGeminiFiles('test-key')
    const controller = new AbortController()
    const run = adapter.upload(new Blob(['x'], { type: 'text/plain' }), {
      abortSignal: controller.signal,
    })
    run.catch(() => {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const reason = new Error('stopped')
    const started = Date.now()
    controller.abort(reason)
    await expect(run).rejects.toBe(reason)
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('video create (Omni)', async () => {
    const adapter = createGeminiVideo('gemini-omni-1.1-flash', 'test-key')
    const wire = hangingInteractionsCreate(adapter)
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'gemini-omni-1.1-flash',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })
})

// The Interactions client drops its own `httpOptions.timeout` when the
// request has a signal. So a caller signal must not remove that timeout.
describe('Gemini Interactions calls keep httpOptions.timeout', () => {
  const httpOptions = { timeout: 50 }

  /** Starts the call with a caller signal that never aborts. */
  async function expectTimeoutAborts(
    wire: { fetch: object; signals: Array<AbortSignal> },
    start: (signal: AbortSignal) => Promise<unknown>,
  ) {
    const run = start(new AbortController().signal)
    run.catch(() => {})
    await vi.waitFor(
      () => expect(wire.signals.at(-1)?.aborted, 'request aborted').toBe(true),
      { timeout: 1000 },
    )
    await expect(run).rejects.toBeDefined()
  }

  it('text stream, agentic video: the timeout aborts', async () => {
    const adapter = createGeminiChat('gemini-3.8-flash', 'test-key', {
      httpOptions,
    })
    const wire = hangingInteractionsCreate(adapter)
    await expectTimeoutAborts(wire, (signal) =>
      runText(
        adapter as unknown as TextAdapter,
        'stream',
        agenticVideo,
        signal,
      ),
    )
  })

  it('text stream, agentic video: the caller still aborts', async () => {
    const adapter = createGeminiChat('gemini-3.8-flash', 'test-key', {
      httpOptions: { timeout: 60_000 },
    })
    const wire = hangingInteractionsCreate(adapter)
    await expectAbortReachesFetch(wire, (signal) =>
      runText(
        adapter as unknown as TextAdapter,
        'stream',
        agenticVideo,
        signal,
      ),
    )
  })

  it('video create (Omni): the timeout aborts', async () => {
    const adapter = createGeminiVideo('gemini-omni-1.1-flash', 'test-key', {
      httpOptions,
    })
    const wire = hangingInteractionsCreate(adapter)
    await expectTimeoutAborts(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'gemini-omni-1.1-flash',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('video create (Omni): the caller still aborts', async () => {
    const adapter = createGeminiVideo('gemini-omni-1.1-flash', 'test-key', {
      httpOptions: { timeout: 60_000 },
    })
    const wire = hangingInteractionsCreate(adapter)
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'gemini-omni-1.1-flash',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })
})
