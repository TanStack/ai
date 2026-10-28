import { test, expect } from './fixtures'

/**
 * Issue #1582: a stream that stops mid tool call leaves partial JSON in the
 * call's arguments. Replaying that call sent the raw string as
 * `tool_use.input`, and Anthropic rejected every later turn with
 * "Input should be an object". `/api/anthropic-truncated-tool-input-wire`
 * runs both turns and returns what went over the wire.
 */
test.describe('anthropic — truncated tool call replay', () => {
  test('a replayed tool call with partial arguments sends an object input', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/anthropic-truncated-tool-input-wire',
    )
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      requestBodies: Array<{
        messages: Array<{
          role: string
          content: string | Array<{ type: string; input?: unknown }>
        }>
      }>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.requestBodies).toHaveLength(2)
    const toolUses = result.requestBodies[1]!.messages.flatMap((m) =>
      Array.isArray(m.content)
        ? m.content.filter((b) => b.type === 'tool_use')
        : [],
    )

    // Guards the premise: the truncated call is replayed at all.
    expect(toolUses).toHaveLength(1)
    expect(toolUses[0]).toEqual({
      type: 'tool_use',
      id: 'toolu_truncated',
      name: 'lookup_weather',
      input: {},
    })
  })
})
