import { test, expect } from './fixtures'

test('legacy {messages, data} wire shape is rejected with a migration-pointing error', async ({
  request,
}) => {
  const oldBody = {
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'hi' }] },
    ],
    data: {},
  }
  const response = await request.post('/api/chat', {
    data: oldBody,
    headers: { 'Content-Type': 'application/json' },
  })
  expect(response.status()).toBe(400)
  const body = await response.text()
  expect(body).toMatch(/AG-UI|RunAgentInput|migration/i)
})
