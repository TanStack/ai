import { test, expect } from './fixtures'

test.describe('harness protocol', () => {
  const headers = (testId: string, aimockPort: number) => ({
    authorization: 'Bearer e2e-token',
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
  })

  test('refuses a request without the token', async ({ request }) => {
    const response = await request.get('/api/harness-protocol/capabilities')
    expect(response.status()).toBe(401)
  })

  test('lists exposed agents in the capabilities', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.get('/api/harness-protocol/capabilities', {
      headers: headers(testId, aimockPort),
    })
    const body = await response.json()
    expect(body.identity.name).toBe('e2e/protocol')
    expect(body.custom.tanstack.agents[0].name).toBe('echo')
  })

  test('streams a standard AG-UI run through a session', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-protocol/run', {
      headers: {
        ...headers(testId, aimockPort),
        'content-type': 'application/json',
      },
      data: {
        threadId: `protocol-${testId}`,
        runId: 'client-run',
        messages: [
          { id: 'u1', role: 'user', content: '[harness-protocol] hello' },
        ],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      },
    })
    expect(response.headers()['content-type']).toContain('text/event-stream')
    const text = await response.text()
    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)))
    const answer = events
      .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
      .map((event) => event.delta)
      .join('')
    expect(answer).toBe('Hello over the harness protocol.')
    expect(events.at(-1).name).toBe('harness.operation.finished')
  })

  test('changes a plugin setting and runs a plugin command', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const control = async (input: unknown) =>
      (
        await request.post('/api/harness-protocol/control', {
          headers: {
            ...headers(testId, aimockPort),
            'content-type': 'application/json',
          },
          data: { threadId: `plugins-${testId}`, input },
        })
      ).json()

    expect(
      await control({ op: 'config', key: 'tone', value: 'warm' }),
    ).toMatchObject({
      status: 'accepted',
    })
    const rejected = await control({ op: 'config', key: 'tone', value: 'loud' })
    expect(rejected.status).toBe('rejected')
    expect(rejected.reason).toContain('plain, warm')
    const command = await control({ op: 'command', name: 'greet' })
    expect(command.status).toBe('accepted')
    expect(command.operationId).toMatch(/^op-command-/)
  })

  test('takes a control input and returns a receipt', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-protocol/control', {
      headers: {
        ...headers(testId, aimockPort),
        'content-type': 'application/json',
      },
      data: {
        threadId: `control-${testId}`,
        input: { op: 'agent', agent: 'echo', input: { text: 'hi' } },
      },
    })
    const receipt = await response.json()
    expect(receipt.status).toBe('accepted')
    expect(receipt.operationId).toMatch(/^op-agent-/)
  })
})
