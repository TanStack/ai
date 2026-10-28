import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIImageAdapter } from '../src/adapters/image'
import { OpenAITranscriptionAdapter } from '../src/adapters/transcription'
import { OpenAITTSAdapter } from '../src/adapters/tts'
import type {
  OpenAIImageModel,
  OpenAITTSModel,
  OpenAITranscriptionModel,
} from '../src/model-meta'

const logger = resolveDebugOption(false)

class SpeechAdapter<
  TModel extends OpenAITTSModel,
> extends OpenAITTSAdapter<TModel> {
  spyOnCreate() {
    return vi.spyOn(this.client.audio.speech, 'create')
  }
}

class TranscriptionAdapter<
  TModel extends OpenAITranscriptionModel,
> extends OpenAITranscriptionAdapter<TModel> {
  spyOnCreate() {
    return vi.spyOn(this.client.audio.transcriptions, 'create')
  }
}

class ImageAdapter<
  TModel extends OpenAIImageModel,
> extends OpenAIImageAdapter<TModel> {
  spyOnGenerate() {
    return vi.spyOn(this.client.images, 'generate')
  }
}

function expectForwarded(
  call: ReadonlyArray<unknown> | undefined,
  controller: AbortController,
) {
  const requestOptions = call?.[1] as { signal?: AbortSignal } | undefined
  expect(requestOptions?.signal).toBe(controller.signal)
}

describe('OpenAI media adapters forward the abort signal to the SDK', () => {
  it('forwards it for speech', async () => {
    const adapter = new SpeechAdapter({ apiKey: 'test-key' }, 'tts-1')
    const create = adapter.spyOnCreate().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    } as never)
    const controller = new AbortController()

    await adapter.generateSpeech({
      model: 'tts-1',
      text: 'hello',
      abortSignal: controller.signal,
      logger,
    })

    expectForwarded(create.mock.calls[0], controller)
  })

  it('forwards it for image generation', async () => {
    const adapter = new ImageAdapter({ apiKey: 'test-key' }, 'gpt-image-1')
    const generate = adapter.spyOnGenerate().mockResolvedValue({
      data: [{ b64_json: 'aGk=' }],
    } as never)
    const controller = new AbortController()

    await adapter.generateImages({
      model: 'gpt-image-1',
      prompt: 'a cat',
      abortSignal: controller.signal,
      logger,
    })

    expectForwarded(generate.mock.calls[0], controller)
  })

  it.each([
    ['plain', 'whisper-1', undefined, { text: 'hello' }],
    ['verbose', 'whisper-1', 'verbose_json', { text: 'hello', segments: [] }],
    [
      'diarized',
      'gpt-4o-transcribe-diarize',
      undefined,
      { text: 'hello', segments: [] },
    ],
  ] as const)(
    'forwards it for %s transcription',
    async (_mode, model, responseFormat, reply) => {
      const adapter = new TranscriptionAdapter({ apiKey: 'test-key' }, model)
      const create = adapter.spyOnCreate().mockResolvedValue(reply as never)
      const controller = new AbortController()

      await adapter.transcribe({
        model,
        audio: new ArrayBuffer(8),
        ...(responseFormat !== undefined && { responseFormat }),
        abortSignal: controller.signal,
        logger,
      })

      expectForwarded(create.mock.calls[0], controller)
    },
  )

  it('sends no extra argument when the caller passes no signal', async () => {
    const adapter = new SpeechAdapter({ apiKey: 'test-key' }, 'tts-1')
    const create = adapter.spyOnCreate().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    } as never)

    await adapter.generateSpeech({ model: 'tts-1', text: 'hello', logger })

    expect(create.mock.calls[0]).toHaveLength(1)
  })
})
