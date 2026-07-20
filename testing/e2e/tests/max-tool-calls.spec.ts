import { expect, test } from '@playwright/test'

/**
 * Regression for issue #964: maxIterations counts model turns, not tool calls.
 * maxToolCalls + maxToolCallsPerTurn must bound fan-out from a single fat turn.
 */
test.describe('chat() maxToolCalls / maxToolCallsPerTurn (#964)', () => {
  test('caps parallel fan-out and cumulative tool calls', async ({
    request,
  }) => {
    const res = await request.post('/api/max-tool-calls-wire')
    expect(res.ok()).toBe(true)

    const body = (await res.json()) as {
      chunks: Array<Record<string, unknown>>
      error: string | null
      executeCount: number
    }

    expect(body.error).toBeNull()

    // 8 parallel calls emitted; maxToolCallsPerTurn=3 → only 3 execute
    expect(body.executeCount).toBe(3)

    const toolResults = body.chunks.filter((c) => c.type === 'TOOL_CALL_RESULT')
    // Every model-emitted call still gets a tool result (3 real + 5 skipped)
    expect(toolResults.length).toBe(8)

    const skipped = toolResults.filter((c) => {
      const content = c.content
      return (
        typeof content === 'string' &&
        content.includes('exceeded maxToolCallsPerTurn')
      )
    })
    expect(skipped.length).toBe(5)

    // maxToolCalls(5): after the fat turn toolCallCount=8 (>= 5), so no further
    // model turn runs. executeCount stays at 3 either way.
    const runFinished = body.chunks.filter((c) => c.type === 'RUN_FINISHED')
    expect(runFinished.length).toBe(1)
  })
})
