import { test, expect } from './fixtures'

/**
 * Claude encrypts some thinking as a `redacted_thinking` block with opaque
 * `data`. The next request must send that block back unchanged, and a failed
 * tool result must say `is_error: true`.
 * `/api/anthropic-redacted-thinking-wire` scripts the responses and returns
 * what the follow-up requests sent.
 */
test.describe('anthropic — redacted thinking and tool errors on the wire', () => {
  test('the next turn, the same run, and a failed tool send them back', async ({
    request,
  }) => {
    const response = await request.post('/api/anthropic-redacted-thinking-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      nextTurnBlocks: Array<Record<string, unknown>>
      sameRunBlocks: Array<string>
      toolResult?: Record<string, unknown>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    // A new turn from the client history: the block crossed the wire.
    expect(result.nextTurnBlocks).toEqual([
      { type: 'redacted_thinking', data: 'opaque-1' },
      { type: 'text', text: 'Hello.' },
    ])

    // The same run continues after the tool, with the block first.
    expect(result.sameRunBlocks).toEqual(['redacted_thinking', 'tool_use'])

    // The failed tool is marked as an error.
    expect(result.toolResult).toMatchObject({
      tool_use_id: 'toolu_1',
      is_error: true,
    })
  })
})
