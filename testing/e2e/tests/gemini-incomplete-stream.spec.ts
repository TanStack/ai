import { test, expect } from './fixtures'

test('Gemini reports a chat stream that ends without a finishReason', async ({
  request,
}) => {
  const response = await request.post('/api/gemini-incomplete-stream/cut')
  expect(response.ok()).toBe(true)
  const result = await response.json()
  expect(result).toMatchObject({
    text: 'partial',
    finishCount: 0,
    errorCount: 1,
    errorCode: 'truncated-stream',
  })
  expect(result.events.slice(-2)).toEqual(['TEXT_MESSAGE_END', 'RUN_ERROR'])
  expect(result.events).not.toContain('RUN_FINISHED')
})

test('Gemini still finishes a complete chat stream', async ({ request }) => {
  const response = await request.post('/api/gemini-incomplete-stream/complete')
  expect(response.ok()).toBe(true)
  const result = await response.json()
  expect(result).toMatchObject({
    text: 'partial',
    finishCount: 1,
    errorCount: 0,
  })
  expect(result.events.at(-1)).toBe('RUN_FINISHED')
})
