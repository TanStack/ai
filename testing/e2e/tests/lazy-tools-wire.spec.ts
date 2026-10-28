import { test, expect } from './fixtures'

/**
 * Wire-format coverage for the lazy-tools `lazyToolsConfig.includeDescription`
 * knob (shared by `chat()` and Code Mode).
 *
 * Lazy tools are surfaced to the model through a synthetic discovery tool
 * (`__lazy__tool__discovery__`) whose `description` embeds the lazy-tool
 * catalog. `includeDescription` tunes how much of each lazy tool's description
 * that catalog shows:
 *   - 'none' (default) → bare names, byte-identical to legacy behavior
 *   - 'first-sentence' → `name — <first sentence>`
 *   - 'full' → `name — <full description>`
 *
 * With aimock the model never reflects the discovery tool's description back to
 * the browser, so the catalog is observable only on the provider request. This
 * spec drives `/api/lazy-tools-wire` (OpenAI chat adapter, two `lazy: true`
 * tools) and inspects aimock's journal (`GET /v1/_requests`) to assert the
 * discovery tool's catalog crossed the wire at the configured detail level.
 */

type JournalEntry = {
  headers?: Record<string, string>
  body: {
    tools?: Array<{
      type?: string
      function?: { name?: string; description?: string }
    }>
  } | null
}

const DISCOVERY_TOOL_NAME = '__lazy__tool__discovery__'

/**
 * Find the discovery tool's wire `description` for this test's request only.
 *
 * The journal is shared across all parallel tests on the one aimock instance,
 * so entries are filtered by the test's `X-Test-Id` (the same header that
 * isolates fixture sequencing) before reading the catalog text.
 */
async function discoveryDescription(
  request: import('@playwright/test').APIRequestContext,
  aimockPort: number,
  testId: string,
): Promise<string | undefined> {
  const journalRes = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries = (await journalRes.json()) as Array<JournalEntry>
  for (const entry of entries) {
    if (entry.headers?.['x-test-id'] !== testId) continue
    const discovery = entry.body?.tools?.find(
      (t) => t.function?.name === DISCOVERY_TOOL_NAME,
    )
    if (discovery?.function?.description) {
      return discovery.function.description
    }
  }
  return undefined
}

test.describe('lazy tools — discovery catalog wire format', () => {
  // No journal reset here: the shared aimock journal is filtered per-test by
  // X-Test-Id (see discoveryDescription), so a global DELETE would only race
  // with adjacent parallel specs on the same aimock instance.
  test("includeDescription: 'none' sends bare lazy tool names (legacy default)", async ({
    request,
    aimockPort,
    testId,
  }) => {
    const res = await request.post(
      `/api/lazy-tools-wire?includeDescription=none&testId=${encodeURIComponent(
        testId,
      )}`,
    )
    expect(res.ok()).toBe(true)
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)

    const description = await discoveryDescription(request, aimockPort, testId)
    expect(description).toBeDefined()
    // Bare names present, no description text appended.
    expect(description).toContain('search_inventory')
    expect(description).toContain('check_stock')
    expect(description).not.toContain('search_inventory — ')
    expect(description).not.toContain('Search the guitar inventory')
  })

  test("includeDescription: 'first-sentence' appends each lazy tool's first sentence", async ({
    request,
    aimockPort,
    testId,
  }) => {
    const res = await request.post(
      `/api/lazy-tools-wire?includeDescription=first-sentence&testId=${encodeURIComponent(
        testId,
      )}`,
    )
    expect(res.ok()).toBe(true)
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)

    const description = await discoveryDescription(request, aimockPort, testId)
    expect(description).toBeDefined()
    // First sentence appended, but not the trailing second sentence.
    expect(description).toContain(
      'search_inventory — Search the guitar inventory by keyword.',
    )
    expect(description).toContain(
      'check_stock — Check stock level for a guitar.',
    )
    expect(description).not.toContain('Returns matches.')
    expect(description).not.toContain('Returns quantity on hand.')
  })

  test("includeDescription: 'full' appends each lazy tool's full description", async ({
    request,
    aimockPort,
    testId,
  }) => {
    const res = await request.post(
      `/api/lazy-tools-wire?includeDescription=full&testId=${encodeURIComponent(
        testId,
      )}`,
    )
    expect(res.ok()).toBe(true)
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)

    const description = await discoveryDescription(request, aimockPort, testId)
    expect(description).toBeDefined()
    expect(description).toContain(
      'search_inventory — Search the guitar inventory by keyword. Returns matches.',
    )
    expect(description).toContain(
      'check_stock — Check stock level for a guitar. Returns quantity on hand.',
    )
  })
})
