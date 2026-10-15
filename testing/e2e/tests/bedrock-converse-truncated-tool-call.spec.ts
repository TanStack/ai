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
// `src/routes/api.bedrock-converse-truncated-tool-call.ts`.
test.describe('bedrock-converse — tool call cut at the output limit', () => {
  test('by default, the cut call does not run, gets the default text, and the run ends with length', async ({
    request,
  }) => {
    const res = await request.post('/api/bedrock-converse-truncated-tool-call')
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

  test('with a strategy that goes on, the cut call gets the middleware text and the model answers again', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/bedrock-converse-truncated-tool-call?retry',
    )
    expect(res.ok()).toBe(true)

    const { ok, error, runs, toolResults, text, finishReasons } =
      (await res.json()) as Result

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(runs).toBe(0)
    expect(toolResults).toEqual([
      'Tool call "lookup_weather" was cut off. Send it again.',
    ])
    // The second fixture answers only a request that has a tool result.
    expect(text).toBe('Let me look again.')
    expect(finishReasons).toEqual(['tool_calls', 'stop'])
  })
})
