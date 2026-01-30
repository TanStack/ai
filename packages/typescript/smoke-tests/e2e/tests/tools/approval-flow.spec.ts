import { test, expect, type Page } from '@playwright/test'

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

/**
 * Helper to select a scenario reliably (handles React hydration)
 */
async function selectScenario(page: Page, scenario: string): Promise<void> {
  // Wait for hydration
  await page.waitForTimeout(500)

  // Try selecting multiple times
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.focus('#scenario-select')
    await page.selectOption('#scenario-select', scenario)
    await page.waitForTimeout(200)

    const currentScenario = await page.evaluate(() =>
      document.getElementById('test-metadata')?.getAttribute('data-scenario'),
    )
    if (currentScenario === scenario) break
  }

  // Verify scenario is selected
  await page.waitForFunction(
    (expected) =>
      document
        .getElementById('test-metadata')
        ?.getAttribute('data-scenario') === expected,
    scenario,
    { timeout: 3000 },
  )

  // Wait for new client to initialize
  await page.waitForTimeout(300)
}

/**
 * Helper to wait for approval section to appear
 */
async function waitForApproval(page: Page, timeout = 10000): Promise<void> {
  await page.waitForSelector('#approval-section', { timeout })
}

/**
 * Helper to wait for the test to complete
 * Waits for either testComplete flag OR expected number of completed tools
 */
async function waitForTestComplete(
  page: Page,
  timeout = 15000,
  expectedToolCount = 1,
): Promise<void> {
  await page.waitForFunction(
    ({ minTools }) => {
      const metadata = document.getElementById('test-metadata')
      const testComplete =
        metadata?.getAttribute('data-test-complete') === 'true'
      const isLoading = metadata?.getAttribute('data-is-loading') === 'true'
      const completeToolCount = parseInt(
        metadata?.getAttribute('data-complete-tool-count') || '0',
        10,
      )

      // Consider complete if:
      // 1. testComplete flag is true, OR
      // 2. Not loading and we have at least the expected number of complete tools
      return testComplete || (!isLoading && completeToolCount >= minTools)
    },
    { minTools: expectedToolCount },
    { timeout },
  )

  // Give a little extra time for final state updates
  await page.waitForTimeout(200)
}

/**
 * Helper to get metadata values
 */
async function getMetadata(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const el = document.getElementById('test-metadata')
    if (!el) return {}
    return {
      scenario: el.getAttribute('data-scenario') || '',
      isLoading: el.getAttribute('data-is-loading') || '',
      testComplete: el.getAttribute('data-test-complete') || '',
      toolCallCount: el.getAttribute('data-tool-call-count') || '',
      pendingApprovalCount:
        el.getAttribute('data-pending-approval-count') || '',
      completeToolCount: el.getAttribute('data-complete-tool-count') || '',
      approvalGrantedCount:
        el.getAttribute('data-approval-granted-count') || '',
      approvalDeniedCount: el.getAttribute('data-approval-denied-count') || '',
    }
  })
}

/**
 * Helper to get the event log
 */
async function getEventLog(
  page: Page,
): Promise<Array<{ type: string; toolName: string }>> {
  return page.evaluate(() => {
    const el = document.getElementById('event-log-json')
    if (!el) return []
    try {
      return JSON.parse(el.textContent || '[]')
    } catch {
      return []
    }
  })
}

test.describe('Approval Flow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools-test')
    await page.waitForSelector('#run-test-button')
  })

  test('single approval flow - approve', async ({ page }) => {
    await selectScenario(page, 'approval-tool')

    // Run the test
    await page.click('#run-test-button')

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

  test('single approval flow - deny', async ({ page }) => {
    await selectScenario(page, 'approval-tool')

    // Run the test
    await page.click('#run-test-button')

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

  test('sequential approvals - both approved', async ({ page }) => {
    // This tests the specific issue: two approvals in sequence
    // The second approval shouldn't be blocked by the first
    await selectScenario(page, 'sequential-approvals')

    // Run the test
    await page.click('#run-test-button')

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

  test('parallel approvals - both approved', async ({ page }) => {
    // Two approvals requested at the same time
    await selectScenario(page, 'parallel-approvals')

    // Run the test
    await page.click('#run-test-button')

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

  test('client tool then approval', async ({ page }) => {
    // Tests that a client tool doesn't block subsequent approval
    await selectScenario(page, 'client-then-approval')

    // Run the test
    await page.click('#run-test-button')

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

  test('approval then client tool', async ({ page }) => {
    // Tests that approval doesn't block subsequent client tool
    await selectScenario(page, 'approval-then-client')

    // Run the test
    await page.click('#run-test-button')

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
