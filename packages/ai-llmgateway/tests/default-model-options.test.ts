import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLLMGatewayText } from '../src/adapters/text'

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

describe('LLM Gateway defaultModelOptions', () => {
  beforeEach(() => {
    mocks.clientOptionsSpy.mockClear()
  })

  it('text adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createLLMGatewayText('gpt-5.6-terra', 'test-key', {
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
    const clientOptions = mocks.clientOptionsSpy.mock.calls[0]?.[0]
    expect(clientOptions).toMatchObject({ apiKey: 'test-key' })
    expect(clientOptions).not.toHaveProperty('defaultModelOptions')
  })
})
