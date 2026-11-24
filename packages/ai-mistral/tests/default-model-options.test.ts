import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMistralEmbedding } from '../src/adapters/embedding'
import { createMistralText } from '../src/adapters/text'
import { mistralVertexText } from '../src/vertex'
import type { MistralClientConfig } from '../src/utils/client'

const mocks = vi.hoisted(() => {
  return {
    createClientSpy: vi.fn<(config: MistralClientConfig) => void>(),
  }
})

vi.mock('../src/client', () => ({
  createMistralClient: (config: MistralClientConfig) => {
    mocks.createClientSpy(config)
    return {}
  },
}))

/** The config that the adapter gave to the Mistral client. */
function clientConfig() {
  expect(mocks.createClientSpy).toHaveBeenCalledOnce()
  return mocks.createClientSpy.mock.calls[0]?.[0]
}

describe('Mistral defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createMistralText('mistral-large-latest', 'test-key', {
      defaultModelOptions: { temperature: 0.3 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.3 })
    expect(clientConfig()).toEqual({ apiKey: 'test-key' })
  })

  it('embedding adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createMistralEmbedding('codestral-embed', 'test-key', {
      defaultModelOptions: { outputDtype: 'int8' },
    })

    expect(adapter.defaultModelOptions).toEqual({ outputDtype: 'int8' })
    expect(clientConfig()).toEqual({ apiKey: 'test-key' })
  })

  it('vertex text factory passes the defaults to the adapter only', () => {
    const adapter = mistralVertexText('mistral-medium-3', {
      project: 'my-project',
      location: 'europe-west4',
      getAccessToken: () => Promise.resolve('token'),
      defaultModelOptions: { temperature: 0.1 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0.1 })
    expect(clientConfig()).not.toHaveProperty('defaultModelOptions')
  })
})
