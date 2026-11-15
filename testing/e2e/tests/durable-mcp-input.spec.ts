import { test, expect } from './fixtures'

for (const status of ['resolved', 'cancelled']) {
  test(`durable MCP input delivers a ${status} answer across requests`, async ({
    request,
  }) => {
    const threadId = crypto.randomUUID()
    const firstRun = crypto.randomUUID()
    const first = await request.post('/api/durable-mcp-input', {
      data: { threadId, runId: firstRun },
    })
    expect(first.ok()).toBe(true)
    const parked = await first.json()
    expect(parked.pending).toHaveLength(1)
    expect(parked.run.status).toBe('interrupted')
    const inputResponse =
      status === 'resolved'
        ? { status, payload: { value: 'Paris' } }
        : { status }
    const next = await request.post('/api/durable-mcp-input', {
      data: {
        threadId,
        runId: crypto.randomUUID(),
        parentRunId: firstRun,
        resume: [
          { interruptId: parked.pending[0].interruptId, ...inputResponse },
        ],
      },
    })
    expect(next.ok()).toBe(true)
    const resumed = await next.json()
    expect(resumed.responses).toEqual([inputResponse])
    expect(resumed.pending).toEqual([])
    expect(resumed.run.status).toBe('completed')
    expect(resumed.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' })
    expect(
      resumed.events.some(
        (event: { type: string }) => event.type === 'RUN_ERROR',
      ),
    ).toBe(false)
  })
}
