import { test, expect } from './fixtures'

test.describe('openai — completion-only response text', () => {
  test('returns final text when response.completed is the only populated text event', async ({
    request,
  }) => {
    const response = await request.post('/api/openai-completed-response-text')

    expect(response.ok()).toBe(true)
    await expect(response.json()).resolves.toEqual({
      text: 'Recovered from response.completed',
    })
  })
})
