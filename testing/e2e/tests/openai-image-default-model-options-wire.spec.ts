import { test, expect } from './fixtures'

type JournalEntry = {
  path?: string
  headers?: Record<string, string>
  body: { quality?: string; background?: string } | null
}

/**
 * `/api/openai-image-default-model-options-wire` builds the image adapter
 * with `defaultModelOptions: { quality: 'low', background: 'opaque' }`, then
 * calls `generateImage()` two times: with no `modelOptions`, and with
 * `modelOptions: { quality: 'max' }`.
 */
test.describe('openai — image adapter defaultModelOptions', () => {
  test('defaults reach the wire and a call key replaces its default', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const response = await request.post(
      `/api/openai-image-default-model-options-wire?testId=${encodeURIComponent(testId)}`,
    )
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({ ok: true })

    const journalResponse = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journalResponse.json()) as Array<JournalEntry>
    const bodies = entries
      .filter(
        (entry) =>
          entry.headers?.['x-test-id'] === testId &&
          entry.path === '/v1/images/generations',
      )
      .map((entry) => ({
        quality: entry.body?.quality,
        background: entry.body?.background,
      }))

    expect(bodies).toEqual([
      { quality: 'low', background: 'opaque' },
      { quality: 'max', background: 'opaque' },
    ])
  })
})
