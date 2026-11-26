import { expect, test } from './fixtures'

/**
 * OpenRouter Chat Completions: when the output limit cuts a tool call, the run
 * must finish with `length` so the engine does not run the cut call.
 */
test.describe('openrouter length-cut tool call', () => {
  test('does not run a tool call cut by the output limit', async ({
    request,
  }) => {
    const response = await request.post('/api/openrouter-length-tool-cut-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      requestCount: number
      executedInputs: Array<unknown>
    }

    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    // Before the fix the adapter reported `tool_calls`, and the cut call ran
    // with `{ text: 'Hello' }`.
    expect(result.executedInputs).toEqual([])
  })
})
