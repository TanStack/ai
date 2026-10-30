import { test, expect } from './fixtures'

for (const tool of [false, true]) {
  test(`Ollama preserves length without executing truncated tools (tool=${tool})`, async ({
    request,
  }) => {
    const response = await request.post(
      `/api/ollama-finish-reason?tool=${tool}`,
    )
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body).toMatchObject({ requests: 1, executions: 0 })
    expect(body.events.at(-1)).toMatchObject({
      type: 'RUN_FINISHED',
      metadata: { tanstack: { finishReason: 'length' } },
    })
    expect(
      body.events.some((event: { type: string }) => event.type === 'RUN_ERROR'),
    ).toBe(false)
  })
}

test('Ollama still executes a complete tool call', async ({ request }) => {
  const response = await request.post(
    '/api/ollama-finish-reason?tool=true&reason=stop',
  )
  expect(response.ok()).toBe(true)
  const body = await response.json()
  expect(body).toMatchObject({ requests: 2, executions: 1 })
  expect(body.events.at(-1)).toMatchObject({
    type: 'RUN_FINISHED',
    metadata: { tanstack: { finishReason: 'stop' } },
  })
})
