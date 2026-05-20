import { test, expect } from './fixtures'

/**
 * E2E coverage for the structured-output × middleware interaction
 * introduced in TanStack/ai#390. Two contracts under test:
 *
 *   1. Non-streaming path: the middleware chain sees chunks tagged with
 *      `ctx.phase === 'structuredOutput'` and `onFinish` is invoked exactly
 *      once. Guards against the pre-fix regression where the structured
 *      finalization adapter call bypassed the middleware chain entirely.
 *
 *   2. Streaming path: the consumer sees exactly one RUN_STARTED and one
 *      RUN_FINISHED chunk pair. Guards against the pre-fix regression where
 *      the streaming structured-output path emitted a synthetic terminal
 *      pair on top of the engine's, producing duplicate run lifecycle
 *      events to the consumer.
 *
 * Both tests drive the existing `/middleware-test` harness route with the
 * new `phase-recorder` middleware mode, which records `ctx.phase` per chunk
 * + `onFinish` count + post-middleware yielded chunks into a per-testId
 * server-side store. The page fetches that store in `onFinish` and surfaces
 * it via DOM elements (`#mw-phases-json`, `#mw-onfinish-count`,
 * `#mw-yielded-chunks-json`) which the spec reads.
 */

function buildHarnessUrl(testId?: string, aimockPort?: number): string {
  const params = new URLSearchParams()
  if (testId) params.set('testId', testId)
  if (aimockPort) params.set('aimockPort', String(aimockPort))
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
  test('non-streaming structured output: middleware observes finalization chunks', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(buildHarnessUrl(testId, aimockPort))
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
