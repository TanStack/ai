import { test, expect } from './fixtures'

/**
 * Claude calls a server tool, then a client tool that interrupts the run. With
 * `withPersistence`, resuming the run must send and store each tool result
 * once. `/api/client-tool-resume-store` runs the turn and its resume and
 * returns what Claude received and what the store kept.
 */
test.describe('client tool resume — tool results in the store', () => {
  test('the resumed call and the store hold each tool result once', async ({
    request,
  }) => {
    const response = await request.post('/api/client-tool-resume-store')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      resumedToolResultIds: Array<string>
      storedToolResultIds: Array<string>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.resumedToolResultIds).toEqual(['toolu_lookup', 'toolu_ask'])
    expect(result.storedToolResultIds).toEqual(['toolu_lookup', 'toolu_ask'])
  })
})
