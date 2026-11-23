import { test, expect } from './fixtures'

type JournalEntry = {
  headers?: Record<string, string>
  body: { provider?: Record<string, unknown> } | null
}

const expected = {
  default: { sort: 'latency', preferred_max_latency: { p90: 2.5 } },
  override: { only: ['openai'] },
}

test.describe('openrouter — adapter defaultModelOptions', () => {
  for (const scenario of ['default', 'override'] as const) {
    test(`${scenario}: provider routing on the wire`, async ({
      request,
      aimockPort,
      testId,
    }) => {
      const response = await request.post(
        `/api/openrouter-default-model-options-wire?testId=${encodeURIComponent(testId)}&scenario=${scenario}`,
      )
      expect(response.ok()).toBe(true)
      expect(await response.json()).toEqual({ ok: true })

      const journalResponse = await request.get(
        `http://127.0.0.1:${aimockPort}/v1/_requests`,
      )
      const entries = (await journalResponse.json()) as Array<JournalEntry>
      const captured = entries.find(
        (entry) => entry.headers?.['x-test-id'] === testId,
      )
      expect(captured?.body?.provider).toEqual(expected[scenario])
    })
  }
})
