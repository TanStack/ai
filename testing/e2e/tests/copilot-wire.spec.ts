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
    const result: {
      text: string
      sent?: { store?: unknown; include?: unknown }
    } = await response.json()
    expect(result.text).toContain('Stratocaster')

    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries: Array<{ headers?: Record<string, string> }> =
      await journal.json()
    const calls = entries.filter(
      (entry) => entry.headers?.['x-test-id'] === testId,
    )
    expect(calls).toHaveLength(1)
    const headers = calls[0]?.headers
    // aimock redacts the token in its journal. The header must still be there.
    expect(headers?.['authorization']).toBe('[REDACTED]')
    expect(headers?.['openai-intent']).toBe('conversation-edits')
    expect(headers?.['x-github-api-version']).toBe('2026-08-01')
    expect(headers?.['x-initiator']).toBe('user')
    if (api === 'responses') {
      // aimock logs a converted body for /v1/responses. The route sends back
      // the body that the adapter sent.
      expect(result.sent?.store).toBe(false)
      expect(result.sent?.include).toStrictEqual([
        'reasoning.encrypted_content',
      ])
    }
  })
}
