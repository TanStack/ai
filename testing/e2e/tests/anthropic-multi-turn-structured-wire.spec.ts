import { test, expect } from './fixtures'

/**
 * Issue #613: on the #605 native combined path the structured JSON lands on a
 * `structured-output` part, not a text part, so the assistant turn reaches the
 * next request only while a completed part is re-serialized as content. Lose
 * that and the turn goes out empty — which only Anthropic shows, because
 * `mergeConsecutiveSameRoleMessages` filters the empty turn and merges the two
 * user turns left adjacent. aimock then matches turn 1's fixture on the merged
 * prompt and replays the first recipe; OpenAI keeps the empty turn, so its
 * last user message is still turn 2's prompt and nothing looks wrong.
 *
 * `multi-turn-structured.spec.ts` covers the rendered outcome. This pins the
 * cause, so the next regression says so instead of "turn 2 shows turn 1's
 * recipe".
 */
test.describe('anthropic — multi-turn structured wire shape', () => {
  test('the second turn keeps the first recipe on its own assistant turn', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/anthropic-multi-turn-structured-wire',
    )
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      requestBodies: Array<{
        messages: Array<{ role: string; content: unknown }>
        output_config?: { format?: { type?: string } }
      }>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.requestBodies).toHaveLength(2)
    const [firstRequest, secondRequest] = result.requestBodies

    expect(firstRequest!.messages.map((m) => m.role)).toEqual(['user'])
    // Guards the premise: without `output_config` the JSON would come back as
    // plain text and a text part would satisfy the round trip anyway.
    expect(secondRequest!.output_config?.format?.type).toBe('json_schema')

    // A merged pair of user turns here means the assistant turn went out empty.
    const replayed = secondRequest!.messages
    expect(replayed.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(JSON.stringify(replayed[0])).toContain(
      '[multiturn-structured-wire-1] pasta dinner for two',
    )
    // The model sees its own prior answer, verbatim.
    expect(JSON.stringify(replayed[1])).toContain('Classic Spaghetti Pomodoro')
    expect(JSON.stringify(replayed[2])).toContain(
      '[multiturn-structured-wire-2] now make it vegan',
    )
    expect(JSON.stringify(replayed[2])).not.toContain('pasta dinner for two')
  })
})
