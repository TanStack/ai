import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GroqTTSAdapter } from '../src/adapters/tts'
import { GroqTranscriptionAdapter } from '../src/adapters/transcription'
import type { GroqTTSModel } from '../src/model-meta'

const logger = resolveDebugOption(false)
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

class SpeechAdapter<
  TModel extends GroqTTSModel,
> extends GroqTTSAdapter<TModel> {
  spyOnCreate() {
    return vi.spyOn(this.client.audio.speech, 'create')
  }
}

describe('Groq media adapters forward the abort signal', () => {
  it('passes it to the SDK for speech', async () => {
    const adapter = new SpeechAdapter(
      { apiKey: 'test-key' },
      'canopylabs/orpheus-v1-english',
    )
    const create = adapter.spyOnCreate().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    } as never)
    const controller = new AbortController()

    await adapter.generateSpeech({
      model: 'canopylabs/orpheus-v1-english',
      text: 'hello',
      abortSignal: controller.signal,
      logger,
    })

    const requestOptions = create.mock.calls[0]?.[1] as
      | { signal?: AbortSignal }
      | undefined
    expect(requestOptions?.signal).toBe(controller.signal)
  })

  it('passes it to fetch for transcription', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 'hello' }),
      text: () => Promise.resolve(''),
    } as Partial<Response> as Response)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const adapter = new GroqTranscriptionAdapter(
      { apiKey: 'test-key' },
      'whisper-large-v3',
    )
    const controller = new AbortController()

    await adapter.transcribe({
      model: 'whisper-large-v3',
      audio: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
      abortSignal: controller.signal,
      logger,
    })

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })
})
