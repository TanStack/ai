import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PerplexitySearchClient } from '../src/search/client'
import {
  firstFetchBody,
  firstFetchCall,
  firstFetchHeaders,
  mockFetch,
} from './test-utils'

const INTEGRATION_HEADER = 'X-Pplx-Integration'

describe('PerplexitySearchClient', () => {
  beforeEach(() => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key')
    vi.stubEnv('PPLX_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('POSTs to /search with bearer auth and JSON body', async () => {
    const fetchMock = mockFetch({
      id: 'q1',
      results: [
        {
          title: 'Example',
          url: 'https://example.com',
          snippet: 'Hello world',
          date: '2024-01-15',
          last_updated: '2024-01-16',
        },
      ],
    })

    const client = new PerplexitySearchClient({ fetch: fetchMock })
    const res = await client.search({ query: 'mars rover', max_results: 3 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init } = firstFetchCall(fetchMock)
    expect(url).toBe('https://api.perplexity.ai/search')
    expect(init.method).toBe('POST')

    const headers = firstFetchHeaders(fetchMock)
    expect(headers.Authorization).toBe('Bearer test-key')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers[INTEGRATION_HEADER]).toMatch(/^tanstack\//)

    expect(firstFetchBody(fetchMock)).toEqual({
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
      last_updated: '2024-01-16',
    })
  })

  it('falls back to env when explicit apiKey is blank', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({
      apiKey: '   ',
      fetch: fetchMock,
    })

    await client.search({ query: 'q' })
    expect(firstFetchHeaders(fetchMock).Authorization).toBe('Bearer test-key')
  })

  it('forwards optional filters in the request body', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })

    await client.search({
      query: 'climate',
      max_results: 5,
      max_tokens_per_page: 512,
      search_domain_filter: ['nytimes.com', 'reuters.com'],
      search_recency_filter: 'month',
      search_after_date_filter: '1/1/2025',
      search_before_date_filter: '12/31/2025',
    })

    expect(firstFetchBody(fetchMock)).toEqual({
      query: 'climate',
      max_results: 5,
      max_tokens_per_page: 512,
      search_domain_filter: ['nytimes.com', 'reuters.com'],
      search_recency_filter: 'month',
      search_after_date_filter: '1/1/2025',
      search_before_date_filter: '12/31/2025',
    })
  })

  it('forwards a query array', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await client.search({ query: ['  mars rover  ', 'perseverance'] })
    expect(firstFetchBody(fetchMock).query).toEqual([
      'mars rover',
      'perseverance',
    ])
  })

  it('rejects more than 5 queries', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await expect(
      client.search({
        query: ['a', 'b', 'c', 'd', 'e', 'f'],
      }),
    ).rejects.toThrow(/at most 5/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects mixing allow + deny entries in search_domain_filter', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })

    await expect(
      client.search({
        query: 'x',
        search_domain_filter: ['nytimes.com', '-pinterest.com'],
      }),
    ).rejects.toThrow(/cannot mix allowlist and denylist/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects more than 20 domain filter entries', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await expect(
      client.search({
        query: 'x',
        search_domain_filter: Array.from({ length: 21 }, (_, i) => `ex${i}.com`),
      }),
    ).rejects.toThrow(/at most 20/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when query is missing', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await expect(client.search({ query: '' })).rejects.toThrow(
      /non-empty `query`/i,
    )
  })

  it('throws when query is whitespace only', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await expect(client.search({ query: '   ' })).rejects.toThrow(
      /non-empty `query`/i,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('trims query before forwarding', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await client.search({ query: '  mars rover  ', max_results: 5 })

    expect(firstFetchBody(fetchMock)).toEqual({
      query: 'mars rover',
      max_results: 5,
    })
  })

  it('throws when max_results is outside 1–20', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await expect(client.search({ query: 'q', max_results: 99 })).rejects.toThrow(
      /integer between 1 and 20/,
    )
    await expect(client.search({ query: 'q', max_results: 0 })).rejects.toThrow(
      /integer between 1 and 20/,
    )
    await expect(
      client.search({ query: 'q', max_results: 1.5 }),
    ).rejects.toThrow(/integer between 1 and 20/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to PPLX_API_KEY when PERPLEXITY_API_KEY is not set', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '')
    vi.stubEnv('PPLX_API_KEY', 'fallback-key')
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await client.search({ query: 'q' })
    expect(firstFetchHeaders(fetchMock).Authorization).toBe(
      'Bearer fallback-key',
    )
  })

  it('ignores whitespace-only PERPLEXITY_API_KEY when PPLX_API_KEY is set', async () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '   ')
    vi.stubEnv('PPLX_API_KEY', 'fallback-key')
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await client.search({ query: 'q' })
    expect(firstFetchHeaders(fetchMock).Authorization).toBe(
      'Bearer fallback-key',
    )
  })

  it('throws if neither env var is set and no apiKey is passed', () => {
    vi.stubEnv('PERPLEXITY_API_KEY', '')
    vi.stubEnv('PPLX_API_KEY', '')
    expect(
      () => new PerplexitySearchClient({ fetch: mockFetch({ results: [] }) }),
    ).toThrow(/PERPLEXITY_API_KEY/)
  })

  it('surfaces non-2xx responses as errors', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('rate limited', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
    )
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await expect(client.search({ query: 'x' })).rejects.toThrow(
      /429.*Too Many Requests.*rate limited/,
    )
  })

  it('throws when the response is not a search payload', async () => {
    const fetchMock = mockFetch({ results: null })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await expect(client.search({ query: 'q' })).rejects.toThrow(
      /invalid response/,
    )
  })

  it('throws when a result is missing required fields', async () => {
    const fetchMock = mockFetch({
      results: [{ url: 'https://example.com', snippet: 's' }],
    })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    await expect(client.search({ query: 'q' })).rejects.toThrow(
      /invalid response/,
    )
  })

  it('omits date and last_updated when the API does not return them', async () => {
    const fetchMock = mockFetch({
      results: [{ title: 't', url: 'u', snippet: 's' }],
    })
    const client = new PerplexitySearchClient({ fetch: fetchMock })
    const res = await client.search({ query: 'q' })
    expect(res.results[0]).toEqual({ title: 't', url: 'u', snippet: 's' })
    expect(res.results[0] && 'date' in res.results[0]).toBe(false)
    expect(res.results[0] && 'last_updated' in res.results[0]).toBe(false)
  })

  it('forwards AbortSignal to fetch', async () => {
    const abortController = new AbortController()
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({ apiKey: 'k', fetch: fetchMock })
    await client.search({ query: 'q' }, { signal: abortController.signal })
    expect(firstFetchCall(fetchMock).init.signal).toBe(abortController.signal)
  })

  it('respects a custom baseURL', async () => {
    const fetchMock = mockFetch({ results: [] })
    const client = new PerplexitySearchClient({
      apiKey: 'k',
      baseURL: 'https://example.com/api/',
      fetch: fetchMock,
    })
    await client.search({ query: 'q' })
    expect(firstFetchCall(fetchMock).url).toBe(
      'https://example.com/api/search',
    )
  })
})
