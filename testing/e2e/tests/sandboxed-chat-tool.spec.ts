import { test, expect } from './fixtures'

test('a sandboxed chat tool runs its snippet, and a blocked run reaches the model as a fixed tool error', async ({
  request,
}) => {
  const response = await request.post('/api/sandboxed-chat-tool')

  expect(response.ok()).toBe(true)
  const { text } = await response.json()
  expect(text).toContain('"qty":7')
  expect(text).toMatch(/spin.{0,4} blocked: a sandbox limit was hit/)
  expect(text).toMatch(/leaky.{0,4} blocked: the snippet failed/)
  // The facade's raw error text stays on the server.
  expect(text).not.toContain('db.internal')
})
