import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGeminiAudio } from '../src/adapters/audio'
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

/** @google/genai has no `fetch` option, so the global one is stubbed. */
function stubFetch() {
  const wire = hangingFetch()
  vi.stubGlobal('fetch', wire.fetch)
  return wire
}

afterEach(() => {
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
  it.each([
    ['stream', 'stream', text],
    ['structured', 'structured', text],
    ['stream, agentic video (Interactions API)', 'stream', agenticVideo],
  ] as const)('text %s', async (_label, mode, messages) => {
    const wire = stubFetch()
    const adapter = createGeminiChat('gemini-3.8-flash', 'test-key')
    await expectAbortReachesFetch(wire, (signal) =>
      runText(adapter as unknown as TextAdapter, mode, [...messages], signal),
    )
  })

  it.each(['stream', 'structured'] as const)(
    'experimental text interactions %s',
    async (mode) => {
      const wire = stubFetch()
      const adapter = createGeminiTextInteractions(
        'gemini-3.8-flash',
        'test-key',
      )
      await expectAbortReachesFetch(wire, (signal) =>
        runText(adapter as unknown as TextAdapter, mode, text, signal),
      )
    },
  )

  it('image', async () => {
    const wire = stubFetch()
    const adapter = createGeminiImage('gemini-3.1-flash-image', 'test-key')
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

  it('video create (Omni)', async () => {
    const wire = stubFetch()
    const adapter = createGeminiVideo('gemini-omni-1.1-flash', 'test-key')
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
