import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOllamaEmbedding,
  ollamaEmbedding,
} from '../src/adapters/embedding'
import { ollamaSummarize } from '../src/adapters/summarize'
import { createOllamaChat, ollamaText } from '../src/adapters/text'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: Record<string, unknown>) => void>(),
  }
})

vi.mock('ollama', () => {
  class Ollama {
    constructor(options: Record<string, unknown>) {
      mocks.constructorSpy(options)
    }
  }
  return { Ollama }
})

/** The options that the adapter gave to the Ollama client. */
function sdkClientOptions() {
  expect(mocks.constructorSpy).toHaveBeenCalledOnce()
  return mocks.constructorSpy.mock.calls[0]?.[0]
}

describe('Ollama defaultModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('text adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createOllamaChat('llama3.2:latest', {
      host: 'http://remote:11434',
      defaultModelOptions: { keep_alive: '5m' },
    })

    expect(adapter.defaultModelOptions).toEqual({ keep_alive: '5m' })
    expect(sdkClientOptions()).toEqual({
      host: 'http://remote:11434',
      headers: undefined,
    })
  })

  it('embedding adapter stores the defaults and keeps them out of the client', () => {
    const adapter = createOllamaEmbedding('nomic-embed-text', {
      host: 'http://remote:11434',
      defaultModelOptions: { truncate: false },
    })

    expect(adapter.defaultModelOptions).toEqual({ truncate: false })
    expect(sdkClientOptions()).toEqual({
      host: 'http://remote:11434',
      headers: undefined,
    })
  })
})

describe('Ollama env-reading factories take defaultModelOptions', () => {
  it('ollamaText stores the defaults', () => {
    const adapter = ollamaText('llama3.2:latest', {
      defaultModelOptions: { keep_alive: '5m' },
    })

    expect(adapter.defaultModelOptions).toEqual({ keep_alive: '5m' })
  })

  it('ollamaEmbedding stores the defaults', () => {
    const adapter = ollamaEmbedding('nomic-embed-text', {
      defaultModelOptions: { truncate: false },
    })

    expect(adapter.defaultModelOptions).toEqual({ truncate: false })
  })

  it('ollamaSummarize exposes the defaults of its text adapter', () => {
    const adapter = ollamaSummarize('llama3.2:latest', {
      defaultModelOptions: { keep_alive: '5m' },
    })

    expect(adapter.defaultModelOptions).toEqual({ keep_alive: '5m' })
  })
})
