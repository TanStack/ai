import { test, expect } from './fixtures'

/**
 * A classifier refusal that no server-side fallback served is not an error.
 * The run finishes with the `content_filter` finish reason.
 */
test.describe('anthropic — refusal stop', () => {
  test('RUN_FINISHED carries the content_filter finish reason', async ({
    request,
  }) => {
    const res = await request.post('/api/anthropic-refusal')
    const body: unknown = await res.json()

    expect(body).toMatchObject({ finishReason: 'content_filter' })
  })
})
