import { test, expect } from './fixtures'

/**
 * Wire-format verification for the `reasoning` config of an adapter.
 *
 * `/api/adapter-config-reasoning-wire` runs `chat({ reasoning: 'high' })` on
 * model ids that the Anthropic adapter does not list, with the reasoning
 * data of their catalog records in the config:
 * - `anthropic/claude-sonnet-4.6` (`adaptive: true`): adaptive thinking.
 * - `openai/gpt-5` (`adaptive: false`): budget thinking.
 * - `anthropic/claude-opus-5.5` (`midConversationEffort: true`): the level
 *   goes into the messages.
 * - `reasoning: false`: no thinking field.
 */
type WireResponse = {
  ok: boolean
  error?: string
  capturedRequests: Array<Record<string, unknown> | null>
  capturedBetas: Array<string | null>
}

test.describe('adapter reasoning config wire format', () => {
  test('a model id outside the adapter list gets its thinking shape from the config', async ({
    request,
  }) => {
    const res = await request.post('/api/adapter-config-reasoning-wire')
    expect(res.ok()).toBe(true)
    const payload = (await res.json()) as WireResponse
    expect(payload.error).toBeUndefined()
    expect(payload.ok).toBe(true)

    expect(payload.capturedRequests).toHaveLength(4)
    const [adaptive, budget, managed, off] = payload.capturedRequests

    expect(adaptive?.['model']).toBe('anthropic/claude-sonnet-4.6')
    expect(adaptive?.['thinking']).toEqual({
      type: 'adaptive',
      display: 'summarized',
    })
    expect(adaptive?.['output_config']).toEqual({ effort: 'high' })

    expect(budget?.['model']).toBe('openai/gpt-5')
    expect(budget?.['thinking']).toEqual({
      type: 'enabled',
      budget_tokens: 16384,
    })
    expect(budget).not.toHaveProperty('output_config')

    expect(managed?.['model']).toBe('anthropic/claude-opus-5.5')
    expect(managed?.['thinking']).toEqual({
      type: 'adaptive',
      display: 'summarized',
      block_binding: { prefix_mismatch_behavior: 'drop_block' },
    })
    expect(managed?.['output_config']).toEqual({ effort: 'high' })
    expect(managed?.['messages']).toEqual([
      { role: 'user', content: '[config-reasoning] plan it' },
      { role: 'system', content: [], output_config: { effort: 'high' } },
    ])
    expect(payload.capturedBetas[2]?.split(',')).toEqual(
      expect.arrayContaining([
        'mid-conversation-output-config-2026-07-01',
        'thinking-binding-controls-2026-08-01',
      ]),
    )

    expect(off).not.toHaveProperty('thinking')
    expect(off).not.toHaveProperty('output_config')
  })
})
