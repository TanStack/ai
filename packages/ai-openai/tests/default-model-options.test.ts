import { beforeEach, describe, expect, it, vi } from 'vitest'

// The OpenAI client constructors are the SDK boundary. Each mock records the
// config it gets, so a test can check what reaches the SDK.
const clientConfigs = vi.hoisted(() => [] as Array<object>)

vi.mock('@tanstack/openai-base', async (importOriginal) => {
  const recordConfig = (config: object) => {
    clientConfigs.push(config)
    return { baseURL: 'https://api.example.com/v1' }
  }
  return {
    ...(await importOriginal<typeof import('@tanstack/openai-base')>()),
    createOpenAIClient: recordConfig,
    createAzureOpenAIClient: recordConfig,
  }
})

/* eslint-disable import/first -- imports intentionally follow the vi.mock setup above */
import { createOpenaiChat } from '../src/adapters/text'
import { createOpenaiChatCompletions } from '../src/adapters/text-chat-completions'
import { createAzureOpenaiText } from '../src/adapters/azure-text'
import { createOpenaiEmbedding } from '../src/adapters/embedding'
import { createOpenaiImage } from '../src/adapters/image'
import { createOpenaiVideo } from '../src/adapters/video'
import { createOpenaiSpeech } from '../src/adapters/tts'
import { createOpenaiTranscription } from '../src/adapters/transcription'
import { openaiCompatible, openaiCompatibleText } from '../src/compatible/index'
/* eslint-enable import/first */

const API_KEY = 'test-key'
const COMPATIBLE = { baseURL: 'https://api.example.com/v1', apiKey: API_KEY }

const cases = [
  {
    name: 'text (responses)',
    defaults: { store: false },
    create: () =>
      createOpenaiChat('gpt-6.1-sol', API_KEY, {
        defaultModelOptions: { store: false },
      }),
  },
  {
    name: 'text (chat completions)',
    defaults: { store: false },
    create: () =>
      createOpenaiChatCompletions('gpt-6.1-sol', API_KEY, {
        defaultModelOptions: { store: false },
      }),
  },
  {
    name: 'text (azure)',
    defaults: { store: false },
    create: () =>
      createAzureOpenaiText('gpt-6.1-sol', API_KEY, {
        resourceName: 'my-resource',
        defaultModelOptions: { store: false },
      }),
  },
  {
    name: 'text (openai-compatible, one model)',
    defaults: { top_k: 5 },
    create: () =>
      openaiCompatibleText('my-model', {
        ...COMPATIBLE,
        defaultModelOptions: { top_k: 5 },
      }),
  },
  {
    name: 'text (openai-compatible provider)',
    defaults: { top_k: 5 },
    create: () =>
      openaiCompatible({
        ...COMPATIBLE,
        models: ['my-model'],
        api: 'responses',
        defaultModelOptions: { top_k: 5 },
      })('my-model'),
  },
  {
    name: 'embedding',
    defaults: { user: 'u-1' },
    create: () =>
      createOpenaiEmbedding('text-embedding-3-small', API_KEY, {
        defaultModelOptions: { user: 'u-1' },
      }),
  },
  {
    name: 'image',
    defaults: { quality: 'high' },
    create: () =>
      createOpenaiImage('gpt-image-1', API_KEY, {
        defaultModelOptions: { quality: 'high' },
      }),
  },
  {
    name: 'video',
    defaults: { seconds: '8' },
    create: () =>
      createOpenaiVideo('sora-2', API_KEY, {
        defaultModelOptions: { seconds: '8' },
      }),
  },
  {
    name: 'speech',
    defaults: { instructions: 'Speak slowly.' },
    create: () =>
      createOpenaiSpeech('gpt-4o-mini-tts', API_KEY, {
        defaultModelOptions: { instructions: 'Speak slowly.' },
      }),
  },
  {
    name: 'transcription',
    defaults: { temperature: 0.2 },
    create: () =>
      createOpenaiTranscription('whisper-1', API_KEY, {
        defaultModelOptions: { temperature: 0.2 },
      }),
  },
]

describe.each(cases)('$name adapter defaultModelOptions', (testCase) => {
  beforeEach(() => {
    clientConfigs.length = 0
  })

  it('stores the defaults on the adapter', () => {
    expect(testCase.create().defaultModelOptions).toEqual(testCase.defaults)
  })

  it('keeps the defaults out of the OpenAI client config', () => {
    testCase.create()

    expect(clientConfigs).toHaveLength(1)
    expect(clientConfigs[0]).not.toHaveProperty('defaultModelOptions')
  })
})
