import { test, expect } from './fixtures'

interface WireRequest {
  model: string
  thinking: boolean
  tools: Array<string>
}

const DEFAULT_TURN = {
  model: 'claude-sonnet-4-6',
  thinking: false,
  tools: ['get_guitars'],
}

test.describe('harness: turn overrides on the wire', () => {
  test('only the turn with overrides uses its adapter, reasoning, and tools', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-turn-overrides')
    expect(res.ok()).toBe(true)
    const result: { error?: string; requests: Array<WireRequest> } =
      await res.json()
    expect(result.error ?? null).toBeNull()

    // One model call for each turn, in turn order.
    expect(result.requests).toEqual([
      DEFAULT_TURN,
      {
        model: 'claude-opus-4-7',
        thinking: true,
        tools: ['get_guitars', 'get_price'],
      },
      DEFAULT_TURN,
    ])
  })
})
