import { test, expect } from './fixtures'

test.describe('AG-UI foreign client compatibility', () => {
  test('TanStack server accepts pure RunAgentInput with fan-out tool messages', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const body = {
      threadId: 'thread-foreign-1',
      runId: 'run-foreign-1',
      state: {},
      messages: [
        { id: 'u1', role: 'user', content: '[chat] recommend a guitar' },
      ],
      tools: [],
      context: [],
      forwardedProps: {
        provider: 'openai',
        feature: 'chat',
        testId,
        aimockPort,
      },
    }
    const response = await request.post('/api/chat', {
      data: body,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(
      response.ok(),
      `expected 200, got ${response.status()}: ${await response.text()}`,
    ).toBe(true)
    const text = await response.text()
    expect(text).toContain('RUN_FINISHED')
  })

  test('developer role is collapsed to system without breaking the run', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const body = {
      threadId: 'thread-foreign-2',
      runId: 'run-foreign-2',
      state: {},
      messages: [
        { id: 'd1', role: 'developer', content: 'You only speak in haiku.' },
        { id: 'u1', role: 'user', content: '[chat] recommend a guitar' },
      ],
      tools: [],
      context: [],
      forwardedProps: {
        provider: 'openai',
        feature: 'chat',
        testId,
        aimockPort,
      },
    }
    const response = await request.post('/api/chat', {
      data: body,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(response.ok()).toBe(true)
  })
})
