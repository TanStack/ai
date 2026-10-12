import { test, expect } from './fixtures'

/**
 * A conversation that starts on Claude and goes on with OpenAI. Claude's
 * signed thinking and tool call must reach OpenAI as plain text and paired
 * tool rows, never as a Claude signature.
 * `/api/cross-model-replay-wire` scripts both providers and returns what the
 * OpenAI request held.
 */
test.describe('cross-model replay — Claude history sent to OpenAI', () => {
  test('drops the signature, keeps the thinking as text, and pairs the tool rows', async ({
    request,
  }) => {
    const response = await request.post('/api/cross-model-replay-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      claudeSources: Array<{ provider: string; api: string; model: string }>
      openaiCalls: number
      hasSignature: boolean
      hasThinkingText: boolean
      toolCallIds: Array<string>
      toolResultIds: Array<string>
      roles: Array<string>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    // Each Claude answer records where it came from.
    expect(result.claudeSources.length).toBeGreaterThan(0)
    for (const source of result.claudeSources) {
      expect(source).toEqual({
        provider: 'anthropic',
        api: 'anthropic-messages',
        model: 'claude-sonnet-4-5',
      })
    }

    // OpenAI gets the history without Claude's signature. The thinking is
    // readable, so it goes on as text.
    expect(result.openaiCalls).toBe(1)
    expect(result.hasSignature).toBe(false)
    expect(result.hasThinkingText).toBe(true)

    // The tool call and its result keep the same ID.
    expect(result.toolCallIds).toHaveLength(1)
    expect(result.toolResultIds).toEqual(result.toolCallIds)
    expect(result.roles).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
      'user',
    ])
  })
})
