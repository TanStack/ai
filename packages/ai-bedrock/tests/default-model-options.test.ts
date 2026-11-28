import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBedrockConverse } from '../src/adapters/converse-text'
import { createBedrockEmbedding } from '../src/adapters/embedding'
import { bedrockRerank } from '../src/adapters/rerank'
import { createBedrockResponsesText } from '../src/adapters/responses-text'
import { createBedrockChat } from '../src/adapters/text'
import { createBedrockText } from '../src/index'

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

const baseURL = 'https://bedrock.test/v1'

/** The options that the adapter gave to the OpenAI SDK client. */
function sdkClientOptions() {
  expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
  return mocks.clientOptionsSpy.mock.calls[0]?.[0]
}

describe('Bedrock defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('chat adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createBedrockChat('openai.gpt-oss-120b-1:0', 'test-key', {
      baseURL,
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key', baseURL })
  })

  it('responses adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createBedrockResponsesText(
      'openai.gpt-oss-120b-1:0',
      'test-key',
      { baseURL, defaultModelOptions: { store: false } },
    )

    expect(adapter.defaultModelOptions).toEqual({ store: false })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key', baseURL })
  })

  it('converse adapter stores the defaults', () => {
    const adapter = createBedrockConverse(
      'us.amazon.nova-pro-v1:0',
      'test-key',
      {
        defaultModelOptions: { temperature: 0.3 },
      },
    )

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.3 })
  })

  it('branching factory passes the defaults to the converse adapter', () => {
    const adapter = createBedrockText('us.amazon.nova-pro-v1:0', 'test-key', {
      defaultModelOptions: { top_p: 0.9 },
    })

    expect(adapter.defaultModelOptions).toEqual({ top_p: 0.9 })
  })

  it('branching factory passes the defaults to the chat adapter', () => {
    const adapter = createBedrockText('openai.gpt-oss-120b-1:0', 'test-key', {
      api: 'chat',
      baseURL,
      defaultModelOptions: { seed: 7 },
    })

    expect(adapter.defaultModelOptions).toEqual({ seed: 7 })
    expect(sdkClientOptions()).toEqual({ apiKey: 'test-key', baseURL })
  })

  it('embedding adapter stores the defaults', () => {
    const adapter = createBedrockEmbedding(
      'amazon.titan-embed-text-v2:0',
      'test-key',
      { defaultModelOptions: { normalize: true } },
    )

    expect(adapter.defaultModelOptions).toEqual({ normalize: true })
  })

  it('rerank adapter stores the defaults', () => {
    const adapter = bedrockRerank('amazon.rerank-v1:0', {
      region: 'us-west-2',
      defaultModelOptions: { additionalModelRequestFields: { top_k: 3 } },
    })

    expect(adapter.defaultModelOptions).toEqual({
      additionalModelRequestFields: { top_k: 3 },
    })
  })
})
