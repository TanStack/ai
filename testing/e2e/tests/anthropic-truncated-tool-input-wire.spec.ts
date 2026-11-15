import { test, expect } from './fixtures'

/**
 * Issue #1582: a stream that stops mid tool call leaves partial JSON in the
 * call's arguments. That stream now ends with `incomplete-stream`, so the
 * call must not reach the next turn. `/api/anthropic-truncated-tool-input-wire`
 * runs both turns and returns what went over the wire. The `{}` input
 * conversion for partial arguments is covered in `anthropic-adapter.test.ts`.
 */
test.describe('anthropic — truncated tool call replay', () => {
  test('a stream cut mid tool call does not replay the partial call', async ({
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

    // The first stream ends before a stop reason, so the adapter reports
    // incomplete-stream and turn 2 does not replay the truncated call.
    expect(toolUses).toHaveLength(0)
  })
})
