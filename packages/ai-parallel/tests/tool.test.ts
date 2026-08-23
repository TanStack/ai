import { afterEach, describe, expect, it, vi } from 'vitest'
import { parallelSearchTool } from '../src/tool'
import { fetchCall, mockFetch, searchResponse } from './test-utils'

const context = {
  emitCustomEvent: () => {},
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('parallelSearchTool', () => {
  it('creates a native server tool without resolving credentials eagerly', () => {
    vi.stubEnv('PARALLEL_API_KEY', '')

    const tool = parallelSearchTool()

    expect(tool.__toolSide).toBe('server')
    expect(tool.name).toBe('parallel_search')
    expect(tool.description).toMatch(/Parallel/)
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()
    expect(typeof tool.execute).toBe('function')
  })

  it('returns citation-rich search results and nests GA advanced settings', async () => {
    const fetchMock = mockFetch(
      searchResponse([
        {
          url: 'https://example.com/research',
          title: 'Research',
          excerpts: ['A source-grounded result.'],
          publish_date: '2026-08-20',
        },
      ]),
    )
    const tool = parallelSearchTool({
      apiKey: 'test-key',
      fetch: fetchMock,
      mode: 'basic',
      defaultMaxResults: 5,
      sourcePolicy: {
        include_domains: ['example.com'],
        after_date: '2026-08-01',
      },
    })

    const results = await tool.execute!(
      {
        query: 'recent AI research',
        objective: 'Find recent primary sources.',
      },
      context,
    )

    expect(results).toEqual({
      results: [
        {
          url: 'https://example.com/research',
          title: 'Research',
          excerpts: ['A source-grounded result.'],
          publish_date: '2026-08-20',
        },
      ],
    })
    expect(fetchCall(fetchMock).body).toEqual({
      search_queries: ['recent AI research'],
      objective: 'Find recent primary sources.',
      mode: 'basic',
      advanced_settings: {
        max_results: 5,
        source_policy: {
          include_domains: ['example.com'],
          after_date: '2026-08-01',
        },
      },
    })
  })

  it('allows a model-provided result limit to override the application default', async () => {
    const fetchMock = mockFetch(searchResponse())
    const tool = parallelSearchTool({
      apiKey: 'test-key',
      fetch: fetchMock,
      defaultMaxResults: 5,
    })

    await tool.execute!({ query: 'news', max_results: 2 }, context)

    expect(fetchCall(fetchMock).body.advanced_settings).toEqual({
      max_results: 2,
    })
  })

  it('does not leak returned sessions between unrelated tool calls', async () => {
    const fetchMock = mockFetch(searchResponse([], 'session_returned'))
    const tool = parallelSearchTool({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    await tool.execute!({ query: 'first search' }, context)
    await tool.execute!({ query: 'second search' }, context)

    expect(fetchCall(fetchMock, 0).body).not.toHaveProperty('session_id')
    expect(fetchCall(fetchMock, 1).body).not.toHaveProperty('session_id')
  })

  it('uses only the explicitly configured search session', async () => {
    const fetchMock = mockFetch(searchResponse([], 'session_returned'))
    const tool = parallelSearchTool({
      apiKey: 'test-key',
      fetch: fetchMock,
      sessionId: 'session_existing',
    })

    await tool.execute!({ query: 'first search' }, context)
    await tool.execute!({ query: 'second search' }, context)

    expect(fetchCall(fetchMock, 0).body.session_id).toBe('session_existing')
    expect(fetchCall(fetchMock, 1).body.session_id).toBe('session_existing')
  })

  it('forwards the chat cancellation signal to Parallel', async () => {
    const controller = new AbortController()
    const fetchMock = mockFetch(searchResponse())
    const tool = parallelSearchTool({
      apiKey: 'test-key',
      fetch: fetchMock,
    })

    await tool.execute!(
      { query: 'news' },
      { ...context, abortSignal: controller.signal },
    )

    expect(fetchCall(fetchMock).init.signal).toBe(controller.signal)
  })

  it('rejects invalid application result limits', () => {
    expect(() => parallelSearchTool({ defaultMaxResults: 0 })).toThrow(
      /positive integer/,
    )
    expect(() => parallelSearchTool({ defaultMaxResults: 1.5 })).toThrow(
      /positive integer/,
    )
  })

  it('supports custom tool names and descriptions', () => {
    const tool = parallelSearchTool({
      name: 'web_search',
      description: 'Find current evidence.',
    })

    expect(tool.name).toBe('web_search')
    expect(tool.description).toBe('Find current evidence.')
  })
})
