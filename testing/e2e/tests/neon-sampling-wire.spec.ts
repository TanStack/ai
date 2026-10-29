import { test, expect } from './fixtures'

for (const provider of ['neon', 'neon-anthropic']) {
  for (const stream of [false, true]) {
    test(`${provider} -- summarize omits rejected sampling (stream=${stream})`, async ({
      request,
      aimockPort,
      testId,
    }) => {
      const response = await request.post('/api/summarize', {
        data: {
          provider,
          text: '[summarize] The Fender Stratocaster is a versatile electric guitar',
          maxLength: 73,
          stream,
          aimockPort,
          testId,
        },
      })
      expect(response.ok()).toBe(true)
      expect(await response.text()).toContain('Stratocaster')

      const journal = await request.get(
        `http://127.0.0.1:${aimockPort}/v1/_requests`,
      )
      const entries = (await journal.json()) as Array<{
        headers?: Record<string, string>
        body?: Record<string, unknown>
      }>
      const calls = entries.filter(
        (entry) => entry.headers?.['x-test-id'] === testId,
      )
      expect(calls).toHaveLength(1)
      expect(calls[0]?.body?.model).toBe(
        provider === 'neon' ? 'gemini-3-8-flash' : 'claude-opus-5-5',
      )
      expect(calls[0]?.body?.max_tokens).toBe(73)
      expect(calls[0]?.body).not.toHaveProperty('temperature')
      expect(calls[0]?.body).not.toHaveProperty('top_p')
    })
  }
}

for (const stream of [false, true]) {
  test(`neon-responses -- summarize honors Responses token options (stream=${stream})`, async ({
    request,
  }) => {
    const response = await request.post(
      `/api/neon-wire?activity=summarize&stream=${stream}`,
    )
    expect(response.ok()).toBe(true)
    const { summary, requests } = await response.json()
    expect(summary).toContain('Stratocaster')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toContain('/openai/v1/responses')
    expect(requests[0].body).toMatchObject({
      model: 'gpt-6-1-sol',
      max_output_tokens: 91,
    })
    expect(requests[0].body).not.toHaveProperty('max_tokens')
    expect(requests[0].body).not.toHaveProperty('temperature')
  })
}

test('neon -- Gemini reasoning usage reaches the SSE client', async ({
  request,
}) => {
  const response = await request.post('/api/neon-wire')
  expect(response.ok()).toBe(true)
  const events = (await response.text())
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => JSON.parse(line.slice(6)))
  expect(events.some((event) => event.type === 'RUN_ERROR')).toBe(false)
  expect(
    events.find((event) => event.type === 'TEXT_MESSAGE_CONTENT'),
  ).toMatchObject({ delta: 'Hello' })
  expect(events.find((event) => event.type === 'RUN_FINISHED')).toMatchObject({
    usage: [
      {
        inputTokens: 180,
        outputTokens: 7,
        totalTokens: 459,
        reasoningTokens: 272,
      },
    ],
  })
})
