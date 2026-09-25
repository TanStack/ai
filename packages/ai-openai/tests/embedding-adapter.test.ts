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
