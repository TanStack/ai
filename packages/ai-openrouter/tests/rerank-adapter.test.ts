import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rerank } from '@tanstack/ai'
import { createOpenRouterRerank } from '../src/adapters/rerank'

// Intercept at the network layer and drive the REAL @openrouter/sdk. This keeps
// the test free of module mocking (which is sensitive to runner/isolation
// differences) and exercises the SDK's real request building and response
// parsing.
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const documents = ['sunny day at the beach', 'rainy afternoon in the city']

/** A 200 response in the wire shape the SDK's zod schema parses. */
function rerankResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Default wire-format payload reordering documents [1, 0]. */
function wireBody() {
  return {
    id: 'or-1',
    model: 'cohere/rerank-v3.5',
    results: [
      { document: { text: documents[1] }, index: 1, relevance_score: 0.97 },
      { document: { text: documents[0] }, index: 0, relevance_score: 0.1 },
    ],
    usage: { search_units: 1, cost: 0.002, total_tokens: 20 },
  }
}

const adapter = () => createOpenRouterRerank('cohere/rerank-v3.5', 'sk-or-test')

/** The request the SDK handed to fetch, as { url, body }. */
async function capturedRequest() {
  const [input, init] = fetchMock.mock.calls[0]!
  // The SDK may call fetch with a Request object or (url, init).
  if (input instanceof Request) {
    return { url: input.url, body: await input.clone().json() }
  }
  return {
    url: String(input),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

describe('OpenRouterRerankAdapter', () => {
  it('hits the /rerank endpoint and maps the response', async () => {
    fetchMock.mockResolvedValue(rerankResponse(wireBody()))

    const result = await rerank({
      adapter: adapter(),
      query: 'talk about rain',
      documents,
      topN: 2,
    })

    const { url, body } = await capturedRequest()
    expect(url).toContain('/rerank')
    expect(body).toMatchObject({
      model: 'cohere/rerank-v3.5',
      query: 'talk about rain',
      documents,
      top_n: 2,
    })

    expect(result.id).toBe('or-1')
    expect(result.ranking).toEqual([
      { index: 1, score: 0.97, document: documents[1] },
      { index: 0, score: 0.1, document: documents[0] },
    ])
  })

  it('maps usage (search_units/cost/total_tokens)', async () => {
    fetchMock.mockResolvedValue(rerankResponse(wireBody()))

    const result = await rerank({ adapter: adapter(), query: 'q', documents })

    expect(result.usage.unitsBilled).toBe(1)
    expect(result.usage.cost).toBe(0.002)
    expect(result.usage.totalTokens).toBe(20)
  })

  it('works with a non-Cohere model slug', async () => {
    const model = 'nvidia/llama-nemotron-rerank-vl-1b-v2'
    fetchMock.mockResolvedValue(rerankResponse({ ...wireBody(), model }))

    await rerank({
      adapter: createOpenRouterRerank(model, 'sk-or-test'),
      query: 'q',
      documents,
    })

    const { body } = await capturedRequest()
    expect(body.model).toBe(model)
  })

  it('forwards provider routing preferences into the request body', async () => {
    fetchMock.mockResolvedValue(rerankResponse(wireBody()))

    await rerank({
      adapter: adapter(),
      query: 'q',
      documents,
      modelOptions: { provider: { order: ['cohere'] } },
    })

    const { body } = await capturedRequest()
    expect(body.provider).toEqual({ order: ['cohere'] })
  })

  it('rejects loudly on a malformed response body (SDK runtime validation)', async () => {
    // The SDK zod-validates the response, so a body missing `results` throws
    // before the adapter maps it — the caller never sees a silent bad result
    // or a cryptic `undefined.map` TypeError.
    fetchMock.mockResolvedValue(
      rerankResponse({ id: 'or-1', model: 'cohere/rerank-v3.5', usage: {} }),
    )

    await expect(
      rerank({ adapter: adapter(), query: 'q', documents, debug: false }),
    ).rejects.toThrow()
  })

  it('throws on a non-200 response', async () => {
    fetchMock.mockResolvedValue(
      new Response('bad request', { status: 400, statusText: 'Bad Request' }),
    )

    await expect(
      rerank({ adapter: adapter(), query: 'q', documents, debug: false }),
    ).rejects.toThrow()
  })
})
