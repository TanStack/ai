import { describe, expect, it, vi } from 'vitest'

const ctor = vi.fn()
vi.mock('openai', () => ({
  default: class {
    constructor(opts: unknown) {
      ctor(opts)
    }
    chat = { completions: { create: vi.fn() } }
    responses = { create: vi.fn() }
  },
}))

/* eslint-disable import/first -- imports intentionally follow the vi.mock setup above */
import {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from '../src/compatible/adapter'
import {
  openaiCompatible,
  openaiCompatibleText,
} from '../src/compatible/index'
/* eslint-enable import/first */

describe('openaiCompatible', () => {
  it('builds the OpenAI client once with baseURL + apiKey + extra options', () => {
    ctor.mockClear()
    const provider = openaiCompatible({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      models: ['model-a', 'model-b'],
      defaultHeaders: { 'X-Title': 'demo' },
    })
    expect(ctor).toHaveBeenCalledTimes(1)
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        defaultHeaders: { 'X-Title': 'demo' },
      }),
    )
    provider('model-a')
    provider('model-b')
    expect(ctor).toHaveBeenCalledTimes(1)
  })

  it('returns a Chat Completions adapter by default', () => {
    const provider = openaiCompatible({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      models: ['model-a'],
    })
    expect(provider('model-a')).toBeInstanceOf(OpenAICompatibleChatAdapter)
  })

  it('returns a Responses adapter when api: "responses"', () => {
    const provider = openaiCompatible({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      models: ['model-a'],
      api: 'responses',
    })
    expect(provider('model-a')).toBeInstanceOf(OpenAICompatibleResponsesAdapter)
  })

  it('uses the provided name (default "openai-compatible")', () => {
    const provider = openaiCompatible({
      name: 'deepseek',
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      models: ['model-a'],
    })
    expect(provider('model-a').name).toBe('deepseek')

    const unnamed = openaiCompatible({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      models: ['model-a'],
    })
    expect(unnamed('model-a').name).toBe('openai-compatible')
  })
})

describe('openaiCompatibleText', () => {
  it('builds a single-model Chat Completions adapter', () => {
    const adapter = openaiCompatibleText('model-a', {
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
    })
    expect(adapter).toBeInstanceOf(OpenAICompatibleChatAdapter)
    expect(adapter.model).toBe('model-a')
  })
})
