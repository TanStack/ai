import { test, expect } from './fixtures'

type JournalEntry = {
  headers?: Record<string, string>
  body: {
    reasoning?: Record<string, unknown>
  } | null
}

test.describe('openrouter — reasoning wire format', () => {
  test('reasoning enabled false reaches the wire as effort none (#1006)', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const response = await request.post(
      `/api/openrouter-reasoning-wire?testId=${encodeURIComponent(testId)}`,
    )
    expect(response.ok()).toBe(true)
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true)

    const journalResponse = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journalResponse.json()) as Array<JournalEntry>
    const captured = entries.find(
      (entry) => entry.headers?.['x-test-id'] === testId,
    )

    expect(captured?.body?.reasoning).toEqual({ effort: 'none' })
  })
})
