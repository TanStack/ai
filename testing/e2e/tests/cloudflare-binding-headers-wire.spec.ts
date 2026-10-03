import { test, expect } from './fixtures'

type JournalEntry = {
  headers?: Record<string, string>
}

test.describe('cloudflare — binding defaultHeaders on the wire', () => {
  test('sends x-session-affinity and drops OpenAI SDK headers', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const response = await request.post(
      `/api/cloudflare-binding-headers-wire?testId=${encodeURIComponent(testId)}`,
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
    expect(captured).toBeDefined()
    expect(captured?.headers?.['x-session-affinity']).toBe('ses_e2e')
    expect(captured?.headers).not.toHaveProperty('authorization')
    expect(
      Object.keys(captured?.headers ?? {}).filter((name) =>
        name.startsWith('x-stainless-'),
      ),
    ).toEqual([])
  })
})
