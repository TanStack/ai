import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  LovableEmbeddingAdapter,
  createLovableEmbedding,
} from '../src/adapters/embedding'
import type OpenAI from 'openai'
import type { LovableEmbeddingModel } from '../src/model-meta'

const testLogger = resolveDebugOption(false)

class TestLovableEmbeddingAdapter<
  TModel extends LovableEmbeddingModel,
> extends LovableEmbeddingAdapter<TModel> {
  spyOnEmbeddingsCreate() {
    return vi.spyOn(this.client.embeddings, 'create')
  }
}

function mockResponse(
  vectors: Array<Array<number>>,
): OpenAI.CreateEmbeddingResponse {
  return {
    object: 'list',
    model: 'openai/text-embedding-3-small',
    data: vectors.map((embedding, index) => ({
      object: 'embedding',
      embedding,
      index,
    })),
    usage: { prompt_tokens: 7, total_tokens: 7 },
  }
}

describe('Lovable embedding adapter', () => {
  it('creates an adapter with the provided API key', () => {
    const adapter = createLovableEmbedding(
      'openai/text-embedding-3-small',
      'test-api-key',
    )
    expect(adapter).toBeInstanceOf(LovableEmbeddingAdapter)
    expect(adapter.kind).toBe('embedding')
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('openai/text-embedding-3-small')
  })

  it('sends texts as a batch with encoding_format float', async () => {
    const adapter = new TestLovableEmbeddingAdapter(
      { apiKey: 'test' },
      'openai/text-embedding-3-small',
    )
    const spy = adapter.spyOnEmbeddingsCreate()
    spy.mockResolvedValue(
      mockResponse([
        [0.1, 0.2],
        [0.3, 0.4],
      ]),
    )

    const result = await adapter.createEmbeddings({
      model: 'openai/text-embedding-3-small',
      input: ['a red guitar', { type: 'text', content: 'a blue drum kit' }],
      logger: testLogger,
    })

    expect(spy).toHaveBeenCalledWith({
      model: 'openai/text-embedding-3-small',
      input: ['a red guitar', 'a blue drum kit'],
      encoding_format: 'float',
    })
    expect(result.embeddings).toEqual([
      { vector: [0.1, 0.2], index: 0 },
      { vector: [0.3, 0.4], index: 1 },
    ])
  })

  it('rejects image input', async () => {
    const adapter = createLovableEmbedding('openai/text-embedding-3-small', 'k')
    await expect(
      adapter.createEmbeddings({
        model: 'openai/text-embedding-3-small',
        input: [
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/a.png' },
          },
        ],
        logger: testLogger,
      }),
    ).rejects.toThrow()
  })
})
