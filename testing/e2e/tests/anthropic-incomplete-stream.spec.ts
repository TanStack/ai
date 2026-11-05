import { test, expect } from './fixtures'

test('Anthropic reports a stream that ends before message_stop', async ({
  request,
}) => {
  const response = await request.post('/api/anthropic-incomplete-stream')
  expect(response.ok()).toBe(true)
  const result = await response.json()
  expect(result).toMatchObject({
    text: 'partial',
    finishCount: 0,
    errorCount: 1,
    errorCode: 'incomplete-stream',
  })
  expect(result.events.at(-1)).toBe('RUN_ERROR')
  expect(result.events).not.toContain('RUN_FINISHED')
})

test('Anthropic still finishes a complete stream', async ({ request }) => {
  const response = await request.post(
    '/api/anthropic-incomplete-stream?scenario=complete',
  )
  expect(response.ok()).toBe(true)
  const result = await response.json()
  expect(result).toMatchObject({
    text: 'partial',
    finishCount: 1,
    errorCount: 0,
  })
  expect(result.events.at(-1)).toBe('RUN_FINISHED')
})
