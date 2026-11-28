import { test, expect } from './fixtures'

test.describe('harness client events', () => {
  test('streams the first turn of a new thread, after a 404 with a long wait to connect again', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const res = await request.post('/api/harness-client-events', {
      headers: {
        authorization: 'Bearer e2e-token',
        'x-test-id': testId,
        'x-aimock-port': String(aimockPort),
      },
    })
    expect(res.ok()).toBe(true)
    const result: { error?: string; statuses: Array<number>; text: string } =
      await res.json()
    expect(result.error ?? null).toBeNull()

    // The thread had no entry, then the send ended the wait.
    expect(result.statuses).toEqual([404, 200])
    expect(result.text).toBe('Hello over the harness protocol.')
  })
})
