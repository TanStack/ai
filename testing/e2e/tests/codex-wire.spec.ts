import { test, expect } from './fixtures'

test('chatgpt codex backend -- sends the Codex headers and a stateless body', async ({
  request,
  aimockPort,
  testId,
}) => {
  const response = await request.post('/api/codex-wire', {
    data: { testId },
  })
  expect(response.ok()).toBe(true)
  const result: {
    text: string
    sent?: Record<string, unknown>
    headers?: Record<string, string>
  } = await response.json()
  expect(result.text).toContain('Stratocaster')

  const journal = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries: Array<{ path?: string; headers?: Record<string, string> }> =
    await journal.json()
  const calls = entries.filter(
    (entry) => entry.headers?.['x-test-id'] === testId,
  )
  expect(calls).toHaveLength(1)
  expect(calls[0]?.path).toBe('/v1/responses')

  // aimock redacts the token in its journal, so the route sends back the raw
  // headers and body that the adapter sent.
  expect(result.headers?.['authorization']).toBe('Bearer chatgpt-access-token')
  expect(result.headers?.['originator']).toBe('tanstack-ai-e2e')
  expect(result.headers?.['x-codex-beta-features']).toBe('remote_compaction_v2')
  expect(result.headers?.['chatgpt-account-id']).toBe('account-1')
  expect(result.headers?.['session-id']).toBe('thread-1')
  expect(result.sent?.store).toBe(false)
  expect(result.sent?.include).toStrictEqual(['reasoning.encrypted_content'])
  expect(result.sent).not.toHaveProperty('max_output_tokens')
})
