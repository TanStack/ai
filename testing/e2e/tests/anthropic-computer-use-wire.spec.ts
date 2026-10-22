import { test, expect } from './fixtures'

/**
 * Wire format of Anthropic computer use. `computerUseTool()` is a beta tool,
 * so the request must carry its `anthropic-beta` header.
 *
 * `/api/anthropic-computer-use-wire` captures the outgoing request with a
 * custom `fetch` and returns its `anthropic-beta` header as JSON.
 */
test.describe('anthropic — computer use wire format', () => {
  test('computer_20250124 sends the computer-use-2025-01-24 beta', async ({
    request,
  }) => {
    const res = await request.post('/api/anthropic-computer-use-wire')
    expect(res.ok()).toBe(true)
    const { ok, error, anthropicBeta } = (await res.json()) as {
      ok: boolean
      error?: string
      anthropicBeta: string | null
    }

    if (!ok) {
      throw new Error(`Route failed: ${error}`)
    }

    expect(anthropicBeta ?? '').toContain('computer-use-2025-01-24')
  })
})
