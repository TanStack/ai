import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POST } from './api.chat'

test('POST without x-byok-openrouter returns 401 byok_missing', async (t) => {
  const previousKey = process.env.OPENROUTER_API_KEY
  t.after(() => {
    if (previousKey === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = previousKey
    }
  })
  delete process.env.OPENROUTER_API_KEY

  const response = await POST({
    request: new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [{ id: 'm1', role: 'user', content: 'hello' }],
        tools: [],
        context: [],
      }),
    }),
  })

  assert.equal(response.status, 401)
  const body: unknown = await response.json()
  assert.deepEqual(body, {
    error: {
      type: 'byok_missing',
      provider: 'openrouter',
      message: 'Missing openrouter API key',
    },
  })
})
