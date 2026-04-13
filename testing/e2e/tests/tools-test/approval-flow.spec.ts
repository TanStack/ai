import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  waitForApproval,
  getMetadata,
  getEventLog,
} from './helpers'

/**
 * Approval Flow E2E Tests
 *
 * These tests verify that the approval flow works correctly,
 * including:
 * - Approval requests appearing in the UI
 * - Approve/Deny buttons working correctly
 * - Flow continuing after approval
 * - Sequential approvals not blocking each other
 * - Parallel approvals being handled correctly
 */

test.describe('Approval Flow E2E Tests', () => {
  test('single approval flow - approve', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'approval-tool', testId, aimockPort)
    await runTest(page)

    // Wait for approval request to appear
    await waitForApproval(page)

    // Verify approval section is visible
    await expect(page.locator('#approval-section')).toBeVisible()
    await expect(page.locator('.approve-button').first()).toBeVisible()

    // Click approve
    await page.click('.approve-button')

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.approvalGrantedCount)).toBe(1)
    expect(parseInt(metadata.approvalDeniedCount)).toBe(0)
  })

  test('single approval flow - deny', async ({ page, testId, aimockPort }) => {
    await selectScenario(page, 'approval-tool', testId, aimockPort)
    await runTest(page)

    // Wait for approval request to appear
    await waitForApproval(page)

    // Click deny
    await page.click('.deny-button')

    // Wait a bit for the flow to process the denial
    await page.waitForTimeout(500)

    // Verify denial was recorded
    const metadata = await getMetadata(page)
    expect(parseInt(metadata.approvalDeniedCount)).toBe(1)
    expect(parseInt(metadata.approvalGrantedCount)).toBe(0)
  })

  test('sequential approvals - both approved', async ({
    page,
    testId,
    aimockPort,
  }) => {
    // This tests the specific issue: two approvals in sequence
    // The second approval shouldn't be blocked by the first
    await selectScenario(page, 'sequential-approvals', testId, aimockPort)
    await runTest(page)

    // Wait for first approval
    await waitForApproval(page)

    // Approve the first one
    await page.click('.approve-button')

    // Wait for second approval to appear
    await page.waitForFunction(
      () => {
        const section = document.getElementById('approval-section')
        const buttons = document.querySelectorAll('.approve-button')
        // Either new approval appeared or section is visible
        return section !== null && buttons.length > 0
      },
      { timeout: 10000 },
    )

    // Approve the second one if present
    const approveButton = page.locator('.approve-button').first()
    if (await approveButton.isVisible()) {
      await approveButton.click()
    }

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.approvalGrantedCount)).toBe(2)
  })

  test('parallel approvals - both approved', async ({
    page,
    testId,
    aimockPort,
  }) => {
    // Two approvals requested at the same time
    await selectScenario(page, 'parallel-approvals', testId, aimockPort)
    await runTest(page)

    // Wait for approvals to appear
    await waitForApproval(page)

    // There should be 2 approve buttons initially
    const approveButtons = page.locator('.approve-button')
    const count = await approveButtons.count()
    expect(count).toBe(2)

    // Get the IDs of the approve buttons before clicking (they have id="approve-{toolCallId}")
    const button1Id = await approveButtons.nth(0).getAttribute('id')
    const button2Id = await approveButtons.nth(1).getAttribute('id')

    // Approve both using their specific IDs (since clicking one removes it from the list)
    await page.click(`#${button1Id}`)
    // Wait a moment for React to re-render
    await page.waitForTimeout(100)
    // The second button should still exist (may be at position 0 now)
    await page.click(`#${button2Id}`)

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.approvalGrantedCount)).toBe(2)
  })

  test('client tool then approval', async ({ page, testId, aimockPort }) => {
    // Tests that a client tool doesn't block subsequent approval
    await selectScenario(page, 'client-then-approval', testId, aimockPort)
    await runTest(page)

    // Wait for approval request (after client tool completes)
    await waitForApproval(page)

    // Approve
    await page.click('.approve-button')

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')

    // Check that client tool executed (via event log)
    const events = await getEventLog(page)
    const clientExecution = events.find(
      (e) =>
        e.toolName === 'show_notification' && e.type === 'execution-complete',
    )
    expect(clientExecution).toBeTruthy()
  })

  test('approval then client tool', async ({ page, testId, aimockPort }) => {
    // Tests that approval doesn't block subsequent client tool
    await selectScenario(page, 'approval-then-client', testId, aimockPort)
    await runTest(page)

    // Wait for approval request
    await waitForApproval(page)

    // Approve
    await page.click('.approve-button')

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')

    // Check that both approval and client tool executed
    const events = await getEventLog(page)
    const approvalEvent = events.find((e) => e.type === 'approval-granted')
    const clientExecution = events.find(
      (e) =>
        e.toolName === 'show_notification' && e.type === 'execution-complete',
    )

    expect(approvalEvent).toBeTruthy()
    expect(clientExecution).toBeTruthy()
  })

  // Screenshot on failure
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/approval-failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      })

      const events = await getEventLog(page)
      const metadata = await getMetadata(page)

      console.log('Test failed. Debug info:')
      console.log('Metadata:', metadata)
      console.log('Events:', events)
    }
  })
})
