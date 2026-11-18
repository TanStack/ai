import { test, expect } from './fixtures'

/**
 * The OpenAI Decisions API can refuse a question and still bill the request.
 * `decide()` must reject with an `EvaluateError` whose code is `refusal` and
 * whose usage reaches `onUsage` first.
 */
test.describe('openai evaluate refusal', () => {
  test('rejects with a refusal EvaluateError and reports its usage', async ({
    request,
  }) => {
    const res = await request.post('/api/evaluate-refusal')
    expect(res.ok()).toBe(true)

    const body = (await res.json()) as {
      result?: unknown
      error?: {
        name?: string
        code?: string
        message?: string
        usage?: unknown
      }
      usageReports: Array<unknown>
    }
    const usage = { promptTokens: 40, completionTokens: 5, totalTokens: 45 }

    expect(body.result).toBeUndefined()
    expect(body.error).toEqual({
      name: 'EvaluateError',
      code: 'refusal',
      message: 'OpenAI declined to answer question "refund"',
      usage,
    })
    expect(body.usageReports).toEqual([usage])
  })
})
