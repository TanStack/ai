import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  OllamaEmbeddingAdapter,
  createOllamaEmbedding,
  ollamaEmbedding,
} from '../src/adapters/embedding'
import type { Mock } from 'vitest'

const testLogger = resolveDebugOption(false)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedMock: Mock<(...args: Array<any>) => any>
let ollamaConstructorCalls: Array<{ host?: string } | undefined>

vi.mock('ollama', () => {
  class Ollama {
    embed: (...args: Array<unknown>) => unknown
    constructor(config?: { host?: string }) {
      ollamaConstructorCalls.push(config)
      this.embed = (...args) => embedMock(...args)
    }
  }
  return { Ollama }
})

function mockResponse(vectors: Array<Array<number>>, promptEvalCount?: number) {
  return {
    model: 'nomic-embed-text',
    embeddings: vectors,
    total_duration: 1000,
    load_duration: 100,
    ...(promptEvalCount !== undefined && {
      prompt_eval_count: promptEvalCount,
    }),
  }
}

beforeEach(() => {
  embedMock = vi.fn()
  ollamaConstructorCalls = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('OllamaEmbeddingAdapter construction', () => {
  it('createOllamaEmbedding wires kind=embedding, name=ollama, and the given model', () => {
    const adapter = createOllamaEmbedding('nomic-embed-text')
    expect(adapter).toBeInstanceOf(OllamaEmbeddingAdapter)
    expect(adapter.kind).toBe('embedding')
    expect(adapter.name).toBe('ollama')
    expect(adapter.model).toBe('nomic-embed-text')
  })

  it('createOllamaEmbedding accepts a string host', () => {
    const adapter = createOllamaEmbedding(
      'nomic-embed-text',
      'http://remote:11434',
    )
    expect(adapter).toBeInstanceOf(OllamaEmbeddingAdapter)
    expect(ollamaConstructorCalls).toContainEqual(
      expect.objectContaining({ host: 'http://remote:11434' }),
    )
  })

  it('createOllamaEmbedding accepts a config object', () => {
    const adapter = createOllamaEmbedding('mxbai-embed-large', {
      host: 'http://remote:11434',
      headers: { Authorization: 'Bearer x' },
    })
    expect(adapter).toBeInstanceOf(OllamaEmbeddingAdapter)
    expect(adapter.model).toBe('mxbai-embed-large')
  })

  it('ollamaEmbedding reads OLLAMA_HOST from env and forwards it to the Ollama client', () => {
    vi.stubEnv('OLLAMA_HOST', 'http://from-env:11434')
    const adapter = ollamaEmbedding('nomic-embed-text')
    expect(adapter.model).toBe('nomic-embed-text')
    expect(ollamaConstructorCalls).toContainEqual(
      expect.objectContaining({ host: 'http://from-env:11434' }),
    )
  })
})

describe('OllamaEmbeddingAdapter.createEmbeddings', () => {
  it('sends texts as a single batch and maps vectors with indices', async () => {
    embedMock.mockResolvedValueOnce(
      mockResponse(
        [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        7,
      ),
    )

    const adapter = createOllamaEmbedding('nomic-embed-text')
    const result = await adapter.createEmbeddings({
      model: 'nomic-embed-text',
      input: ['a red guitar', { type: 'text', content: 'a blue drum kit' }],
      logger: testLogger,
    })

    expect(embedMock).toHaveBeenCalledTimes(1)
    expect(embedMock).toHaveBeenCalledWith({
      model: 'nomic-embed-text',
      input: ['a red guitar', 'a blue drum kit'],
    })
    expect(result.model).toBe('nomic-embed-text')
    expect(result.id).toContain('ollama')
    expect(result.embeddings).toEqual([
      { vector: [0.1, 0.2], index: 0 },
      { vector: [0.3, 0.4], index: 1 },
    ])
  })

  it('maps provider options to the SDK request (keepAlive -> keep_alive)', async () => {
    embedMock.mockResolvedValueOnce(mockResponse([[0.1]], 3))

    const adapter = createOllamaEmbedding('nomic-embed-text')
    await adapter.createEmbeddings({
      model: 'nomic-embed-text',
      input: ['hello'],
      modelOptions: {
        truncate: true,
        keepAlive: '5m',
        options: { num_gpu: 1 },
      },
      logger: testLogger,
    })

    expect(embedMock).toHaveBeenCalledWith({
      model: 'nomic-embed-text',
      input: ['hello'],
      truncate: true,
      keep_alive: '5m',
      options: { num_gpu: 1 },
    })
  })

  it('omits unset provider options from the request entirely', async () => {
    embedMock.mockResolvedValueOnce(mockResponse([[0.1]], 3))

    const adapter = createOllamaEmbedding('nomic-embed-text')
    await adapter.createEmbeddings({
      model: 'nomic-embed-text',
      input: ['hello'],
      logger: testLogger,
    })

    const request = embedMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(request).not.toHaveProperty('truncate')
    expect(request).not.toHaveProperty('keep_alive')
    expect(request).not.toHaveProperty('options')
  })

  it('throws a clear error when dimensions is requested', async () => {
    const adapter = createOllamaEmbedding('nomic-embed-text')

    await expect(
      adapter.createEmbeddings({
        model: 'nomic-embed-text',
        input: ['hello'],
        dimensions: 256,
        logger: testLogger,
      }),
    ).rejects.toThrow('Ollama does not support requesting embedding dimensions')
    expect(embedMock).not.toHaveBeenCalled()
  })

  it('includes usage when prompt_eval_count is present', async () => {
    embedMock.mockResolvedValueOnce(mockResponse([[0.1]], 9))

    const adapter = createOllamaEmbedding('nomic-embed-text')
    const result = await adapter.createEmbeddings({
      model: 'nomic-embed-text',
      input: ['hello'],
      logger: testLogger,
    })

    expect(result.usage).toEqual({
      promptTokens: 9,
      completionTokens: 0,
      totalTokens: 9,
    })
  })

  it('omits usage when prompt_eval_count is absent', async () => {
    embedMock.mockResolvedValueOnce(mockResponse([[0.1]]))

    const adapter = createOllamaEmbedding('nomic-embed-text')
    const result = await adapter.createEmbeddings({
      model: 'nomic-embed-text',
      input: ['hello'],
      logger: testLogger,
    })

    expect(result.usage).toBeUndefined()
    expect(result).not.toHaveProperty('usage')
  })

  it('throws a clear error for image input without calling the client', async () => {
    const adapter = createOllamaEmbedding('nomic-embed-text')

    await expect(
      adapter.createEmbeddings({
        model: 'nomic-embed-text',
        input: [
          {
            type: 'image',
            source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
          },
        ],
        logger: testLogger,
      }),
    ).rejects.toThrow('only supports text embedding inputs')
    expect(embedMock).not.toHaveBeenCalled()
  })
})
