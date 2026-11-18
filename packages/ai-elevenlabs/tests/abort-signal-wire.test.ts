import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createElevenLabsAudio } from '../src/adapters/audio'
import { createElevenLabsSpeech } from '../src/adapters/speech'
import { createElevenLabsTranscription } from '../src/adapters/transcription'
import { createElevenLabsVoiceDesign } from '../src/adapters/voice'

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

// The adapter config has no `fetch` option, so stub the global one.
function stubFetch() {
  const wire = hangingFetch()
  vi.stubGlobal('fetch', wire.fetch)
  return wire
}

const config = { maxRetries: 0 }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ElevenLabs adapters abort the provider request', () => {
  it.each([
    ['speech', false, false],
    ['speech with timestamps', false, true],
    ['dialogue', true, false],
    ['dialogue with timestamps', true, true],
  ] as const)('%s', async (_name, dialogue, timestamps) => {
    const wire = stubFetch()
    const adapter = createElevenLabsSpeech('eleven_v3', 'test-key', config)
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateSpeech({
        model: 'eleven_v3',
        text: 'hello',
        voice: 'voice-1',
        ...(dialogue && {
          turns: [
            { text: 'hi', voice: 'voice-1' },
            { text: 'hey', voice: 'voice-2' },
          ],
        }),
        timestamps,
        abortSignal,
        logger,
      }),
    )
  })

  it('listVoices', async () => {
    const wire = stubFetch()
    const adapter = createElevenLabsSpeech('eleven_v3', 'test-key', config)
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.listVoices({ abortSignal }),
    )
  })

  it.each(['music_v1', 'eleven_text_to_sound_v2'] as const)(
    'audio (%s)',
    async (model) => {
      const wire = stubFetch()
      const adapter = createElevenLabsAudio(model, 'test-key', config)
      await expectAbortReachesFetch(wire, (abortSignal) =>
        adapter.generateAudio({
          model,
          prompt: 'rain on a roof',
          abortSignal,
          logger,
        }),
      )
    },
  )

  it('transcription', async () => {
    const wire = stubFetch()
    const adapter = createElevenLabsTranscription(
      'scribe_v2',
      'test-key',
      config,
    )
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.transcribe({
        model: 'scribe_v2',
        audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
        abortSignal,
        logger,
      }),
    )
  })

  it('voice design', async () => {
    const wire = stubFetch()
    const adapter = createElevenLabsVoiceDesign(
      'eleven_ttv_v3',
      'test-key',
      config,
    )
    await expectAbortReachesFetch(wire, (abortSignal) =>
      adapter.generateVoice({
        model: 'eleven_ttv_v3',
        prompt: 'a calm narrator',
        abortSignal,
        logger,
      }),
    )
  })
})
