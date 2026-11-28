import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLovableEmbedding } from '../src/adapters/embedding'
import { createLovableText } from '../src/adapters/factory'
import { createLovableImage } from '../src/adapters/image'
import { createLovableTranscription } from '../src/adapters/transcription'
import { createLovableSpeech } from '../src/adapters/tts'
import { createLovableVideo } from '../src/adapters/video'

const mocks = vi.hoisted(() => ({
  clientOptionsSpy: vi.fn<(options: object) => void>(),
}))

// Record the options that reach the OpenAI-compatible client.
vi.mock('@tanstack/openai-base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/openai-base')>()
  return {
    ...actual,
    createOpenAIClient: (
      options: Parameters<typeof actual.createOpenAIClient>[0],
    ) => {
      mocks.clientOptionsSpy(options)
      return actual.createOpenAIClient(options)
    },
  }
})

const cases = [
  {
    kind: 'chat completions',
    create: () =>
      createLovableText('openai/gpt-5.5', 'test-key', {
        api: 'chat',
        defaultModelOptions: { temperature: 0.2 },
      }),
    expected: { temperature: 0.2 },
  },
  {
    kind: 'responses',
    create: () =>
      createLovableText('openai/gpt-5.5', 'test-key', {
        defaultModelOptions: { max_output_tokens: 512 },
      }),
    expected: { max_output_tokens: 512 },
  },
  {
    kind: 'embedding',
    create: () =>
      createLovableEmbedding('openai/text-embedding-3-small', 'test-key', {
        defaultModelOptions: { user: 'u-1' },
      }),
    expected: { user: 'u-1' },
  },
  {
    kind: 'image',
    create: () =>
      createLovableImage('openai/gpt-image-2', 'test-key', {
        defaultModelOptions: { quality: 'high' },
      }),
    expected: { quality: 'high' },
  },
  {
    kind: 'transcription',
    create: () =>
      createLovableTranscription('openai/gpt-4o-mini-transcribe', 'test-key', {
        defaultModelOptions: { prompt: 'names' },
      }),
    expected: { prompt: 'names' },
  },
  {
    kind: 'tts',
    create: () =>
      createLovableSpeech('openai/gpt-4o-mini-tts', 'test-key', {
        defaultModelOptions: { instructions: 'calm' },
      }),
    expected: { instructions: 'calm' },
  },
  {
    kind: 'video',
    create: () =>
      createLovableVideo('google/veo-3.1-lite', 'test-key', {
        defaultModelOptions: { seconds: '4' },
      }),
    expected: { seconds: '4' },
  },
]

describe('Lovable defaultModelOptions', () => {
  beforeEach(() => {
    mocks.clientOptionsSpy.mockClear()
  })

  it.each(cases)(
    '$kind adapter stores the defaults and keeps them out of the client',
    ({ create, expected }) => {
      const adapter = create()

      expect(adapter.defaultModelOptions).toEqual(expected)
      expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
      const clientOptions = mocks.clientOptionsSpy.mock.calls[0]?.[0]
      expect(clientOptions).toMatchObject({ apiKey: 'test-key' })
      expect(clientOptions).not.toHaveProperty('defaultModelOptions')
    },
  )
})
