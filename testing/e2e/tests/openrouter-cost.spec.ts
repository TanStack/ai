import type { UsageCostBreakdown } from '@tanstack/ai'
import { test, expect } from './fixtures'

/**
 * Verifies that OpenRouter's provider-reported per-request cost reaches
 * `RUN_FINISHED`, alongside the OpenRouter generation id and selected provider.
 * The `/api/openrouter-cost` route drives the chat adapter against a
 * hand-crafted aimock mount whose stream ends with a usage-only chunk carrying
 * `cost` / `cost_details` (snake_case on the wire, camelCased by the SDK
 * parser). The adapter defers RUN_FINISHED until the stream drains, so that
 * trailing chunk is captured.
 */
test.describe('openrouter — per-request cost', () => {
  test('cost, generation id, and provider reach RUN_FINISHED', async ({
    request,
  }) => {
    const res = await request.post('/api/openrouter-cost')
    expect(res.ok()).toBe(true)

    const { ok, usage, generationId, provider, error } = (await res.json()) as {
      ok: boolean
      error?: string
      generationId?: string
      provider?: string
      usage?: {
        promptTokens?: number
        completionTokens?: number
        totalTokens?: number
        cost?: number
        costDetails?: UsageCostBreakdown
      }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(generationId).toBe('gen-openrouter-cost-e2e')
    expect(provider).toBe('DeepInfra')
    expect(usage).toMatchObject({
      promptTokens: 11,
      completionTokens: 3,
      totalTokens: 14,
      cost: 0.0042,
      costDetails: {
        upstreamCost: 0.0038,
        upstreamInputCost: 0.0012,
        upstreamOutputCost: 0.0026,
      },
    })
  })
})
