import { test, expect } from './fixtures'
import type { StreamChunk } from '@tanstack/ai'

type ProviderRequest = {
  tools?: Array<unknown>
  input?: Array<{
    type?: string
    name?: string
    call_id?: string
    output?: string
  }>
}

test('Parallel Search executes through the adapter and returns cited sources', async ({
  request,
  testId,
}) => {
  const response = await request.post(
    `/api/parallel-search?testId=${encodeURIComponent(testId)}`,
  )
  expect(response.ok()).toBe(true)
  const { chunks, searchRequests, providerRequests } =
    (await response.json()) as {
      chunks: Array<StreamChunk>
      searchRequests: Array<unknown>
      providerRequests: Array<ProviderRequest>
    }

  expect(searchRequests).toEqual([
    {
      url: 'https://parallel-search.invalid/v1/search',
      method: 'POST',
      body: {
        search_queries: ['Parallel Search source citations'],
        objective: 'Find a source that describes Search results.',
        mode: 'fast',
        advanced_settings: {
          max_results: 1,
          source_policy: { include_domains: ['example.com'] },
        },
      },
    },
  ])
  expect(chunks.filter((chunk) => chunk.type === 'RUN_ERROR')).toEqual([])
  expect(chunks.at(-1)).toMatchObject({ type: 'RUN_FINISHED' })
  expect(
    chunks
      .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
      .map((chunk) => chunk.delta)
      .join(''),
  ).toBe(
    'Search returns source URLs and excerpts. Source: https://example.com/parallel-search',
  )

  // A canned final answer is not proof of tool execution. Check the schema
  // and actual tool result sent over HTTP on the provider's second turn.
  expect(providerRequests).toHaveLength(2)
  expect(providerRequests[0]?.tools).toMatchObject([
    {
      type: 'function',
      name: 'parallel_search',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: expect.arrayContaining(['query']),
      },
    },
  ])

  const input = providerRequests[1]?.input ?? []
  const toolCall = input.find((item) => item.type === 'function_call')
  expect(toolCall?.name).toBe('parallel_search')
  expect(toolCall?.call_id).toEqual(expect.any(String))
  const toolResult = input.find((item) => item.type === 'function_call_output')
  expect(toolResult?.call_id).toBe(toolCall?.call_id)
  expect(JSON.parse(toolResult?.output ?? '{}')).toEqual({
    results: [
      {
        url: 'https://example.com/parallel-search',
        title: 'Parallel Search test source',
        excerpts: ['Search results include source URLs and excerpts.'],
        publish_date: '2026-01-01',
      },
    ],
  })
})
