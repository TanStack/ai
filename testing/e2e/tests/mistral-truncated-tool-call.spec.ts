import { test, expect } from './fixtures'

const DEFAULT_TEXT =
  'The answer stopped at the output limit, so no tool call in it ran. Send the tool calls again. Do not repeat text you already wrote. If one call has a large input, split the work into smaller calls.'

type Result = {
  ok: boolean
  error?: string
  runs?: number
  toolResults?: Array<string>
  text?: string
  finishReasons?: Array<string | undefined>
}

// The route and its aimock fixture are described at
// `src/routes/api.mistral-truncated-tool-call.ts`.
test.describe('mistral — tool call cut at the output limit', () => {
  test('the cut call does not run and the run ends with length, not tool_calls', async ({
    request,
  }) => {
    const res = await request.post('/api/mistral-truncated-tool-call')
    expect(res.ok()).toBe(true)

    const { ok, error, runs, toolResults, text, finishReasons } =
      (await res.json()) as Result

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(runs).toBe(0)
    expect(toolResults).toEqual([DEFAULT_TEXT])
    expect(text).toBe('')
    expect(finishReasons).toEqual(['length'])
  })
})
