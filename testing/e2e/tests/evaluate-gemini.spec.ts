import { test, expect } from './fixtures'

/**
 * The Gemini Decisions API answers typed questions about one `state` and bills
 * usage with the `total_*` key shape. `decide()` with `geminiDecider` must map
 * the choice, score, and boolean answers to the unified result and report the
 * usage to `onUsage`.
 */
test.describe('gemini evaluate', () => {
  test('maps choice, score, and boolean answers plus usage', async ({
    request,
  }) => {
    const res = await request.post('/api/evaluate-gemini')
    expect(res.ok()).toBe(true)

    const body = (await res.json()) as {
      result: {
        queue: { type: string; value: string }
        urgency: { type: string; value: string }
        refund: { type: string; value: boolean }
        meta: { model: string; usage: unknown }
      }
      usageReports: Array<unknown>
    }

    const usage = { promptTokens: 48, completionTokens: 0, totalTokens: 48 }

    expect(body.result.queue).toMatchObject({
      type: 'choice',
      value: 'billing',
    })
    expect(body.result.urgency).toMatchObject({ type: 'score', value: 'high' })
    expect(body.result.refund).toMatchObject({ type: 'boolean', value: true })
    expect(body.result.meta.model).toBe('gemini-decision-1')
    expect(body.result.meta.usage).toEqual(usage)
    expect(body.usageReports).toEqual([usage])
  })
})
