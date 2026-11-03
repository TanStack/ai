import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { falAudio } from '../src/adapters/audio'
import { falImage } from '../src/adapters/image'
import { falSpeech } from '../src/adapters/speech'
import { falTranscription } from '../src/adapters/transcription'
import { falVideo } from '../src/adapters/video'

const logger = resolveDebugOption(false)

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  })
}

/** Rejects at once without a signal, else rejects only when it aborts. */
function hang(signals: Array<AbortSignal>, init?: RequestInit) {
  const signal = init?.signal
  if (!signal) return Promise.reject(new Error('fetch got no abort signal'))
  signals.push(signal)
  return new Promise<Response>((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason))
  })
}

/**
 * A fake fal queue. Submit answers with request `req-1`, cancel answers at
 * once, and every status or result poll hangs until its signal aborts. With
 * `completed`, polls answer with a finished job whose result is `result`.
 */
function falQueue(completed?: { result: unknown }) {
  const signals: Array<AbortSignal> = []
  const cancels: Array<string> = []
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.endsWith('/cancel')) {
      cancels.push(url)
      return Promise.resolve(json({ status: 'CANCELLATION_REQUESTED' }))
    }
    if (init?.method?.toLowerCase() === 'post') {
      return Promise.resolve(json({ request_id: 'req-1' }))
    }
    if (completed) {
      return Promise.resolve(
        json(
          url.includes('/status') ? { status: 'COMPLETED' } : completed.result,
        ),
      )
    }
    return hang(signals, init)
  })
  return { fetch, signals, cancels }
}

/**
 * Starts the call, aborts the caller, and expects the request to abort, the
 * queued job to be cancelled, and the call to reject.
 */
async function expectAbortCancelsJob(
  queue: ReturnType<typeof falQueue>,
  start: (signal: AbortSignal) => Promise<unknown>,
) {
  const controller = new AbortController()
  const run = start(controller.signal)
  run.catch(() => {})
  await vi.waitFor(() => expect(queue.signals.length).toBeGreaterThan(0))
  controller.abort()
  await vi.waitFor(
    () => expect(queue.signals.at(-1)?.aborted, 'request aborted').toBe(true),
    { timeout: 500 },
  )
  await expect(run).rejects.toBeDefined()
  await vi.waitFor(
    () =>
      expect(queue.cancels).toEqual([expect.stringContaining('req-1/cancel')]),
    { timeout: 500 },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fal adapters abort the provider request', () => {
  it('image', async () => {
    const queue = falQueue()
    const adapter = falImage('fal-ai/flux/dev', {
      apiKey: 'test-key',
      fetch: queue.fetch,
    })
    await expectAbortCancelsJob(queue, (abortSignal) =>
      adapter.generateImages({
        model: 'fal-ai/flux/dev',
        prompt: 'a cat',
        abortSignal,
        logger,
      }),
    )
  })

  it('audio', async () => {
    const queue = falQueue()
    const adapter = falAudio('fal-ai/minimax-music/v2', {
      apiKey: 'test-key',
      fetch: queue.fetch,
    })
    await expectAbortCancelsJob(queue, (abortSignal) =>
      adapter.generateAudio({
        model: 'fal-ai/minimax-music/v2',
        prompt: 'calm piano',
        abortSignal,
        logger,
      }),
    )
  })

  it('speech', async () => {
    const queue = falQueue()
    const adapter = falSpeech('fal-ai/index-tts-2/text-to-speech', {
      apiKey: 'test-key',
      fetch: queue.fetch,
    })
    await expectAbortCancelsJob(queue, (abortSignal) =>
      adapter.generateSpeech({
        model: 'fal-ai/index-tts-2/text-to-speech',
        text: 'hello',
        abortSignal,
        logger,
      }),
    )
  })

  it('transcription', async () => {
    const queue = falQueue()
    const adapter = falTranscription('fal-ai/whisper', {
      apiKey: 'test-key',
      fetch: queue.fetch,
    })
    await expectAbortCancelsJob(queue, (abortSignal) =>
      adapter.transcribe({
        model: 'fal-ai/whisper',
        audio: 'https://example.test/a.mp3',
        abortSignal,
        logger,
      }),
    )
  })

  it('speech: audio download', async () => {
    const queue = falQueue({
      result: { audio: { url: 'https://fal.media/files/speech.mp3' } },
    })
    const download: Array<AbortSignal> = []
    const downloadFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) => hang(download, init),
    )
    vi.stubGlobal('fetch', downloadFetch)
    const adapter = falSpeech('fal-ai/index-tts-2/text-to-speech', {
      apiKey: 'test-key',
      fetch: queue.fetch,
    })
    const controller = new AbortController()
    const run = adapter.generateSpeech({
      model: 'fal-ai/index-tts-2/text-to-speech',
      text: 'hello',
      abortSignal: controller.signal,
      logger,
    })
    run.catch(() => {})
    await vi.waitFor(() => expect(downloadFetch).toHaveBeenCalled())
    controller.abort()
    await vi.waitFor(
      () => expect(download.at(-1)?.aborted, 'download aborted').toBe(true),
      { timeout: 500 },
    )
    await expect(run).rejects.toBeDefined()
  })

  it('video submit', async () => {
    const signals: Array<AbortSignal> = []
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      hang(signals, init),
    )
    const adapter = falVideo('fal-ai/veo3/image-to-video', {
      apiKey: 'test-key',
      fetch,
    })
    const controller = new AbortController()
    const run = adapter.createVideoJob({
      model: 'fal-ai/veo3/image-to-video',
      prompt: 'a cat',
      abortSignal: controller.signal,
      logger,
    })
    run.catch(() => {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    controller.abort()
    await vi.waitFor(
      () => expect(signals.at(-1)?.aborted, 'request aborted').toBe(true),
      { timeout: 500 },
    )
    await expect(run).rejects.toBeDefined()
  })
})
