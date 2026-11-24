import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGroqText } from '../src/adapters/text'
import { createGroqTranscription } from '../src/adapters/transcription'
import { createGroqSpeech } from '../src/adapters/tts'

const mocks = vi.hoisted(() => ({
  clientOptionsSpy: vi.fn<(options: object) => void>(),
}))

vi.mock('@tanstack/openai-base', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/openai-base')>()),
  createOpenAIClient: (options: object) => {
    mocks.clientOptionsSpy(options)
    return {}
  },
}))

/** The options that the adapter gave to the OpenAI SDK client. */
function sdkClientOptions() {
  expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
  return mocks.clientOptionsSpy.mock.calls[0]?.[0]
}

const groqClientOptions = {
  apiKey: 'test-key',
  baseURL: 'https://api.groq.com/openai/v1',
}

describe('Groq defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGroqText('openai/gpt-oss-120b', 'test-key', {
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expect(sdkClientOptions()).toEqual(groqClientOptions)
  })

  it('speech adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createGroqSpeech(
      'canopylabs/orpheus-v1-english',
      'test-key',
      { defaultModelOptions: { sample_rate: 16000 } },
    )

    expect(adapter.defaultModelOptions).toEqual({ sample_rate: 16000 })
    expect(sdkClientOptions()).toEqual(groqClientOptions)
  })

  it('transcription adapter stores the defaults', () => {
    const adapter = createGroqTranscription('whisper-large-v3', 'test-key', {
      defaultModelOptions: { temperature: 0 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0 })
  })
})
