import { test, expect } from './fixtures'

/**
 * Wire-format verification for OpenRouter's `webSearchTool()` and
 * `webFetchTool()` factories.
 *
 * Both factories now emit the SDK's canonical shapes
 * (`OpenRouterWebSearchServerTool` / `WebFetchServerTool`):
 * `{type: 'openrouter:web_*', parameters: {...config...}}`. The SDK's
 * outbound Zod schema preserves `parameters` on the wire, so caller-passed
 * `engine` / `maxResults` / `maxContentTokens` / `allowedDomains` etc.
 * actually reach OpenRouter.
 *
 * This spec drives the OpenRouter chat adapter against aimock and then
 * inspects aimock's journal endpoint (`GET /v1/_requests`) to assert the
 * bytes received over the wire. It pins the fix that landed alongside
 * #603 — previously the request body contained only `{type: 'web_*'}` with
 * all options silently dropped by the SDK serializer.
 */
test.describe('openrouter — web tool wire format', () => {
  test.beforeEach(async ({ request, aimockPort }) => {
    // Clear the aimock journal so we only assert against the request this
    // test triggers — adjacent specs share the same aimock instance.
    await request.delete(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  })

  test('SDK accepts webSearchTool() + webFetchTool() without throwing', async ({
    request,
    testId,
  }) => {
    const res = await request.post(
      `/api/openrouter-web-tools-wire?testId=${encodeURIComponent(testId)}`,
    )
    expect(res.ok()).toBe(true)
    const { ok } = (await res.json()) as { ok: boolean; error?: string }
    expect(ok).toBe(true)
  })

  test('webSearchTool({engine, maxResults, allowedDomains}) preserves config on the wire', async ({
    request,
    aimockPort,
    testId,
  }) => {
    await request.post(
      `/api/openrouter-web-tools-wire?testId=${encodeURIComponent(testId)}`,
    )
    const journalRes = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journalRes.json()) as Array<{
      body: { tools?: Array<Record<string, unknown>> } | null
    }>
    const captured = entries[0]?.body?.tools?.find(
      (t) => t['type'] === 'openrouter:web_search',
    )
    expect(captured).toMatchObject({
      type: 'openrouter:web_search',
      parameters: {
        engine: 'exa',
        max_results: 10,
        allowed_domains: ['example.com'],
      },
    })
  })

  test('webFetchTool({engine, maxContentTokens, allowedDomains, blockedDomains}) preserves config on the wire', async ({
    request,
    aimockPort,
    testId,
  }) => {
    await request.post(
      `/api/openrouter-web-tools-wire?testId=${encodeURIComponent(testId)}`,
    )
    const journalRes = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journalRes.json()) as Array<{
      body: { tools?: Array<Record<string, unknown>> } | null
    }>
    const captured = entries[0]?.body?.tools?.find(
      (t) => t['type'] === 'openrouter:web_fetch',
    )
    expect(captured).toMatchObject({
      type: 'openrouter:web_fetch',
      parameters: {
        engine: 'openrouter',
        max_content_tokens: 4000,
        allowed_domains: ['example.com'],
        blocked_domains: ['evil.example'],
      },
    })
  })
})
