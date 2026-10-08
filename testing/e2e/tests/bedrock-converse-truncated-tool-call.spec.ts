import { test, expect } from './fixtures'

// The route and its aimock fixture are described at
// `src/routes/api.bedrock-converse-truncated-tool-call.ts`.
test.describe('bedrock-converse — tool call cut at the output limit', () => {
  test('the cut call does not run, gets the text, and the model answers again', async ({
    request,
  }) => {
    const res = await request.post('/api/bedrock-converse-truncated-tool-call')
    expect(res.ok()).toBe(true)

    const { ok, error, runs, toolResults, text } = (await res.json()) as {
      ok: boolean
      error?: string
      runs?: number
      toolResults?: Array<string>
      text?: string
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(runs).toBe(0)
    expect(toolResults).toEqual([
      'Tool call "lookup_weather" was cut off. Send it again.',
    ])
    // The second fixture answers only a request that has a tool result.
    expect(text).toBe('Let me look again.')
  })
})
