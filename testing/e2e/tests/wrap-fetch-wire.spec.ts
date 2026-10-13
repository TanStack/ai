import { test, expect } from './fixtures'

test('openai -- a middleware wrapFetch header reaches the provider', async ({
  request,
  aimockPort,
  testId,
}) => {
  const response = await request.post('/api/wrap-fetch-wire', {
    data: { testId },
  })
  expect(response.ok()).toBe(true)
  expect(await response.text()).toContain('Stratocaster')

  const journal = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries = (await journal.json()) as Array<{
    headers?: Record<string, string>
  }>
  const calls = entries.filter(
    (entry) => entry.headers?.['x-test-id'] === testId,
  )
  expect(calls).toHaveLength(1)
  expect(calls[0]?.headers?.['x-wrap-fetch']).toBe('e2e-trace')
})
