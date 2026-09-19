import { test, expect } from './fixtures'

test.describe('provider-executed web search metadata', () => {
  for (const provider of ['openai', 'gemini'] as const) {
    test(`${provider} exposes normalized source links`, async ({ request }) => {
      const response = await request.post(
        `/api/provider-search-metadata-wire?provider=${provider}`,
      )
      expect(response.ok()).toBe(true)

      const result = (await response.json()) as {
        ok: boolean
        error?: string
        sources?: Array<{ url: string; title?: string }>
      }
      expect(result, result.error).toMatchObject({
        ok: true,
        sources: [
          {
            url: 'https://example.com/release',
            title: 'Example release notes',
          },
        ],
      })
    })
  }
})
