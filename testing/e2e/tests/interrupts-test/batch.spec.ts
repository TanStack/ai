import type { Route } from '@playwright/test'
import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForApproval,
  waitForPendingApprovals,
  waitForTestComplete,
  getMetadata,
  getEventLog,
  approveEachItem,
  approveAll,
  denyAll,
  cancelAll,
  resolveAllMixed,
} from './helpers'

/**
 * Batch interrupt resolution — several approvals raised at once, resolved via
 * the root helpers (`resolveInterrupts(true|false)`, `cancelInterrupts()`, and
 * the resolver form) as well as per-item within the batch.
 */
test.describe('Batch interrupt resolution', () => {
  test('batch - approve all (root, boolean)', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'batch', testId, aimockPort)
    await runTest(page)
    await waitForApproval(page)
    await waitForPendingApprovals(page, 3)

    await approveAll(page)
    await waitForTestComplete(page)

    const meta = await getMetadata(page)
    expect(meta.hasError).toBe('false')
    expect(meta.testComplete).toBe('true')
    expect(parseInt(meta.completeToolCount)).toBe(3)
  })

  test('batch - deny all (root, boolean)', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'batch', testId, aimockPort)
    await runTest(page)
    await waitForApproval(page)
    await waitForPendingApprovals(page, 3)
    await denyAll(page)
    await waitForTestComplete(page)

    const meta = await getMetadata(page)
    expect(meta.hasError).toBe('false')
    expect(meta.testComplete).toBe('true')
    expect(parseInt(meta.approvalDeniedCount)).toBe(1)
  })

  test('batch - cancel all (root)', async ({ page, testId, aimockPort }) => {
    await selectScenario(page, 'batch', testId, aimockPort)
    await runTest(page)
    await waitForApproval(page)
    await waitForPendingApprovals(page, 3)
    await cancelAll(page)
    await page.waitForTimeout(500)

    const meta = await getMetadata(page)
    expect(meta.hasError).toBe('false')
    expect(parseInt(meta.approvalCancelledCount)).toBe(1)
  })

  test('batch - approve each item', async ({ page, testId, aimockPort }) => {
    await selectScenario(page, 'batch', testId, aimockPort)
    await runTest(page)
    await waitForApproval(page)
    await waitForPendingApprovals(page, 3)

    const clicked = await approveEachItem(page)
    expect(clicked).toBe(3)

    await waitForTestComplete(page)
    const meta = await getMetadata(page)
    expect(meta.hasError).toBe('false')
    expect(parseInt(meta.completeToolCount)).toBe(3)
  })

  test('batch-mixed - resolve all (root, resolver form)', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'batch-mixed', testId, aimockPort)
    await runTest(page)
    await waitForApproval(page)
    await waitForPendingApprovals(page, 3)

    await resolveAllMixed(page)
    await waitForTestComplete(page)

    const meta = await getMetadata(page)
    expect(meta.hasError).toBe('false')
    expect(meta.testComplete).toBe('true')
    expect(parseInt(meta.completeToolCount)).toBe(3)

    // The client tool in the mixed batch must have executed.
    const events = await getEventLog(page)
    expect(
      events.some(
        (e) =>
          e.type === 'execution-complete' && e.toolName === 'printIntakeTag',
      ),
    ).toBe(true)
  })

  test('clear ignores a late interrupt submission failure', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const pageErrors: Array<Error> = []
    page.on('pageerror', (error) => pageErrors.push(error))

    await selectScenario(page, 'batch', testId, aimockPort)
    await runTest(page)
    await waitForApproval(page)
    await waitForPendingApprovals(page, 3)

    // Hold the resume request. Without this, a fast resume ends before the
    // clear, and the test never sees a late failure.
    let heldRoute: Route | undefined
    await page.route(
      '**/api/interrupts-test',
      (route) => {
        heldRoute = route
      },
      { times: 1 },
    )

    await approveAll(page)
    await expect.poll(() => heldRoute).toBeDefined()
    await page.click('#clear-button')
    // The submission fails after the clear. The clear can already have
    // aborted the request, so the route can be handled already.
    await heldRoute?.abort('failed').catch(() => undefined)
    await page.waitForTimeout(200)

    const meta = await getMetadata(page)
    expect(meta.hasError).toBe('false')
    expect(meta.isLoading).toBe('false')
    expect(meta.interruptCount).toBe('0')
    expect(pageErrors).toEqual([])
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.log('Metadata:', await getMetadata(page))
      console.log('Events:', await getEventLog(page))
    }
  })
})
