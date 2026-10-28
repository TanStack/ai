import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForGeneric,
  waitForTestComplete,
  getMetadata,
  resolveGeneric,
  cancelGeneric,
} from './helpers'

/**
 * Generic (non-tool) interrupt — the app raises an actionable pause the keeper
 * resolves with a payload, or cancels. Both paths round-trip through the
 * feeding-schedule middleware and settle.
 */
test.describe('Generic interrupt resolution', () => {
  test('feeding - resolve with payload', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'feeding', testId, aimockPort)
    await runTest(page)
    await waitForGeneric(page)
    await resolveGeneric(page)
    await waitForTestComplete(page)

    const meta = await getMetadata(page)
    expect(meta.hasError).toBe('false')
    expect(meta.testComplete).toBe('true')
    expect(parseInt(meta.genericResolvedCount)).toBe(1)
  })

  test('feeding - cancel', async ({ page, testId, aimockPort }) => {
    await selectScenario(page, 'feeding', testId, aimockPort)
    await runTest(page)
    await waitForGeneric(page)
    await cancelGeneric(page)
    await waitForTestComplete(page)

    const meta = await getMetadata(page)
    expect(meta.hasError).toBe('false')
    expect(parseInt(meta.genericCancelledCount)).toBe(1)
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.log('Metadata:', await getMetadata(page))
    }
  })
})
