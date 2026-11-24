import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCloudflareEmbedding } from '../src/adapters/embedding'
import { cloudflareImage, createCloudflareImage } from '../src/adapters/image'
import { createCloudflareText } from '../src/adapters/text'
import { createCloudflareTranscription } from '../src/adapters/transcription'
import { createCloudflareTTS } from '../src/adapters/tts'

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

const restConfig = { accountId: 'test-account', apiKey: 'test-key' }

describe('Cloudflare defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text adapter stores the defaults and keeps them out of the SDK client', () => {
    const adapter = createCloudflareText('@cf/openai/gpt-oss-120b', {
      ...restConfig,
      defaultModelOptions: { temperature: 0.2 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.2 })
    expect(mocks.clientOptionsSpy).toHaveBeenCalledOnce()
    expect(mocks.clientOptionsSpy.mock.calls[0]?.[0]).toEqual({
      apiKey: 'test-key',
      baseURL:
        'https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1',
      defaultHeaders: {},
      fetch: expect.any(Function),
    })
  })

  it('embedding adapter stores the defaults', () => {
    const adapter = createCloudflareEmbedding('@cf/baai/bge-m3', {
      ...restConfig,
      defaultModelOptions: { truncate_inputs: true },
    })

    expect(adapter.defaultModelOptions).toEqual({ truncate_inputs: true })
  })

  it('image adapter stores the defaults', () => {
    const adapter = createCloudflareImage(
      '@cf/black-forest-labs/flux-1-schnell',
      { ...restConfig, defaultModelOptions: { steps: 4 } },
    )

    expect(adapter.defaultModelOptions).toEqual({ steps: 4 })
  })

  it('env-reading image factory keeps the defaults', () => {
    const adapter = cloudflareImage('@cf/black-forest-labs/flux-1-schnell', {
      ...restConfig,
      defaultModelOptions: { seed: 7 },
    })

    expect(adapter.defaultModelOptions).toEqual({ seed: 7 })
  })

  it('speech adapter stores the defaults', () => {
    const adapter = createCloudflareTTS('@cf/deepgram/aura-2-en', {
      ...restConfig,
      defaultModelOptions: { speaker: 'luna' },
    })

    expect(adapter.defaultModelOptions).toEqual({ speaker: 'luna' })
  })

  it('transcription adapter stores the defaults', () => {
    const adapter = createCloudflareTranscription('@cf/deepgram/nova-3', {
      ...restConfig,
      defaultModelOptions: { smart_format: true },
    })

    expect(adapter.defaultModelOptions).toEqual({ smart_format: true })
  })
})
