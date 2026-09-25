import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { perplexitySearchTool } from '../src/search/tool'
import {
  firstFetchBody,
  firstFetchCall,
  firstFetchHeaders,
  mockFetch,
} from './test-utils'

const INTEGRATION_HEADER = 'X-Pplx-Integration'

const unusedContext = {
  emitCustomEvent: () => {},
}

describe('perplexitySearchTool', () => {
  beforeEach(() => {
    vi.stubEnv('PERPLEXITY_API_KEY', 'test-key')
    vi.stubEnv('PPLX_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('exposes a sensible default name, description, and schema', () => {
    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: mockFetch({ results: [] }),
    })
    expect(tool.name).toBe('perplexity_search')
    expect(tool.description).toMatch(/Perplexity Search API/i)
    expect(tool.description.toLowerCase()).not.toContain('sonar')
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()
  })

  it('executes the server tool against the mocked fetch', async () => {
    const fetchMock = mockFetch({
      results: [
        {
          title: 'A',
          url: 'https://a.test',
          snippet: 'snip',
          date: '2025-03-01',
          last_updated: '2025-03-02',
        },
        { title: 'B', url: 'https://b.test', snippet: 'snip2' },
      ],
    })

    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: fetchMock,
      defaultMaxResults: 7,
    })

    expect(typeof tool.execute).toBe('function')
    const out = await tool.execute!({ query: 'foo' }, unusedContext)
    expect(out).toEqual({
      results: [
        {
          title: 'A',
          url: 'https://a.test',
          snippet: 'snip',
          date: '2025-03-01',
          last_updated: '2025-03-02',
        },
        { title: 'B', url: 'https://b.test', snippet: 'snip2' },
      ],
    })

    expect(firstFetchBody(fetchMock).max_results).toBe(7)
    expect(firstFetchBody(fetchMock).query).toBe('foo')
    expect(firstFetchHeaders(fetchMock)[INTEGRATION_HEADER]).toMatch(
      /^tanstack\//,
    )
  })

  it('lets the model max_results override defaultMaxResults', async () => {
    const fetchMock = mockFetch({ results: [] })
    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: fetchMock,
      defaultMaxResults: 7,
    })

    await tool.execute!({ query: 'q', max_results: 3 }, unusedContext)
    expect(firstFetchBody(fetchMock).max_results).toBe(3)
  })

  it('passes through filter args from the model', async () => {
    const fetchMock = mockFetch({ results: [] })
    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: fetchMock,
    })

    await tool.execute!(
      {
        query: 'q',
        max_results: 2,
        search_domain_filter: ['arxiv.org'],
        search_recency_filter: 'week',
        search_after_date_filter: '1/1/2026',
      },
      unusedContext,
    )

    expect(firstFetchBody(fetchMock)).toEqual({
      query: 'q',
      max_results: 2,
      search_domain_filter: ['arxiv.org'],
      search_recency_filter: 'week',
      search_after_date_filter: '1/1/2026',
    })
  })

  it('forwards abortSignal to fetch', async () => {
    const abortController = new AbortController()
    const fetchMock = mockFetch({ results: [] })
    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: fetchMock,
    })

    await tool.execute!(
      { query: 'q' },
      { ...unusedContext, abortSignal: abortController.signal },
    )
    expect(firstFetchCall(fetchMock).init.signal).toBe(abortController.signal)
  })

  it('throws when defaultMaxResults is outside the allowed range', () => {
    expect(() => perplexitySearchTool({ defaultMaxResults: 0 })).toThrow(
      /integer between 1 and 20/i,
    )
    expect(() => perplexitySearchTool({ defaultMaxResults: 21 })).toThrow(
      /integer between 1 and 20/i,
    )
    expect(() => perplexitySearchTool({ defaultMaxResults: 1.5 })).toThrow(
      /integer between 1 and 20/i,
    )
  })

  it('honors custom name and description overrides', () => {
    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: mockFetch({ results: [] }),
      name: 'web_search',
      description: 'Custom desc.',
    })
    expect(tool.name).toBe('web_search')
    expect(tool.description).toBe('Custom desc.')
  })
})
