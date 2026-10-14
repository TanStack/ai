import { test, expect } from './fixtures'

/**
 * When the provider bills a `decide()` call but returns an answer that cannot
 * be mapped, `decide()` rejects. The usage must still reach the `onUsage`
 * middleware hook so the spend is not lost.
 *
 * The `/api/evaluate-usage-on-failure` route drives the OpenAI evaluate
 * adapter against an aimock mount whose `/v1/decisions` response carries
 * usage and a choice with no entry in `probabilities`.
 */
test.describe('evaluate — usage when answer mapping fails', () => {
  test('decide() rejects and still reports usage', async ({ request }) => {
    const res = await request.post('/api/evaluate-usage-on-failure')
    expect(res.ok()).toBe(true)

    const { error, onUsageReports } = (await res.json()) as {
      error?: { name: string; message: string }
      onUsageReports: Array<unknown>
    }

    expect(error).toEqual({
      name: 'Error',
      message: 'decide(): missing probability for choice "sales" on "queue"',
    })
    const usage = { promptTokens: 42, completionTokens: 7, totalTokens: 49 }
    expect(onUsageReports).toEqual([expect.objectContaining(usage)])
  })
})
