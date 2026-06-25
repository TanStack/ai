import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rerank } from '@tanstack/ai'
import { createCohereRerank } from '../src/adapters/rerank'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A 200 response carrying a Cohere-shaped rerank body. */
function cohereResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Default well-formed Cohere rerank payload reordering [1, 0]. */
function defaultBody() {
  return {
    id: 'cohere-1',
    results: [
      { index: 1, relevance_score: 0.98 },
      { index: 0, relevance_score: 0.12 },
    ],
    meta: { billed_units: { search_units: 1 } },
  }
}

/** The parsed request body of the most recent fetch call. */
function lastRequestBody() {
  const init = fetchMock.mock.calls[0]![1]
  return JSON.parse(String(init?.body))
}

const adapter = () => createCohereRerank('rerank-v3.5', 'test-key')
const documents = ['sunny day at the beach', 'rainy afternoon in the city']

describe('CohereRerankAdapter', () => {
  it('POSTs to /v2/rerank with auth and the expected request body', async () => {
    fetchMock.mockResolvedValue(cohereResponse(defaultBody()))

    await rerank({
      adapter: adapter(),
      query: 'talk about rain',
      documents,
      topN: 2,
      modelOptions: { maxTokensPerDoc: 512 },
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.cohere.com/v2/rerank')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer test-key',
    )
    expect(lastRequestBody()).toEqual({
      model: 'rerank-v3.5',
      query: 'talk about rain',
      documents,
      top_n: 2,
      max_tokens_per_doc: 512,
    })
  })

  it('maps results to ranking and search_units to usage.unitsBilled', async () => {
    fetchMock.mockResolvedValue(cohereResponse(defaultBody()))

    const result = await rerank({
      adapter: adapter(),
      query: 'talk about rain',
      documents,
    })

    expect(result.id).toBe('cohere-1')
    expect(result.ranking).toEqual([
      { index: 1, score: 0.98, document: documents[1] },
      { index: 0, score: 0.12, document: documents[0] },
    ])
    expect(result.usage.unitsBilled).toBe(1)
    expect(result.usage.totalTokens).toBe(0)
  })

  it('omits top_n and max_tokens_per_doc when not provided', async () => {
    fetchMock.mockResolvedValue(cohereResponse(defaultBody()))

    await rerank({ adapter: adapter(), query: 'q', documents })

    expect(lastRequestBody()).toEqual({
      model: 'rerank-v3.5',
      query: 'q',
      documents,
    })
  })

  it('throws with status detail on a non-200 response', async () => {
    fetchMock.mockResolvedValue(
      new Response('rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
      }),
    )

    await expect(
      rerank({ adapter: adapter(), query: 'q', documents, debug: false }),
    ).rejects.toThrow('429')
  })

  it('throws when the response shape is unexpected', async () => {
    fetchMock.mockResolvedValue(cohereResponse({ nope: true }))

    await expect(
      rerank({ adapter: adapter(), query: 'q', documents, debug: false }),
    ).rejects.toThrow('unexpected shape')
  })

  it('forwards the abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(cohereResponse(defaultBody()))
    const controller = new AbortController()

    await rerank({
      adapter: adapter(),
      query: 'q',
      documents,
      abortSignal: controller.signal,
    })

    expect(fetchMock.mock.calls[0]![1]?.signal).toBe(controller.signal)
  })
})
