import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNeonEmbedding } from '../src/adapters/embedding'
import { createNeonText } from '../src/adapters/factory'

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

const HOST = 'https://br-test-api.ai.c-1.us-east-2.aws.neon.tech'

function expectClientWithoutDefaults() {
  expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
  const clientOptions = mocks.clientOptionsSpy.mock.calls[0]?.[0]
  expect(clientOptions).toMatchObject({ apiKey: 'nt-test' })
  expect(clientOptions).not.toHaveProperty('defaultModelOptions')
}

describe('Neon defaultModelOptions', () => {
  beforeEach(() => {
    mocks.clientOptionsSpy.mockClear()
  })

  it('chat completions adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createNeonText('gemini-3-8-flash', 'nt-test', {
      baseURL: HOST,
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expectClientWithoutDefaults()
  })

  it('responses adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createNeonText('gpt-5-3-codex', 'nt-test', {
      baseURL: HOST,
      defaultModelOptions: { max_output_tokens: 512 },
    })

    expect(adapter.defaultModelOptions).toEqual({ max_output_tokens: 512 })
    expectClientWithoutDefaults()
  })

  it('anthropic adapter stores the defaults', () => {
    const adapter = createNeonText('claude-haiku-4-5', 'nt-test', {
      baseURL: HOST,
      defaultModelOptions: { max_tokens: 1024 },
    })

    expect(adapter.defaultModelOptions).toEqual({ max_tokens: 1024 })
  })

  it('embedding adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createNeonEmbedding('qwen3-embedding-0-6b', 'nt-test', {
      baseURL: HOST,
      defaultModelOptions: { user: 'u-1' },
    })

    expect(adapter.defaultModelOptions).toEqual({ user: 'u-1' })
    expectClientWithoutDefaults()
  })
})
