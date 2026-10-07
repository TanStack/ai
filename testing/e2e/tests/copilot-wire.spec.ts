import { test, expect } from './fixtures'

for (const api of ['chat-completions', 'responses'] as const) {
  test(`github copilot -- ${api} sends the Copilot headers and body`, async ({
    request,
    aimockPort,
    testId,
  }) => {
    const response = await request.post('/api/copilot-wire', {
      data: { testId, api },
    })
    expect(response.ok()).toBe(true)
    expect(await response.text()).toContain('Stratocaster')

    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries: Array<{
      headers?: Record<string, string>
      body?: Record<string, unknown>
    }> = await journal.json()
    const calls = entries.filter(
      (entry) => entry.headers?.['x-test-id'] === testId,
    )
    expect(calls).toHaveLength(1)
    const headers = calls[0]?.headers
    expect(headers?.['authorization']).toBe('Bearer copilot-token')
    expect(headers?.['openai-intent']).toBe('conversation-edits')
    expect(headers?.['x-github-api-version']).toBe('2026-08-01')
    expect(headers?.['x-initiator']).toBe('user')
    if (api === 'responses') {
      expect(calls[0]?.body?.store).toBe(false)
      expect(calls[0]?.body?.include).toStrictEqual([
        'reasoning.encrypted_content',
      ])
    }
  })
}
