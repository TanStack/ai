import { test, expect } from './fixtures'

/**
 * Verifies that fal's `x-fal-billable-units` result header reaches
 * `result.usage.unitsBilled`. The `/api/fal-billable-units` route drives the
 * fal image adapter against the `/fal-queue` aimock mount, which mimics fal's
 * queue protocol (submit → poll → result) and stamps the billing headers on the
 * result fetch. The adapter's `config.fetch` reads those headers and surfaces
 * the real billed quantity on the generation result — the end-to-end proof that
 * media-generation spend is recoverable through the SDK without an app-side
 * `fetch` interceptor.
 */
test.describe('fal — billable units', () => {
  test('x-fal-billable-units reaches result.usage.unitsBilled', async ({
    request,
  }) => {
    const res = await request.post('/api/fal-billable-units')
    expect(res.ok()).toBe(true)

    const { ok, usage, error } = (await res.json()) as {
      ok: boolean
      error?: string
      usage?: {
        promptTokens?: number
        completionTokens?: number
        totalTokens?: number
        unitsBilled?: number
      }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(usage).toMatchObject({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      unitsBilled: 4,
    })
  })
})
