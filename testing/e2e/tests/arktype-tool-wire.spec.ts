import { test, expect } from './fixtures'

/**
 * Wire-format regression for #276 — ArkType schemas.
 *
 * ArkType's `type()` returns a callable function (with `~standard` attached),
 * not a plain object. `@tanstack/ai`'s schema-detection guards previously
 * required `typeof schema === 'object'`, so an ArkType `inputSchema` was never
 * recognized as a Standard JSON Schema. The raw validator function fell through
 * `convertSchemaToJsonSchema` unchanged and, when serialized to the wire, the
 * tool's `parameters` collapsed to `{}` (functions don't survive
 * `JSON.stringify`).
 *
 * This spec drives `/api/arktype-tool-wire` (OpenRouter chat adapter, ArkType
 * function tool) and inspects aimock's journal (`GET /v1/_requests`) to assert
 * the converted JSON Schema actually reached the provider.
 */
test.describe('arktype — tool schema wire format', () => {
  test.beforeEach(async ({ request, aimockPort }) => {
    // Clear the aimock journal so we only assert against this test's request —
    // adjacent specs share the same aimock instance.
    await request.delete(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  })

  test('ArkType inputSchema is converted to JSON Schema on the wire', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const res = await request.post(
      `/api/arktype-tool-wire?testId=${encodeURIComponent(testId)}`,
    )
    expect(res.ok()).toBe(true)
    const { ok } = (await res.json()) as { ok: boolean; error?: string }
    expect(ok).toBe(true)

    const journalRes = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journalRes.json()) as Array<{
      body: {
        tools?: Array<{
          type?: string
          function?: { name?: string; parameters?: Record<string, unknown> }
        }>
      } | null
    }>

    const captured = entries[0]?.body?.tools?.find(
      (t) => t.function?.name === 'get_arktype_weather',
    )

    // Before the fix `parameters` was `{}` (the ArkType validator function was
    // passed through unconverted and dropped by JSON serialization). After the
    // fix it is the real JSON Schema produced from the ArkType type.
    expect(captured?.function?.parameters).toMatchObject({
      type: 'object',
      properties: {
        city: { type: 'string' },
      },
    })
    expect(
      (captured?.function?.parameters?.['required'] as Array<string>) ?? [],
    ).toContain('city')
  })
})
