import { test, expect } from './fixtures'

for (const stream of [false, true]) {
  test(`compatible summarize forwards maxLength (stream=${stream})`, async ({
    request,
    aimockPort,
    testId,
  }) => {
    const response = await request.post('/api/summarize', {
      data: {
        provider: 'openai-compatible',
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
    expect(calls[0]?.body?.max_tokens).toBe(73)
    expect(calls[0]?.body).not.toHaveProperty('max_output_tokens')
  })
}
