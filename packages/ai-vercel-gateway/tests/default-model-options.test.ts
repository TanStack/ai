import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVercelGatewayEmbedding } from '../src/adapters/embedding'
import { createVercelGatewayDecider } from '../src/adapters/evaluate'
import { createVercelGatewayText } from '../src/adapters/factory'
import { createVercelGatewayImage } from '../src/adapters/image'

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

function expectClientWithoutDefaults() {
  expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
  const clientOptions = mocks.clientOptionsSpy.mock.calls[0]?.[0]
  expect(clientOptions).toMatchObject({ apiKey: 'test-key' })
  expect(clientOptions).not.toHaveProperty('defaultModelOptions')
}

describe('Vercel AI Gateway defaultModelOptions', () => {
  beforeEach(() => {
    mocks.clientOptionsSpy.mockClear()
  })

  it('chat completions adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'test-key', {
      api: 'chat',
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expectClientWithoutDefaults()
  })

  it('responses adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'test-key', {
      defaultModelOptions: { max_output_tokens: 512 },
    })

    expect(adapter.defaultModelOptions).toEqual({ max_output_tokens: 512 })
    expectClientWithoutDefaults()
  })

  it('embedding adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createVercelGatewayEmbedding(
      'openai/text-embedding-3-small',
      'test-key',
      { defaultModelOptions: { user: 'u-1' } },
    )

    expect(adapter.defaultModelOptions).toEqual({ user: 'u-1' })
    expectClientWithoutDefaults()
  })

  it('image adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createVercelGatewayImage('openai/gpt-image-2', 'test-key', {
      defaultModelOptions: { quality: 'hd' },
    })

    expect(adapter.defaultModelOptions).toEqual({ quality: 'hd' })
    expectClientWithoutDefaults()
  })

  it('evaluate adapter stores the defaults', () => {
    const adapter = createVercelGatewayDecider('typesafe-ai/jev', 'test-key', {
      defaultModelOptions: { gateway: { sort: 'cost' } },
    })

    expect(adapter.defaultModelOptions).toEqual({ gateway: { sort: 'cost' } })
  })
})
