import { test, expect } from './fixtures'

// fixtures/summarize-abort/basic.json streams at 5 tokens per second, so the
// full summary takes many seconds. A 300 ms timeout must end the run first.
test('streaming summarize stops at its timeout', async ({
  request,
  aimockPort,
  testId,
}) => {
  const started = Date.now()
  const response = await request.post('/api/summarize', {
    data: {
      provider: 'openai',
      text: '[summarize-abort] A slow summary that the timeout must stop',
      stream: true,
      timeout: 300,
      aimockPort,
      testId,
    },
  })
  const body = await response.text()

  const elapsed = Date.now() - started
  expect(body).toContain('RUN_ERROR')
  expect(body).not.toContain('RUN_FINISHED')
  // An error that is not the timeout (a failed connection, a bad route)
  // comes at once. The timeout ends the run only after 300 ms.
  expect(elapsed).toBeGreaterThanOrEqual(250)
  expect(elapsed).toBeLessThan(5000)
})
