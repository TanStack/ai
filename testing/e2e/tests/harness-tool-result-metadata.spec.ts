import { expect, test } from './fixtures'

/**
 * Tool result metadata in a harness session view. See
 * `src/routes/api.harness-tool-result-metadata.ts`.
 */

const CALL = {
  name: 'search_docs',
  status: 'done',
  resultMetadata: {
    sources: [{ id: 'src-lighthouse', title: 'Lighthouse guide' }],
  },
}

test.describe('harness: tool result metadata', () => {
  test('the session view shows it live and after a reload', async ({
    request,
    testId,
  }) => {
    const res = await request.post(
      `/api/harness-tool-result-metadata?testId=${encodeURIComponent(testId)}`,
    )
    expect(res.ok()).toBe(true)
    const result = await res.json()
    expect(result.error ?? null).toBeNull()
    expect(result.live).toEqual([CALL])
    expect(result.reloaded).toEqual([CALL])
  })
})
