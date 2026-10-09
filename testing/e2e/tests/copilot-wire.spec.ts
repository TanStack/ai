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

test('github copilot -- claude sends the bearer token and the Copilot headers', async ({
  request,
  testId,
}) => {
  const response = await request.post('/api/copilot-wire', {
    data: { testId, api: 'anthropic' },
  })
  expect(response.ok()).toBe(true)
  const result: {
    text: string
    url: string
    headers: Record<string, string>
  } = await response.json()
  expect(result.text).toContain('Stratocaster')
  expect(new URL(result.url).pathname).toBe('/v1/messages')
  expect(result.headers['authorization']).toBe('Bearer copilot-token')
  expect(result.headers['x-api-key']).toBeUndefined()
  expect(result.headers['user-agent']).toBe('e2e/1.0.0')
  expect(result.headers['openai-intent']).toBe('conversation-edits')
  expect(result.headers['x-github-api-version']).toBe('2026-08-01')
  expect(result.headers['x-interaction-type']).toBe('conversation-agent')
  expect(result.headers['x-interaction-id']).toBe('session-1')
  expect(result.headers['x-initiator']).toBe('user')
  expect(result.headers['anthropic-beta']).toBe(
    'interleaved-thinking-2025-05-14',
  )
})
