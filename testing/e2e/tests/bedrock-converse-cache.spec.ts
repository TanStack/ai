import { test, expect } from './fixtures'

// The mock protocol is described at `bedrockConverseCacheMount` in global-setup.ts.
test.describe('bedrock-converse — prompt cache checkpoints', () => {
  test('cachePoint blocks reach the request and cache counts reach usage', async ({
    request,
  }) => {
    const res = await request.post('/api/bedrock-converse-cache')
    expect(res.ok()).toBe(true)

    const { ok, error, observed, usage } = (await res.json()) as {
      ok: boolean
      error?: string
      observed?: { tools: boolean; system: boolean; lastMessage: boolean }
      usage?: {
        promptTokens?: number
        promptTokensDetails?: {
          cachedTokens?: number
          cacheWriteTokens?: number
        }
      }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(observed).toEqual({ tools: true, system: true, lastMessage: true })
    expect(usage).toMatchObject({
      promptTokens: 3,
      promptTokensDetails: { cachedTokens: 8409, cacheWriteTokens: 0 },
    })
  })
})
