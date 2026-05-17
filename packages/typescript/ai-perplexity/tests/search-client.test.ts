import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PerplexitySearchClient } from '../src/search/client'

describe('PerplexitySearchClient', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    process.env.PERPLEXITY_API_KEY = 'test-key'
    delete process.env.PPLX_API_KEY
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
  })

  function makeFetchMock(payload: unknown, status = 200) {
    return vi.fn(async (_url: string, _init: RequestInit) => {
      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    })
  }

  it('POSTs to /search with bearer auth and JSON body', async () => {
    const fetchMock = makeFetchMock({
      id: 'q1',
      results: [
        {
          title: 'Example',
          url: 'https://example.com',
          snippet: 'Hello world',
          date: '2024-01-15',
        },
      ],
    })

    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    const res = await client.search({ query: 'mars rover', max_results: 3 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.perplexity.ai/search')
    expect((init as RequestInit).method).toBe('POST')

    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-key')
    expect(headers['Content-Type']).toBe('application/json')

    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      query: 'mars rover',
      max_results: 3,
    })

    expect(res.id).toBe('q1')
    expect(res.results).toHaveLength(1)
    expect(res.results[0]).toEqual({
      title: 'Example',
      url: 'https://example.com',
      snippet: 'Hello world',
      date: '2024-01-15',
    })
  })

  it('falls back to env when explicit apiKey is blank', async () => {
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({
      apiKey: '   ',
      fetch: fetchMock as any,
    })

    await client.search({ query: 'q' })

    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-key')
  })

  it('forwards optional filters in the request body', async () => {
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })

    await client.search({
      query: 'climate',
      max_results: 5,
      max_tokens_per_page: 512,
      search_domain_filter: ['nytimes.com', 'reuters.com'],
      search_recency_filter: 'month',
      search_after_date_filter: '1/1/2025',
      search_before_date_filter: '12/31/2025',
    })

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body).toEqual({
      query: 'climate',
      max_results: 5,
      max_tokens_per_page: 512,
      search_domain_filter: ['nytimes.com', 'reuters.com'],
      search_recency_filter: 'month',
      search_after_date_filter: '1/1/2025',
      search_before_date_filter: '12/31/2025',
    })
  })

  it('rejects mixing allow + deny entries in search_domain_filter', async () => {
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })

    await expect(
      client.search({
        query: 'x',
        search_domain_filter: ['nytimes.com', '-pinterest.com'],
      }),
    ).rejects.toThrow(/cannot mix allowlist and denylist/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when query is missing', async () => {
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    await expect(
      client.search({ query: '' as unknown as string }),
    ).rejects.toThrow(/non-empty `query`/i)
  })

  it('throws when query is whitespace only', async () => {
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    await expect(client.search({ query: '   ' })).rejects.toThrow(
      /non-empty `query`/i,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('trims query and clamps max_results before forwarding', async () => {
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    await client.search({ query: '  mars rover  ', max_results: 99 })

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body).toEqual({
      query: 'mars rover',
      max_results: 20,
    })
  })

  it('clamps max_results to the minimum before forwarding', async () => {
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    await client.search({ query: 'q', max_results: 0 })

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.max_results).toBe(1)
  })

  it('falls back to PPLX_API_KEY when PERPLEXITY_API_KEY is not set', async () => {
    delete process.env.PERPLEXITY_API_KEY
    process.env.PPLX_API_KEY = 'fallback-key'
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    await client.search({ query: 'q' })
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer fallback-key')
  })

  it('ignores whitespace-only PERPLEXITY_API_KEY when PPLX_API_KEY is set', async () => {
    process.env.PERPLEXITY_API_KEY = '   '
    process.env.PPLX_API_KEY = 'fallback-key'
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    await client.search({ query: 'q' })
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer fallback-key')
  })

  it('throws if neither env var is set and no apiKey is passed', () => {
    delete process.env.PERPLEXITY_API_KEY
    delete process.env.PPLX_API_KEY
    expect(
      () => new PerplexitySearchClient({ fetch: vi.fn() as any }),
    ).toThrow(/PERPLEXITY_API_KEY/)
  })

  it('surfaces non-2xx responses as errors', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('rate limited', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
    )
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    await expect(client.search({ query: 'x' })).rejects.toThrow(
      /429.*Too Many Requests.*rate limited/,
    )
  })

  it('omits date when API does not return one', async () => {
    const fetchMock = makeFetchMock({
      results: [{ title: 't', url: 'u', snippet: 's' }],
    })
    const client = new PerplexitySearchClient({ fetch: fetchMock as any })
    const res = await client.search({ query: 'q' })
    expect(res.results[0]).toEqual({ title: 't', url: 'u', snippet: 's' })
    expect('date' in res.results[0]!).toBe(false)
  })

  it('respects a custom baseURL', async () => {
    const fetchMock = makeFetchMock({ results: [] })
    const client = new PerplexitySearchClient({
      apiKey: 'k',
      baseURL: 'https://example.com/api/',
      fetch: fetchMock as any,
    })
    await client.search({ query: 'q' })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://example.com/api/search')
  })
})
