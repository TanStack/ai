import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

// The mock server marks only get_guitar_price read-only (fixtures/mcp/basic.json).

type StreamEvent = {
  type: string
  outcome?: {
    type?: string
    interrupts?: Array<{ metadata?: { kind?: string; toolName?: string } }>
  }
}

function parseSse(body: string): Array<StreamEvent> {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .flatMap((line) => {
      try {
        return [JSON.parse(line.slice('data:'.length).trim()) as StreamEvent]
      } catch {
        return []
      }
    })
}

test.describe('mcp-policy — client toolFilter / needsApproval', () => {
  async function run(
    request: APIRequestContext,
    testId: string,
    aimockPort: number,
    policy: 'none' | 'readOnly' | 'approval',
  ) {
    const res = await request.post('/api/mcp-policy-test', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId: `mcp-policy-thread-${testId}`,
        runId: `mcp-policy-run-${testId}`,
        state: {},
        messages: [
          {
            id: 'mcp-policy-msg-1',
            role: 'user',
            content: '[mcp] how much is the strat guitar',
          },
        ],
        tools: [],
        context: [],
        forwardedProps: { testId, aimockPort, policy },
      },
    })
    const body = await res.text()
    expect(res.ok(), `mcp-policy-test failed (${res.status()}): ${body}`).toBe(
      true,
    )
    return parseSse(body)
  }

  async function wireToolNames(
    request: APIRequestContext,
    testId: string,
    aimockPort: number,
  ) {
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journal.json()) as Array<{
      headers?: Record<string, string>
      body?: { tools?: Array<{ function?: { name?: string } }> } | null
    }>
    const first = entries.find(
      (entry) => entry.headers?.['x-test-id'] === testId,
    )
    return (first?.body?.tools ?? []).map((t) => t.function?.name)
  }

  test('no policy sends every server tool', async ({
    request,
    testId,
    aimockPort,
  }) => {
    await run(request, testId, aimockPort, 'none')
    const names = await wireToolNames(request, testId, aimockPort)
    expect(names).toContain('get_guitar_price')
    expect(names).toContain('appraise_guitar_collection')
  })

  test('toolFilter keeps only read-only tools on the wire', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const events = await run(request, testId, aimockPort, 'readOnly')
    const names = await wireToolNames(request, testId, aimockPort)
    expect(names).toEqual(['get_guitar_price'])
    // The kept tool still runs.
    expect(events.some((e) => e.type === 'TOOL_CALL_RESULT')).toBe(true)
    expect(events.some((e) => e.type === 'RUN_ERROR')).toBe(false)
  })

  test('needsApproval pauses the run before the tool executes', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const events = await run(request, testId, aimockPort, 'approval')
    expect(events.some((e) => e.type === 'TOOL_CALL_RESULT')).toBe(false)
    const finished = events.find((e) => e.type === 'RUN_FINISHED')
    expect(finished?.outcome?.type).toBe('interrupt')
    expect(finished?.outcome?.interrupts?.[0]?.metadata).toMatchObject({
      kind: 'approval',
      toolName: 'get_guitar_price',
    })
  })
})
