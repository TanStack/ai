import { test, expect } from './fixtures'

/**
 * A streamed `apply_patch_call` is added with an empty diff, and the diff
 * streams in before the item is done. The app must get the full diff.
 *
 * `/api/openai-apply-patch-wire` serves the model responses with a custom
 * `fetch` and returns the tool inputs as JSON.
 */
test.describe('openai — apply_patch wire format', () => {
  test('runs apply_patch with the streamed diff', async ({ request }) => {
    const res = await request.post('/api/openai-apply-patch-wire')
    expect(res.ok()).toBe(true)
    const { ok, error, toolInputs } = (await res.json()) as {
      ok: boolean
      error?: string
      toolInputs: Array<unknown>
    }

    if (!ok) {
      throw new Error(`Route failed: ${error}`)
    }

    expect(toolInputs).toEqual([
      {
        operation: {
          type: 'update_file',
          path: 'lib/fib.py',
          diff: '@@\n-def fib\n+def fibonacci\n',
        },
      },
    ])
  })
})
