import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createGroqText } from '../src/adapters/text'
import { createGroqTranscription } from '../src/adapters/transcription'
import { createGroqSpeech } from '../src/adapters/tts'

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

describe('Groq adapters abort the provider request', () => {
  it('speech', async () => {
    const wire = hangingFetch()
    const adapter = createGroqSpeech(
      'canopylabs/orpheus-v1-english',
      'test-key',
      {
        fetch: wire.fetch,
        maxRetries: 0,
      },
    )
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateSpeech({
        model: 'canopylabs/orpheus-v1-english',
        text: 'hello',
        abortSignal,
        logger,
      }),
    )
  })

  it('transcription', async () => {
    const wire = hangingFetch()
    vi.stubGlobal('fetch', wire.fetch)
    const adapter = createGroqTranscription('whisper-large-v3', 'test-key')
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.transcribe({
        model: 'whisper-large-v3',
        audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
        abortSignal,
        logger,
      }),
    )
  })

  it.each(['stream', 'structured'] as const)('text %s', async (mode) => {
    const wire = hangingFetch()
    const model = 'openai/gpt-oss-120b'
    const adapter = createGroqText(model, 'test-key', {
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
