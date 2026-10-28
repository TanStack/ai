import { test, expect } from './fixtures'

type JournalEntry = {
  headers?: Record<string, string>
  body: {
    stream_options?: Record<string, unknown>
  } | null
}

test.describe('openrouter — stream_options wire format', () => {
  for (const scenario of ['usage-off', 'default'] as const) {
    test(`${scenario}: stream_options on the wire (#1037)`, async ({
      request,
      aimockPort,
      testId,
    }) => {
      const response = await request.post(
        `/api/openrouter-stream-options-wire?testId=${encodeURIComponent(testId)}&scenario=${scenario}`,
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
      expect(captured).toBeDefined()
      expect(captured?.body).toEqual(expect.any(Object))

      if (scenario === 'usage-off') {
        expect(captured?.body).not.toHaveProperty('stream_options')
      } else {
        expect(captured?.body?.stream_options).toEqual({ include_usage: true })
      }
    })
  }
})
