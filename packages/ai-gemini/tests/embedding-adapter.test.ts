import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  GeminiEmbeddingAdapter,
  createGeminiEmbedding,
} from '../src/adapters/embedding'
import type { EmbedContentResponse } from '@google/genai'
import type { GeminiEmbeddingModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

/**
 * Test-only subclass exposing the SDK client's `models.embedContent` to
 * `vi.spyOn` — same pattern as the OpenAI embedding adapter tests, keeping
 * every type real with no casts.
 */
class TestGeminiEmbeddingAdapter<
  TModel extends GeminiEmbeddingModel,
> extends GeminiEmbeddingAdapter<TModel> {
  spyOnEmbedContent() {
    return vi.spyOn(this.client.models, 'embedContent')
  }
}

function mockResponse(vectors: Array<Array<number>>): EmbedContentResponse {
  return {
    embeddings: vectors.map((values) => ({ values })),
  }
}

describe('Gemini Embedding Adapter', () => {
  describe('createGeminiEmbedding', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createGeminiEmbedding(
        'gemini-embedding-001',
        'test-api-key',
      )
      expect(adapter).toBeInstanceOf(GeminiEmbeddingAdapter)
      expect(adapter.kind).toBe('embedding')
      expect(adapter.name).toBe('gemini')
      expect(adapter.model).toBe('gemini-embedding-001')
    })
  })

  describe('createEmbeddings', () => {
    it('sends texts as a batch and maps vectors with indices', async () => {
      const adapter = new TestGeminiEmbeddingAdapter(
        { apiKey: 'test' },
        'gemini-embedding-001',
      )
      const spy = adapter.spyOnEmbedContent()
      spy.mockResolvedValue(
        mockResponse([
          [0.1, 0.2],
          [0.3, 0.4],
        ]),
      )

      const result = await adapter.createEmbeddings({
        model: 'gemini-embedding-001',
        input: ['a red guitar', { type: 'text', content: 'a blue drum kit' }],
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith({
        model: 'gemini-embedding-001',
        contents: ['a red guitar', 'a blue drum kit'],
        config: {},
      })
      expect(result.embeddings).toEqual([
        { vector: [0.1, 0.2], index: 0 },
        { vector: [0.3, 0.4], index: 1 },
      ])
      expect(result.model).toBe('gemini-embedding-001')
      // The Gemini embedding API does not report token usage.
      expect(result.usage).toBeUndefined()
    })

    it('maps the top-level dimensions option to outputDimensionality', async () => {
      const adapter = new TestGeminiEmbeddingAdapter(
        { apiKey: 'test' },
        'gemini-embedding-001',
      )
      const spy = adapter.spyOnEmbedContent()
      spy.mockResolvedValue(mockResponse([[0.1]]))

      await adapter.createEmbeddings({
        model: 'gemini-embedding-001',
        input: ['hello'],
        dimensions: 1536,
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { outputDimensionality: 1536 },
        }),
      )
    })

    it('passes taskType and title provider options through the config', async () => {
      const adapter = new TestGeminiEmbeddingAdapter(
        { apiKey: 'test' },
        'gemini-embedding-001',
      )
      const spy = adapter.spyOnEmbedContent()
      spy.mockResolvedValue(mockResponse([[0.1]]))

      await adapter.createEmbeddings({
        model: 'gemini-embedding-001',
        input: ['hello'],
        modelOptions: {
          taskType: 'RETRIEVAL_DOCUMENT',
          title: 'Guitar catalog',
        },
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            taskType: 'RETRIEVAL_DOCUMENT',
            title: 'Guitar catalog',
          },
        }),
      )
    })

    it('throws a clear error when the response has no embeddings', async () => {
      const adapter = new TestGeminiEmbeddingAdapter(
        { apiKey: 'test' },
        'gemini-embedding-001',
      )
      const spy = adapter.spyOnEmbedContent()
      spy.mockResolvedValue({})

      await expect(
        adapter.createEmbeddings({
          model: 'gemini-embedding-001',
          input: ['hello'],
          logger: testLogger,
        }),
      ).rejects.toThrow('returned no embeddings for 1 inputs')
    })

    it('throws a clear error when embedding count mismatches input count', async () => {
      const adapter = new TestGeminiEmbeddingAdapter(
        { apiKey: 'test' },
        'gemini-embedding-001',
      )
      const spy = adapter.spyOnEmbedContent()
      spy.mockResolvedValue(mockResponse([[0.1]]))

      await expect(
        adapter.createEmbeddings({
          model: 'gemini-embedding-001',
          input: ['hello', 'world'],
          logger: testLogger,
        }),
      ).rejects.toThrow('returned 1 embeddings for 2 inputs')
    })

    it('throws a clear error for image input', async () => {
      const adapter = new TestGeminiEmbeddingAdapter(
        { apiKey: 'test' },
        'gemini-embedding-001',
      )
      const spy = adapter.spyOnEmbedContent()

      await expect(
        adapter.createEmbeddings({
          model: 'gemini-embedding-001',
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
