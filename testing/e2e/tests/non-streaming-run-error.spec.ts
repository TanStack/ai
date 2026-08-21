import { test, expect } from './fixtures'

test('non-streaming chat rejects when the provider stream emits RUN_ERROR', async ({
  request,
}) => {
  const response = await request.post('/api/non-streaming-run-error')

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toMatchObject({
    rejected: true,
    message: expect.stringContaining('Synthetic upstream failure'),
    code: 'rate_limit_exceeded',
  })
})
