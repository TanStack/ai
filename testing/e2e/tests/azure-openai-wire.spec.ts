import { test, expect } from './fixtures'

test('azure openai -- sends the Azure path, api-key, and deployment name', async ({
  request,
  aimockPort,
  testId,
}) => {
  const response = await request.post('/api/azure-openai-wire', {
    data: { testId },
  })
  expect(response.ok()).toBe(true)
  expect(await response.text()).toContain('Stratocaster')

  const journal = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries = (await journal.json()) as Array<{
    path?: string
    headers?: Record<string, string>
    body?: Record<string, unknown> | null
  }>
  const calls = entries.filter(
    (entry) => entry.headers?.['x-test-id'] === testId,
  )
  expect(calls).toHaveLength(1)
  expect(calls[0]?.path).toBe('/openai/v1/responses?api-version=v1')
  // aimock redacts the value of the key header in its journal.
  expect(calls[0]?.headers).toHaveProperty('api-key')
  expect(calls[0]?.headers).not.toHaveProperty('authorization')
  expect(calls[0]?.body?.model).toBe('e2e-deployment')
})
