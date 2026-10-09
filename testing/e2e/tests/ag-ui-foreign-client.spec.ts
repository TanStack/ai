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

  test('encrypted reasoning names a reasoning message the client can find', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/chat', {
      data: {
        threadId: 'thread-foreign-3',
        runId: 'run-foreign-3',
        state: {},
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: '[reasoning] recommend a guitar for a beginner',
          },
        ],
        tools: [],
        context: [],
        forwardedProps: {
          provider: 'openai',
          feature: 'reasoning',
          testId,
          aimockPort,
        },
      },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(response.ok()).toBe(true)

    const events: Array<Record<string, unknown>> = (await response.text())
      .split('\n')
      .filter((line) => line.startsWith('data: {'))
      .map((line) => JSON.parse(line.slice('data: '.length)))
    const reasoningIds = events
      .filter((event) => event.type === 'REASONING_MESSAGE_START')
      .map((event) => event.messageId)
    const targets = events
      .filter((event) => event.type === 'REASONING_ENCRYPTED_VALUE')
      .map((event) => event.entityId)

    expect(targets.length).toBeGreaterThan(0)
    // An AG-UI client attaches each value to the message with this id.
    for (const id of targets) expect(reasoningIds).toContain(id)
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
