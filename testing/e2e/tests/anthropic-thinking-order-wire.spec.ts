import { test, expect } from './fixtures'

/**
 * Claude signs each thinking block against the blocks before it. When
 * web_search runs inside one response, a follow-up request that replays the
 * turn as "thinking, thinking, text, server_tool_use, result" fails with
 * "thinking blocks in the latest assistant message cannot be modified".
 * `/api/anthropic-thinking-order-wire` scripts that response and returns what
 * the wire and the client saw.
 */
test.describe('anthropic — signed thinking order around web_search', () => {
  test('replay, client tools, and the interrupt view keep the order', async ({
    request,
  }) => {
    const response = await request.post('/api/anthropic-thinking-order-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      replayedBlocks: Array<string>
      clientToolRequests: Array<string>
      viewAfterInterrupt: Array<Array<string>>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    // The second request replays the first turn in the order Claude signed it.
    expect(result.replayedBlocks).toEqual([
      'thinking',
      'server_tool_use',
      'web_search_tool_result',
      'thinking',
      'text',
    ])

    // Only the real client tool waits on the client. web_search already ran.
    expect(result.clientToolRequests).toEqual(['toolu_pick'])

    // After the interrupt snapshot the client still shows one message.
    expect(result.viewAfterInterrupt).toEqual([
      ['thinking', 'tool-call', 'thinking', 'text', 'tool-call'],
    ])
  })
})
