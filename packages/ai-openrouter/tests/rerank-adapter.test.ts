import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rerank } from '@tanstack/ai'
import { createOpenRouterRerank } from '../src/adapters/rerank'

// Mock the OpenRouter SDK so the adapter's `new OpenRouter().rerank.rerank()`
// call resolves to a controlled response. `vi.hoisted` lets the (hoisted)
// vi.mock factory reference the spy.
const { rerankFn } = vi.hoisted(() => ({ rerankFn: vi.fn() }))

vi.mock('@openrouter/sdk', () => ({
  // A class so `new OpenRouter(config)` is constructable; each instance exposes
  // the spied `rerank.rerank`.
  OpenRouter: class {
    rerank = { rerank: rerankFn }
  },
}))

beforeEach(() => {
  rerankFn.mockReset()
})

const documents = ['sunny day at the beach', 'rainy afternoon in the city']

/** A parsed SDK rerank response (camelCase, as the SDK returns it). */
function sdkResponse() {
  return {
    id: 'or-1',
    model: 'cohere/rerank-v3.5',
    results: [
      { document: { text: documents[1] }, index: 1, relevanceScore: 0.97 },
      { document: { text: documents[0] }, index: 0, relevanceScore: 0.1 },
    ],
    usage: { searchUnits: 1, cost: 0.002, totalTokens: 20 },
  }
}

const adapter = () => createOpenRouterRerank('cohere/rerank-v3.5', 'sk-or-test')

describe('OpenRouterRerankAdapter', () => {
  it('calls the SDK rerank with the request body and maps the response', async () => {
    rerankFn.mockResolvedValue(sdkResponse())

    const result = await rerank({
      adapter: adapter(),
      query: 'talk about rain',
      documents,
      topN: 2,
    })

    expect(rerankFn).toHaveBeenCalledTimes(1)
    expect(rerankFn.mock.calls[0]![0]).toEqual({
      requestBody: {
        model: 'cohere/rerank-v3.5',
        query: 'talk about rain',
        documents,
        topN: 2,
      },
    })
    expect(result.id).toBe('or-1')
    expect(result.ranking).toEqual([
      { index: 1, score: 0.97, document: documents[1] },
      { index: 0, score: 0.1, document: documents[0] },
    ])
  })

  it('maps SDK usage (searchUnits/cost/totalTokens)', async () => {
    rerankFn.mockResolvedValue(sdkResponse())

    const result = await rerank({ adapter: adapter(), query: 'q', documents })

    expect(result.usage.unitsBilled).toBe(1)
    expect(result.usage.cost).toBe(0.002)
    expect(result.usage.totalTokens).toBe(20)
  })

  it('works with a non-Cohere model slug', async () => {
    rerankFn.mockResolvedValue({ ...sdkResponse(), model: 'nvidia/llama-nemotron-rerank-vl-1b-v2' })

    await rerank({
      adapter: createOpenRouterRerank(
        'nvidia/llama-nemotron-rerank-vl-1b-v2',
        'sk-or-test',
      ),
      query: 'q',
      documents,
    })

    expect(rerankFn.mock.calls[0]![0].requestBody.model).toBe(
      'nvidia/llama-nemotron-rerank-vl-1b-v2',
    )
  })

  it('forwards provider routing preferences into the request body', async () => {
    rerankFn.mockResolvedValue(sdkResponse())

    await rerank({
      adapter: adapter(),
      query: 'q',
      documents,
      modelOptions: { provider: { order: ['cohere'] } },
    })

    expect(rerankFn.mock.calls[0]![0].requestBody.provider).toEqual({
      order: ['cohere'],
    })
  })

  it('forwards the abort signal via fetchOptions', async () => {
    rerankFn.mockResolvedValue(sdkResponse())
    const controller = new AbortController()

    await rerank({
      adapter: adapter(),
      query: 'q',
      documents,
      abortSignal: controller.signal,
    })

    expect(rerankFn.mock.calls[0]![1]).toEqual({
      fetchOptions: { signal: controller.signal },
    })
  })

  it('throws when the SDK returns a bare string response', async () => {
    rerankFn.mockResolvedValue('error: bad request')

    await expect(
      rerank({ adapter: adapter(), query: 'q', documents, debug: false }),
    ).rejects.toThrow('unexpected response')
  })
})
