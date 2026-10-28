import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  MistralEmbeddingAdapter,
  createMistralEmbedding,
} from '../src/adapters/embedding'
import type { EmbeddingResponse } from '@mistralai/mistralai/models/components'
import type { MistralEmbeddingModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

/**
 * Test-only subclass exposing the SDK client's `embeddings.create` to
 * `vi.spyOn` — same pattern as the OpenAI embedding adapter tests, keeping
 * every type real with no casts.
 */
class TestMistralEmbeddingAdapter<
  TModel extends MistralEmbeddingModel,
> extends MistralEmbeddingAdapter<TModel> {
  spyOnEmbeddingsCreate() {
    return vi.spyOn(this.client.embeddings, 'create')
  }
}

function mockResponse(vectors: Array<Array<number>>): EmbeddingResponse {
  return {
    id: 'embd-test-123',
    object: 'list',
    model: 'mistral-embed',
    data: vectors.map((embedding, index) => ({
      object: 'embedding',
      embedding,
      index,
    })),
    usage: { promptTokens: 7, completionTokens: 0, totalTokens: 7 },
  }
}

describe('Mistral Embedding Adapter', () => {
  describe('createMistralEmbedding', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createMistralEmbedding('mistral-embed', 'test-api-key')
      expect(adapter).toBeInstanceOf(MistralEmbeddingAdapter)
      expect(adapter.kind).toBe('embedding')
      expect(adapter.name).toBe('mistral')
      expect(adapter.model).toBe('mistral-embed')
    })
  })

  describe('createEmbeddings', () => {
    it('sends texts as a batch and maps vectors and usage', async () => {
      const adapter = new TestMistralEmbeddingAdapter(
        { apiKey: 'test' },
        'mistral-embed',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      spy.mockResolvedValue(
        mockResponse([
          [0.1, 0.2],
          [0.3, 0.4],
        ]),
      )

      const result = await adapter.createEmbeddings({
        model: 'mistral-embed',
        input: ['a red guitar', { type: 'text', content: 'a blue drum kit' }],
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith({
        model: 'mistral-embed',
        inputs: ['a red guitar', 'a blue drum kit'],
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
      expect(result.model).toBe('mistral-embed')
    })

    it('maps the top-level dimensions option to outputDimension for codestral-embed', async () => {
      const adapter = new TestMistralEmbeddingAdapter(
        { apiKey: 'test' },
        'codestral-embed',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      spy.mockResolvedValue(mockResponse([[0.1]]))

      await adapter.createEmbeddings({
        model: 'codestral-embed',
        input: ['hello'],
        dimensions: 256,
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ outputDimension: 256 }),
      )
    })

    it('throws a clear error when dimensions is set for mistral-embed', async () => {
      const adapter = new TestMistralEmbeddingAdapter(
        { apiKey: 'test' },
        'mistral-embed',
      )
      const spy = adapter.spyOnEmbeddingsCreate()

      await expect(
        adapter.createEmbeddings({
          model: 'mistral-embed',
          input: ['hello'],
          dimensions: 512,
          logger: testLogger,
        }),
      ).rejects.toThrow('mistral-embed does not support requesting dimensions')
      expect(spy).not.toHaveBeenCalled()
    })

    it('passes provider options through without letting them override model/inputs', async () => {
      const adapter = new TestMistralEmbeddingAdapter(
        { apiKey: 'test' },
        'codestral-embed',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      spy.mockResolvedValue(mockResponse([[0.1]]))

      await adapter.createEmbeddings({
        model: 'codestral-embed',
        input: ['hello'],
        modelOptions: { outputDtype: 'int8' },
        logger: testLogger,
      })

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          outputDtype: 'int8',
          model: 'codestral-embed',
          inputs: ['hello'],
        }),
      )
    })

    it('uses the response index when present and array order when absent', async () => {
      const adapter = new TestMistralEmbeddingAdapter(
        { apiKey: 'test' },
        'mistral-embed',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      spy.mockResolvedValue({
        id: 'embd-test-456',
        object: 'list',
        model: 'mistral-embed',
        data: [
          { object: 'embedding', embedding: [0.3, 0.4], index: 1 },
          { object: 'embedding', embedding: [0.1, 0.2], index: 0 },
          { object: 'embedding', embedding: [0.5, 0.6] },
        ],
        usage: { promptTokens: 3, completionTokens: 0, totalTokens: 3 },
      })

      const result = await adapter.createEmbeddings({
        model: 'mistral-embed',
        input: ['one', 'two', 'three'],
        logger: testLogger,
      })

      expect(result.embeddings).toEqual([
        { vector: [0.3, 0.4], index: 1 },
        { vector: [0.1, 0.2], index: 0 },
        { vector: [0.5, 0.6], index: 2 },
      ])
    })

    it('defaults usage token counts to zero when the API omits them', async () => {
      const adapter = new TestMistralEmbeddingAdapter(
        { apiKey: 'test' },
        'mistral-embed',
      )
      const spy = adapter.spyOnEmbeddingsCreate()
      spy.mockResolvedValue({
        id: 'embd-test-789',
        object: 'list',
        model: 'mistral-embed',
        data: [{ object: 'embedding', embedding: [0.1], index: 0 }],
        usage: {},
      })

      const result = await adapter.createEmbeddings({
        model: 'mistral-embed',
        input: ['hello'],
        logger: testLogger,
      })

      expect(result.usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      })
    })

    it('throws a clear error for image input', async () => {
      const adapter = new TestMistralEmbeddingAdapter(
        { apiKey: 'test' },
        'mistral-embed',
      )
      const spy = adapter.spyOnEmbeddingsCreate()

      await expect(
        adapter.createEmbeddings({
          model: 'mistral-embed',
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
