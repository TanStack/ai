import { test, expect } from './fixtures'

/**
 * Claude thinks, calls a server tool with no text first, then answers in a
 * second call. With `withPersistence`, the next turn must send that tool call
 * to Claude once. `/api/server-tool-store-wire` runs both turns and returns
 * what Claude received and what the store kept.
 */
test.describe('server tool before text — message ids across calls', () => {
  test('the next turn and the store hold the tool call once', async ({
    request,
  }) => {
    const response = await request.post('/api/server-tool-store-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      turn2ToolUseIds: Array<string>
      storedToolCallIds: Array<string>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.turn2ToolUseIds).toEqual(['toolu_lookup'])
    expect(result.storedToolCallIds).toEqual(['toolu_lookup'])
  })
})
