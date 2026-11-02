import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createBytePlusImage } from '../src/adapters/image'
import { createBytePlusText } from '../src/adapters/text'
import { createBytePlusTranscription } from '../src/adapters/transcription'
import { createBytePlusSpeech } from '../src/adapters/tts'
import { createBytePlusVideo } from '../src/adapters/video'

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

describe('BytePlus adapters abort the provider request', () => {
  it.each(['stream', 'structured'] as const)('text %s', async (mode) => {
    const wire = hangingFetch()
    const adapter = createBytePlusText('seed-1-6-250915', 'ark-test-key', {
      fetch: wire.fetch,
      maxRetries: 0,
    })
    await expectAbortReachesFetch(wire, async (signal) => {
      const chatOptions = {
        threadId: 'thread-1',
        logger,
        model: 'seed-1-6-250915' as const,
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

  // The config timeout must not replace the caller signal.
  it.each([undefined, 60_000])('image (timeout %s)', async (timeout) => {
    const wire = hangingFetch()
    const adapter = createBytePlusImage('seedream-4-0-250828', 'ark-test-key', {
      fetch: wire.fetch,
      ...(timeout && { timeout }),
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateImages({
        model: 'seedream-4-0-250828',
        prompt: 'a guitar',
        abortSignal,
        logger,
      }),
    )
  })

  it.each([undefined, 60_000])('video create (timeout %s)', async (timeout) => {
    const wire = hangingFetch()
    const adapter = createBytePlusVideo(
      'seedance-1-0-pro-fast-251015',
      'ark-test-key',
      { fetch: wire.fetch, ...(timeout && { timeout }) },
    )
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.createVideoJob({
        model: 'seedance-1-0-pro-fast-251015',
        prompt: 'a guitar',
        abortSignal,
        logger,
      }),
    )
  })

  it('transcription', async () => {
    const wire = hangingFetch()
    const adapter = createBytePlusTranscription('seed-asr', 'voice-key', {
      fetch: wire.fetch,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.transcribe({
        model: 'seed-asr',
        audio: 'https://example.com/guitar.mp3',
        abortSignal,
        logger,
      }),
    )
  })

  it('speech', async () => {
    const wire = hangingFetch()
    const adapter = createBytePlusSpeech('seed-audio-1.0', 'voice-key', {
      fetch: wire.fetch,
    })
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateSpeech({
        model: 'seed-audio-1.0',
        text: 'hello',
        abortSignal,
        logger,
      }),
    )
  })
})
