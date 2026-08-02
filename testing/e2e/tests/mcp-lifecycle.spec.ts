import { test, expect } from './fixtures'

/**
 * `chat({ mcp: { connection } })` lifecycle semantics, end-to-end.
 *
 * `api.mcp-lifecycle-test` runs a real chat() agent loop with one MCP client,
 * drains it, then probes whether the client is still usable:
 *   - 'close' (default) → chat closed it → not usable.
 *   - 'keep-alive'      → chat left it open → still usable.
 *
 * The unit tests assert this against fake sources; this proves it against a
 * real `createMCPClient` over Streamable HTTP. aimock returns a plain text turn
 * (fixtures/mcp/lifecycle.json) — no tool call needed; only lifecycle matters.
 */
async function runLifecycle(
  request: import('@playwright/test').APIRequestContext,
  opts: {
    testId: string
    aimockPort: number
    connection: 'close' | 'keep-alive'
  },
) {
  const res = await request.post('/api/mcp-lifecycle-test', {
    headers: { 'Content-Type': 'application/json' },
    data: {
      threadId: `mcp-life-${opts.testId}`,
      runId: `mcp-life-run-${opts.testId}`,
      state: {},
      messages: [
        { id: 'mcp-life-msg-1', role: 'user', content: '[mcp-lifecycle] ping' },
      ],
      tools: [],
      context: [],
      forwardedProps: {
        testId: opts.testId,
        aimockPort: opts.aimockPort,
        connection: opts.connection,
      },
    },
  })
  const body = await res.text()
  expect(
    res.ok(),
    `mcp-lifecycle-test (${opts.connection}) failed (${res.status()}): ${body}`,
  ).toBe(true)
  return JSON.parse(body) as {
    connection: string
    survivedAfterRun: boolean
  }
}

test.describe('mcp — chat({ mcp }) connection lifecycle', () => {
  test("connection: 'close' (default) closes the client after the run", async ({
    request,
    testId,
    aimockPort,
  }) => {
    const json = await runLifecycle(request, {
      testId: `${testId}-close`,
      aimockPort,
      connection: 'close',
    })
    expect(json.connection).toBe('close')
    expect(json.survivedAfterRun).toBe(false)
  })

  test("connection: 'keep-alive' leaves the client open after the run", async ({
    request,
    testId,
    aimockPort,
  }) => {
    const json = await runLifecycle(request, {
      testId: `${testId}-keepalive`,
      aimockPort,
      connection: 'keep-alive',
    })
    expect(json.connection).toBe('keep-alive')
    expect(json.survivedAfterRun).toBe(true)
  })
})
