import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { perplexitySearchTool } from '../src/search/tool'

describe('perplexitySearchTool', () => {
  beforeEach(() => {
    process.env.PERPLEXITY_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes a sensible default name, description, and schema', () => {
    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: vi.fn() as any,
    })
    expect(tool.name).toBe('perplexity_search')
    expect(tool.description).toMatch(/Perplexity Search API/i)
    // Must not leak Sonar references in user-facing description
    expect(tool.description.toLowerCase()).not.toContain('sonar')
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      required: ['query'],
    })
  })

  it('executes the server tool against the mocked fetch', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: 'A',
                url: 'https://a.test',
                snippet: 'snip',
                date: '2025-03-01',
              },
              { title: 'B', url: 'https://b.test', snippet: 'snip2' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )

    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: fetchMock as any,
      defaultMaxResults: 7,
    })

    expect(typeof tool.execute).toBe('function')
    const out = await tool.execute!({ query: 'foo' } as any)
    expect(out).toEqual({
      results: [
        {
          title: 'A',
          url: 'https://a.test',
          snippet: 'snip',
          date: '2025-03-01',
        },
        { title: 'B', url: 'https://b.test', snippet: 'snip2' },
      ],
    })

    // Default max_results should be applied when caller omits it
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.max_results).toBe(7)
    expect(body.query).toBe('foo')
  })

  it('passes through filter args from the model', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: fetchMock as any,
    })

    await tool.execute!({
      query: 'q',
      max_results: 2,
      search_domain_filter: ['arxiv.org'],
      search_recency_filter: 'week',
      search_after_date_filter: '1/1/2026',
    } as any)

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body).toEqual({
      query: 'q',
      max_results: 2,
      search_domain_filter: ['arxiv.org'],
      search_recency_filter: 'week',
      search_after_date_filter: '1/1/2026',
    })
  })

  it('honors custom name and description overrides', () => {
    const tool = perplexitySearchTool({
      apiKey: 'k',
      fetch: vi.fn() as any,
      name: 'web_search',
      description: 'Custom desc.',
    })
    expect(tool.name).toBe('web_search')
    expect(tool.description).toBe('Custom desc.')
  })
})
