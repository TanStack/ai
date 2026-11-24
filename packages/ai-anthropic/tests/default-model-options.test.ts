import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicTextAdapter, createAnthropicChat } from '../src/adapters/text'
import { createAnthropicSummarize } from '../src/adapters/summarize'
import { anthropicVertexText } from '../src/vertex'
import type { AnthropicMessagesClient } from '../src/utils/client'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: Record<string, unknown>) => void>(),
    vertexConstructorSpy: vi.fn<(options: Record<string, unknown>) => void>(),
  }
})

vi.mock('@anthropic-ai/vertex-sdk', () => {
  class MockAnthropicVertex {
    beta = { messages: { create: vi.fn() } }

    constructor(options: Record<string, unknown>) {
      mocks.vertexConstructorSpy(options)
    }
  }

  return { AnthropicVertex: MockAnthropicVertex }
})

vi.mock('../src/client', () => {
  class MockAnthropic {
    beta = { messages: { create: vi.fn() } }

    constructor(options: Record<string, unknown>) {
      mocks.constructorSpy(options)
    }
  }

  return {
    createAnthropicClient: (options: Record<string, unknown>) =>
      new MockAnthropic(options),
  }
})

describe('Anthropic defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createAnthropicChat('claude-sonnet-4-5', 'test-key', {
      defaultModelOptions: { max_tokens: 1024 },
    })

    expect(adapter.defaultModelOptions).toEqual({ max_tokens: 1024 })
    expect(mocks.constructorSpy).toHaveBeenCalledOnce()
    const sdkOptions = mocks.constructorSpy.mock.calls[0]?.[0]
    expect(sdkOptions).toMatchObject({ apiKey: 'test-key' })
    expect(sdkOptions).not.toHaveProperty('defaultModelOptions')
  })

  it('text adapter with an injected client stores the defaults', () => {
    const client: AnthropicMessagesClient = {
      beta: { messages: { create: vi.fn() } },
    }
    const adapter = new AnthropicTextAdapter(
      { client, defaultModelOptions: { max_tokens: 512 } },
      'claude-sonnet-4-5',
    )

    expect(adapter.defaultModelOptions).toEqual({ max_tokens: 512 })
    expect(mocks.constructorSpy).not.toHaveBeenCalled()
  })

  it('vertex text factory stores the defaults and keeps them out of the Vertex client', () => {
    const adapter = anthropicVertexText('claude-sonnet-5', {
      project: 'my-project',
      location: 'europe-west1',
      defaultModelOptions: { max_tokens: 256 },
    })

    expect(adapter.defaultModelOptions).toEqual({ max_tokens: 256 })
    expect(mocks.vertexConstructorSpy).toHaveBeenCalledExactlyOnceWith({
      projectId: 'my-project',
      region: 'europe-west1',
    })
  })
})

describe('Anthropic summarize defaultModelOptions', () => {
  it('summarize factory exposes the defaults of its text adapter', () => {
    const adapter = createAnthropicSummarize('claude-sonnet-4-5', 'test-key', {
      defaultModelOptions: { max_tokens: 300 },
    })

    expect(adapter.defaultModelOptions).toEqual({ max_tokens: 300 })
  })
})
