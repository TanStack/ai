import { expect, test } from './fixtures'

/**
 * An OpenAI Responses stream can carry one more
 * `response.function_call_arguments.delta` for a call that already completed.
 * The tool must still run once, with the finalized arguments.
 */
test.describe('openai responses late arguments delta', () => {
  for (const completion of ['arguments-done', 'item-done'] as const) {
    test(`runs the tool once when a delta arrives after ${completion}`, async ({
      request,
    }) => {
      const response = await request.post('/api/openai-late-args-delta-wire', {
        data: { completion },
      })
      expect(response.ok()).toBe(true)
      const result = (await response.json()) as {
        ok: boolean
        error?: string
        requestCount: number
        executedInputs: Array<unknown>
        toolErrors: Array<string>
        text: string
      }

      if (!result.ok) throw new Error(`Route failed: ${result.error}`)

      expect(result.toolErrors).toEqual([])
      expect(result.executedInputs).toEqual([{ city: 'Paris' }])
      expect(result.requestCount).toBe(2)
      expect(result.text).toBe('Sunny in Paris.')
    })
  }
})
