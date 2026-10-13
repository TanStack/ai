import { test, expect } from './fixtures'

test('fakeText from @tanstack/ai/testing runs a tool loop with no network', async ({
  request,
}) => {
  const response = await request.post('/api/fake-text')

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toEqual({
    text: 'Tool said: sunny in Oslo',
    callCount: 2,
    pending: 0,
  })
})
