import { test, expect } from './fixtures'

/**
 * E2E coverage for the structured-output × middleware interaction
 * introduced in TanStack/ai#390. Two contracts under test:
 *
 *   1. Phase observation: the middleware chain sees chunks tagged with
 *      `ctx.phase === 'structuredOutput'` and `onFinish` is invoked exactly
 *      once. Guards against the pre-fix regression where the structured
 *      finalization adapter call bypassed the middleware chain entirely.
 *
 *   2. Streaming lifecycle: the consumer sees exactly one RUN_STARTED and
 *      one RUN_FINISHED chunk pair. Guards against the pre-fix regression
 *      where the streaming structured-output path emitted a synthetic
 *      terminal pair on top of the engine's, producing duplicate run
 *      lifecycle events to the consumer.
 *
 * Both tests drive the existing `/middleware-test` harness route with the
 * new `phase-recorder` middleware mode, which records `ctx.phase` per chunk
 * + `onFinish` count + post-middleware yielded chunks into a per-testId
 * server-side store. The page fetches that store in `onFinish` and surfaces
 * it via DOM elements (`#mw-phases-json`, `#mw-onfinish-count`,
 * `#mw-yielded-chunks-json`) which the spec reads.
 *
 * NOTE on naming: both scenarios below run with `stream: true` against the
 * harness route — the harness currently hard-codes streaming for both
 * `structured-output` and `structured-output-stream` modes. The first test
 * exercises the structured-output phase coverage via the SSE harness; the
 * true non-streaming `Promise<T>` path is covered by unit tests in
 * `packages/typescript/ai/tests/structured-output-middleware.test.ts`.
 * Adding a real non-streaming E2E scenario would require page-side rewiring
 * to await `Promise<T>` instead of iterating SSE and is out of scope here.
 */

function buildHarnessUrl(
  testId?: string,
  aimockPort?: number,
  provider?: string,
  model?: string,
): string {
  const params = new URLSearchParams()
  if (testId) params.set('testId', testId)
  if (aimockPort) params.set('aimockPort', String(aimockPort))
  if (provider) params.set('provider', provider)
  if (model) params.set('model', model)
  const qs = params.toString()
  return `/middleware-test${qs ? '?' + qs : ''}`
}

function parseStringArray(raw: string | null): Array<string> {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  return Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')
    ? parsed
    : []
}

function parseChunkSummaries(raw: string | null): Array<{ type: string }> {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const result: Array<{ type: string }> = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const inner: Record<string, unknown> = { ...entry }
    const t = inner.type
    if (typeof t === 'string') result.push({ type: t })
  }
  return result
}

test.describe('Structured Output × Middleware Coverage', () => {
  test('legacy finalization path: middleware observes structuredOutput phase chunks (claude-3-7-sonnet)', async ({
    page,
    testId,
    aimockPort,
  }) => {
    // Pinned to claude-3-7-sonnet because Claude 4.5+ adapters take the
    // #605 native-combined-mode path (no separate finalization → no
    // `structuredOutput` phase). The 3.7-sonnet adapter still uses the
    // forced-tool finalization workaround, which is what this contract
    // covers: any non-native-combined adapter must keep firing the
    // `structuredOutput` phase so middleware can observe it.
    await page.goto(
      buildHarnessUrl(testId, aimockPort, 'anthropic', 'claude-3-7-sonnet'),
    )
    await page.waitForTimeout(2000)

    await page.locator('#mw-scenario-select').selectOption('structured-output')
    await page.locator('#mw-mode-select').selectOption('phase-recorder')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 15000 },
    )

    const phasesJson = await page.locator('#mw-phases-json').textContent()
    const phases = parseStringArray(phasesJson)
    expect(phases).toContain('structuredOutput')

    const finishCountRaw = await page
      .locator('#mw-onfinish-count')
      .textContent()
    const finishCount = Number(finishCountRaw ?? '0')
    expect(finishCount).toBe(1)
  })

  test('native combined mode (#605): structuredOutput phase does NOT fire — single combined call observed via beforeModel only (openai)', async ({
    page,
    testId,
    aimockPort,
  }) => {
    // Default openai adapter (gpt-4o) declares supportsCombinedToolsAndSchema,
    // so the engine forwards outputSchema into the regular chatStream call
    // and harvests the JSON from accumulated content — no second adapter
    // request, no `structuredOutput` phase. This pins the new contract
    // introduced in #605.
    await page.goto(buildHarnessUrl(testId, aimockPort, 'openai'))
    await page.waitForTimeout(2000)

    await page.locator('#mw-scenario-select').selectOption('structured-output')
    await page.locator('#mw-mode-select').selectOption('phase-recorder')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 15000 },
    )

    const phasesJson = await page.locator('#mw-phases-json').textContent()
    const phases = parseStringArray(phasesJson)
    // Combined-mode contract: middleware sees the run through the regular
    // chat phases, not `structuredOutput`.
    expect(phases).not.toContain('structuredOutput')
    expect(phases).toContain('beforeModel')

    const finishCountRaw = await page
      .locator('#mw-onfinish-count')
      .textContent()
    const finishCount = Number(finishCountRaw ?? '0')
    expect(finishCount).toBe(1)
  })

  test('streaming structured output: consumer sees exactly one RUN_STARTED/RUN_FINISHED pair', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(buildHarnessUrl(testId, aimockPort))
    await page.waitForTimeout(2000)

    await page
      .locator('#mw-scenario-select')
      .selectOption('structured-output-stream')
    await page.locator('#mw-mode-select').selectOption('phase-recorder')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-test-complete') === 'true',
      { timeout: 15000 },
    )

    const yieldedJson = await page
      .locator('#mw-yielded-chunks-json')
      .textContent()
    const yielded = parseChunkSummaries(yieldedJson)
    expect(yielded.filter((c) => c.type === 'RUN_STARTED')).toHaveLength(1)
    expect(yielded.filter((c) => c.type === 'RUN_FINISHED')).toHaveLength(1)
  })
})
