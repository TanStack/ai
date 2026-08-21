import { test, expect } from './fixtures'

type JournalEntry = {
  headers?: Record<string, string>
  body: {
    response_format?: Record<string, unknown>
  } | null
}

test.describe('openrouter — json_object structured output', () => {
  test.beforeEach(async ({ request, aimockPort }) => {
    await request.delete(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  })

  test('preserves json_object through the SDK wire path (#1005)', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const response = await request.post(
      `/api/openrouter-json-object-wire?testId=${encodeURIComponent(testId)}`,
    )
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      ok: true,
      result: { name: 'Alice', age: 30 },
    })

    const journalResponse = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journalResponse.json()) as Array<JournalEntry>
    const captured = entries.find(
      (entry) => entry.headers?.['x-test-id'] === testId,
    )

    expect(captured?.body?.response_format).toEqual({
      type: 'json_object',
    })
  })
})
