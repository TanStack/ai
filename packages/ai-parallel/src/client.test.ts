import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParallelSearchClient } from './client'
import { fetchCall, mockFetch, searchResponse } from '../tests/test-utils'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('ParallelSearchClient', () => {
  it('calls the GA endpoint with API-key authentication and required queries', async () => {
    const fetchMock = mockFetch(
      searchResponse([
        {
          url: 'https://example.com/article',
          title: 'Example article',
          excerpts: ['The cited evidence.'],
          publish_date: '2026-08-20',
        },
      ]),
    )
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })
    const searchQueries = ['  recent research  '] as const

    const response = await client.search({
      search_queries: searchQueries,
      objective: 'Find current research.',
      mode: 'fast',
      advanced_settings: {
        max_results: 3,
        source_policy: { include_domains: ['example.com'] },
      },
    })

    expect(fetchCall(fetchMock).url).toBe('https://api.parallel.ai/v1/search')
    const headers = new Headers(fetchCall(fetchMock).init.headers)
    expect(headers.get('x-api-key')).toBe('test-key')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Accept')).toBe('application/json')
    expect(searchQueries).toEqual(['  recent research  '])
    expect(fetchCall(fetchMock).body).toEqual({
      search_queries: ['recent research'],
      objective: 'Find current research.',
      mode: 'fast',
      advanced_settings: {
        max_results: 3,
        source_policy: { include_domains: ['example.com'] },
      },
    })
    expect(response).toEqual(
      searchResponse([
        {
          url: 'https://example.com/article',
          title: 'Example article',
          excerpts: ['The cited evidence.'],
          publish_date: '2026-08-20',
        },
      ]),
    )
  })

  it('falls back to the trimmed environment key for blank explicit credentials', async () => {
    vi.stubEnv('PARALLEL_API_KEY', '  environment-key  ')
    const fetchMock = mockFetch(searchResponse())
    const client = new ParallelSearchClient({ apiKey: '  ', fetch: fetchMock })

    await client.search({ search_queries: ['news'] })

    expect(
      new Headers(fetchCall(fetchMock).init.headers).get('x-api-key'),
    ).toBe('environment-key')
  })

  it('rejects missing API keys without issuing a request', () => {
    vi.stubEnv('PARALLEL_API_KEY', '')
    const fetchMock = mockFetch(searchResponse())

    expect(() => new ParallelSearchClient({ fetch: fetchMock })).toThrow(
      /PARALLEL_API_KEY/,
    )
    expect(
      () => new ParallelSearchClient({ apiKey: '  ', fetch: fetchMock }),
    ).toThrow(/PARALLEL_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects missing and blank search queries before issuing a request', async () => {
    const fetchMock = mockFetch(searchResponse())
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    await expect(client.search({ search_queries: [] })).rejects.toThrow(
      /non-empty search query/,
    )
    await expect(client.search({ search_queries: ['  '] })).rejects.toThrow(
      /non-empty search query/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid result limits before issuing a request', async () => {
    const fetchMock = mockFetch(searchResponse())
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    await expect(
      client.search({
        search_queries: ['news'],
        advanced_settings: { max_results: 0 },
      }),
    ).rejects.toThrow(/positive integer/)
    await expect(
      client.search({
        search_queries: ['news'],
        advanced_settings: { max_results: 1.5 },
      }),
    ).rejects.toThrow(/positive integer/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects more than 200 source-policy domains', async () => {
    const fetchMock = mockFetch(searchResponse())
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    await expect(
      client.search({
        search_queries: ['news'],
        advanced_settings: {
          source_policy: {
            include_domains: Array.from(
              { length: 200 },
              (_, index) => `source-${index}.test`,
            ),
            exclude_domains: ['excluded.test'],
          },
        },
      }),
    ).rejects.toThrow(/at most 200 domains/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces HTTP failures without dropping the response details', async () => {
    const fetchMock = mockFetch(
      { error: { message: 'Rate limited.' } },
      429,
      'Too Many Requests',
    )
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    await expect(client.search({ search_queries: ['news'] })).rejects.toThrow(
      /429.*Rate limited/,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed response payloads', async () => {
    const fetchMock = mockFetch({
      ...searchResponse(),
      results: [{ url: 'https://example.com', excerpts: 'not-an-array' }],
    })
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    await expect(client.search({ search_queries: ['news'] })).rejects.toThrow(
      /invalid response/,
    )
  })

  it('omits nullable optional citation fields', async () => {
    const fetchMock = mockFetch(
      searchResponse([
        {
          url: 'https://example.com',
          excerpts: ['Evidence'],
          title: null,
          publish_date: null,
        },
      ]),
    )
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    const response = await client.search({ search_queries: ['news'] })

    expect(response.results).toEqual([
      { url: 'https://example.com', excerpts: ['Evidence'] },
    ])
  })

  it('preserves SDK usage and warning metadata', async () => {
    const response = {
      ...searchResponse(),
      usage: [{ count: 1, name: 'search' }],
      warnings: [
        {
          type: 'input_validation_warning',
          message: 'One source was excluded.',
        },
      ],
    }
    const fetchMock = mockFetch(response)
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    await expect(client.search({ search_queries: ['news'] })).resolves.toEqual(
      response,
    )
  })

  it('rejects an already cancelled search before issuing a request', async () => {
    const controller = new AbortController()
    const reason = new Error('Search was cancelled.')
    const fetchMock = mockFetch(searchResponse())
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    controller.abort(reason)

    await expect(
      client.search(
        { search_queries: ['news'] },
        { signal: controller.signal },
      ),
    ).rejects.toBe(reason)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects when cancellation interrupts an unfinished response body', async () => {
    const controller = new AbortController()
    const reason = new Error('Search was cancelled.')
    const fetchMock = vi.fn(async () => {
      const body = new ReadableStream({
        start(stream) {
          stream.enqueue(
            new TextEncoder().encode(
              '{"search_id":"search_test","session_id":"session_test","results":[',
            ),
          )
        },
      })

      return new Response(body, {
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      fetch: fetchMock,
    })
    const search = client.search(
      { search_queries: ['news'] },
      { signal: controller.signal },
    )

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    controller.abort(reason)

    const outcome = await Promise.race([
      search.then(
        () => 'fulfilled',
        (error: unknown) => error,
      ),
      new Promise((resolve) => setTimeout(() => resolve('still pending'), 0)),
    ])

    expect(outcome).toBe(reason)
  })

  it('forwards cancellation and honors custom base URLs', async () => {
    const controller = new AbortController()
    const fetchMock = mockFetch(searchResponse())
    const client = new ParallelSearchClient({
      apiKey: 'test-key',
      baseURL: 'https://proxy.example.com/',
      fetch: fetchMock,
    })

    await client.search(
      { search_queries: ['news'] },
      { signal: controller.signal },
    )

    expect(fetchCall(fetchMock).url).toBe('https://proxy.example.com/v1/search')
    const forwardedSignal = fetchCall(fetchMock).init.signal
    expect(forwardedSignal).toBeInstanceOf(AbortSignal)
    controller.abort()
    expect(forwardedSignal?.aborted).toBe(true)
  })
})
