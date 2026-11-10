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
      // The Gemini Developer API does not report embedding token usage.
      expect(result.usage).toBeUndefined()
    })

    it('splits inputs over the 100-per-request limit into sequential requests', async () => {
      const adapter = new TestGeminiEmbeddingAdapter(
        { apiKey: 'test' },
        'gemini-embedding-001',
      )
      const spy = adapter.spyOnEmbedContent()
      // Like the Gemini API, reject any request with more than 100 contents.
      spy.mockImplementation(({ contents }) => {
        const items = Array.isArray(contents) ? contents : [contents]
        if (items.length > 100) {
          return Promise.reject(new Error('at most 100 requests per batch'))
        }
        return Promise.resolve(
          mockResponse(items.map((text) => [Number(String(text).slice(1))])),
        )
      })

      const input = Array.from({ length: 201 }, (_, i) => `t${i}`)
      const result = await adapter.createEmbeddings({
        model: 'gemini-embedding-001',
        input,
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledTimes(3)
      expect(
        spy.mock.calls.map(([args]) => (args.contents as Array<string>).length),
      ).toEqual([100, 100, 1])
      expect(result.embeddings).toHaveLength(201)
      expect(result.embeddings.map((e) => e.index)).toEqual(
        input.map((_, i) => i),
      )
      expect(result.embeddings.map((e) => e.vector[0])).toEqual(
        input.map((_, i) => i),
      )
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

    it('reports Vertex token statistics and billable characters as usage', async () => {
      const adapter = new TestGeminiEmbeddingAdapter(
        { apiKey: 'test' },
        'gemini-embedding-001',
      )
      adapter.spyOnEmbedContent().mockResolvedValue({
        embeddings: [
          { values: [0.1], statistics: { tokenCount: 3 } },
          { values: [0.2], statistics: { tokenCount: 4 } },
        ],
        metadata: { billableCharacterCount: 25 },
      })

      const result = await adapter.createEmbeddings({
        model: 'gemini-embedding-001',
        input: ['a red guitar', 'a blue drum kit'],
        logger: testLogger,
      })

      expect(result.usage).toEqual({
        promptTokens: 7,
        completionTokens: 0,
        totalTokens: 7,
        billed: { quantity: 25, unit: 'characters' },
      })
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
