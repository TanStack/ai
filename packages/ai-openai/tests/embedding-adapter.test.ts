import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  OpenAIEmbeddingAdapter,
  createOpenaiEmbedding,
} from '../src/adapters/embedding'
import type OpenAI from 'openai'
import type { OpenAIEmbeddingModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

/**
 * Test-only subclass exposing the SDK client's `embeddings.create` to
 * `vi.spyOn` — same pattern as `TestOpenAIImageAdapter`, keeping every type
 * real with no casts.
 */
class TestOpenAIEmbeddingAdapter<
  TModel extends OpenAIEmbeddingModel,
> extends OpenAIEmbeddingAdapter<TModel> {
  spyOnEmbeddingsCreate() {
    return vi.spyOn(this.client.embeddings, 'create')
  }
}

function mockResponse(
  vectors: Array<Array<number>>,
): OpenAI.CreateEmbeddingResponse {
  return {
    object: 'list',
    model: 'text-embedding-3-small',
    data: vectors.map((embedding, index) => ({
      object: 'embedding',
      embedding,
      index,
    })),
    usage: { prompt_tokens: 7, total_tokens: 7 },
  }
}

describe('OpenAI Embedding Adapter', () => {
  describe('createOpenaiEmbedding', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createOpenaiEmbedding(
        'text-embedding-3-small',
        'test-api-key',
      )
      expect(adapter).toBeInstanceOf(OpenAIEmbeddingAdapter)
      expect(adapter.kind).toBe('embedding')
      expect(adapter.name).toBe('openai')
      expect(adapter.model).toBe('text-embedding-3-small')
    })
  })

  describe('createEmbeddings', () => {
    it('sends texts as a batch with encoding_format float', async () => {
      const adapter = new TestOpenAIEmbeddingAdapter(
        { apiKey: 'test' },
        'text-embedding-3-small',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      spy.mockResolvedValue(
        mockResponse([
          [0.1, 0.2],
          [0.3, 0.4],
        ]),
      )

      const result = await adapter.createEmbeddings({
        model: 'text-embedding-3-small',
        input: ['a red guitar', { type: 'text', content: 'a blue drum kit' }],
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['a red guitar', 'a blue drum kit'],
        encoding_format: 'float',
      })
      expect(result.embeddings).toEqual([
        { vector: [0.1, 0.2], index: 0 },
        { vector: [0.3, 0.4], index: 1 },
      ])
      expect(result.usage).toEqual({
        promptTokens: 7,
        completionTokens: 0,
        totalTokens: 7,
      })
    })

    it('splits inputs over 2048 into batches and keeps order, indexes and usage', async () => {
      const adapter = new TestOpenAIEmbeddingAdapter(
        { apiKey: 'test' },
        'text-embedding-3-small',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      // Like the real API: reject any request with more than 2048 inputs.
      spy.mockImplementation((params) => {
        const input = params.input as Array<string>
        if (input.length > 2048) {
          return Promise.reject(
            new Error('400 max 2048 embedding inputs per request'),
          ) as never
        }
        return Promise.resolve(
          mockResponse(input.map((text) => [Number(text)])),
        ) as never
      })

      const texts = Array.from({ length: 5000 }, (_, i) => String(i))
      const result = await adapter.createEmbeddings({
        model: 'text-embedding-3-small',
        input: texts,
        logger: testLogger,
      })

      expect(spy.mock.calls.map(([params]) => params.input.length)).toEqual([
        2048, 2048, 904,
      ])
      expect(result.embeddings).toHaveLength(5000)
      expect(result.embeddings[2048]).toEqual({ vector: [2048], index: 2048 })
      expect(result.embeddings[4999]).toEqual({ vector: [4999], index: 4999 })
      expect(result.usage).toEqual({
        promptTokens: 21,
        completionTokens: 0,
        totalTokens: 21,
      })
    })

    it('passes the top-level dimensions option through', async () => {
      const adapter = new TestOpenAIEmbeddingAdapter(
        { apiKey: 'test' },
        'text-embedding-3-large',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      spy.mockResolvedValue(mockResponse([[0.1]]))

      await adapter.createEmbeddings({
        model: 'text-embedding-3-large',
        input: ['hello'],
        dimensions: 1024,
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ dimensions: 1024 }),
      )
    })

    it('passes provider options through without letting them override model/input', async () => {
      const adapter = new TestOpenAIEmbeddingAdapter(
        { apiKey: 'test' },
        'text-embedding-3-small',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      spy.mockResolvedValue(mockResponse([[0.1]]))

      await adapter.createEmbeddings({
        model: 'text-embedding-3-small',
        input: ['hello'],
        modelOptions: { user: 'user-123' },
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'user-123',
          model: 'text-embedding-3-small',
          input: ['hello'],
        }),
      )
    })

    it('throws a clear error for image input', async () => {
      const adapter = new TestOpenAIEmbeddingAdapter(
        { apiKey: 'test' },
        'text-embedding-3-small',
      )
      const spy = adapter.spyOnEmbeddingsCreate()

      await expect(
        adapter.createEmbeddings({
          model: 'text-embedding-3-small',
          input: [
            {
              type: 'image',
              source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow('only supports text embedding inputs')
      expect(spy).not.toHaveBeenCalled()
    })
  })
})
