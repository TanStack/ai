import { test, expect } from './fixtures'

const EXPECTED_SOURCES = [
  {
    url: 'https://example.com/release',
    title: 'Example release notes',
  },
]

type SearchResult = {
  ok: boolean
  error?: string
  sources?: Array<{ url: string; title?: string }>
}

test.describe('provider-executed web search metadata', () => {
  for (const provider of ['openai', 'gemini'] as const) {
    test(`${provider} exposes normalized source links`, async ({ request }) => {
      const response = await request.post(
        `/api/provider-search-metadata-wire?provider=${provider}`,
      )
      expect(response.ok()).toBe(true)

      const result = (await response.json()) as SearchResult
      expect(result, result.error).toMatchObject({
        ok: true,
        sources: EXPECTED_SOURCES,
      })
    })
  }

  // The mount answers 400 unless the request asks for web search sources,
  // which the adapter adds only when `webSearchTool` reaches the request.
  for (const model of ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'] as const) {
    test(`openai ${model} sends webSearchTool and exposes source links`, async ({
      request,
    }) => {
      const response = await request.post(
        `/api/provider-search-metadata-wire?provider=openai&model=${model}`,
      )
      expect(response.ok()).toBe(true)

      const result = (await response.json()) as SearchResult
      expect(result, result.error).toMatchObject({
        ok: true,
        sources: EXPECTED_SOURCES,
      })
    })
  }
})
