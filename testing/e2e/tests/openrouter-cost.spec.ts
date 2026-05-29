import { test, expect } from './fixtures'

/**
 * Verifies that OpenRouter's provider-reported per-request cost reaches
 * `RUN_FINISHED.usage`. The `/api/openrouter-cost` route drives the OpenRouter
 * chat adapter against a hand-crafted aimock mount whose stream ends with a
 * usage-only chunk carrying `cost` / `cost_details` (snake_case on the wire,
 * camelCased by the SDK parser). The adapter defers RUN_FINISHED until the
 * stream drains, so that trailing chunk is captured.
 */
test.describe('openrouter — per-request cost', () => {
  test('cost and costDetails reach RUN_FINISHED.usage', async ({ request }) => {
    const res = await request.post('/api/openrouter-cost')
    expect(res.ok()).toBe(true)

    const { ok, usage, error } = (await res.json()) as {
      ok: boolean
      error?: string
      usage?: {
        promptTokens?: number
        completionTokens?: number
        totalTokens?: number
        cost?: number
        costDetails?: Record<string, number | null>
      }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(usage).toMatchObject({
      promptTokens: 11,
      completionTokens: 3,
      totalTokens: 14,
      cost: 0.0042,
      costDetails: {
        upstreamInferenceCompletionsCost: 0.0026,
        upstreamInferenceCost: 0.0038,
        upstreamInferencePromptCost: 0.0012,
      },
    })
  })
})
