import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Race Condition E2E Tests
 *
 * These tests specifically target race conditions and event flow issues
 * in the client-side code. They're designed to catch bugs like:
 *
 * - Two client tool calls in a row where the second is blocked
 * - Approval responses being blocked by in-flight streams
 * - Tool results being added while stream is still processing
 * - Multiple rapid approvals causing deadlocks
 * - Continuation logic failing after mixed tool types
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
 * Helper to wait for the test to complete
 * Waits for either testComplete flag OR expected number of completed tools
 */
async function waitForTestComplete(
  page: Page,
  timeout = 20000,
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
      eventCount: el.getAttribute('data-event-count') || '',
      executionStartCount: el.getAttribute('data-execution-start-count') || '',
      executionCompleteCount:
        el.getAttribute('data-execution-complete-count') || '',
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
): Promise<Array<{ type: string; toolName: string; timestamp: number }>> {
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

/**
 * Helper to wait for approval section
 */
async function waitForApproval(page: Page, timeout = 10000): Promise<void> {
  await page.waitForSelector('#approval-section', { timeout })
}

test.describe('Race Condition Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools-test')
    await page.waitForSelector('#run-test-button')
  })

  /**
   * This test catches the specific bug where two client tool calls in a row
   * would fail because the send of the second tool's result was blocked
   * while the first transaction was still completing.
   */
  test('two client tools in sequence dont block each other', async ({
    page,
  }) => {
    await selectScenario(page, 'sequential-client-tools')

    const startTime = Date.now()

    // Run the test
    await page.click('#run-test-button')

    // Wait for completion - expect 2 client tools
    await waitForTestComplete(page, 20000, 2)

    const endTime = Date.now()
    const duration = endTime - startTime

    // Verify both tools executed
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.executionCompleteCount)).toBe(2)

    // Verify both start and complete events are in order
    const events = await getEventLog(page)
    const executionEvents = events.filter(
      (e) => e.type === 'execution-start' || e.type === 'execution-complete',
    )

    // Should have: start1, complete1, start2, complete2
    expect(executionEvents.length).toBe(4)
    expect(executionEvents[0]?.type).toBe('execution-start')
    expect(executionEvents[1]?.type).toBe('execution-complete')
    expect(executionEvents[2]?.type).toBe('execution-start')
    expect(executionEvents[3]?.type).toBe('execution-complete')

    // If it takes too long (e.g., > 10 seconds), it might indicate blocking
    // (each tool takes ~50ms, so total should be well under 5 seconds)
    expect(duration).toBeLessThan(10000)
  })

  /**
   * Tests that parallel client tools don't interfere with each other
   */
  test('parallel client tools execute without interference', async ({
    page,
  }) => {
    await selectScenario(page, 'parallel-client-tools')

    // Run the test
    await page.click('#run-test-button')

    // Wait for completion - expect 2 client tools in parallel
    await waitForTestComplete(page, 20000, 2)

    // Verify both tools executed
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.executionCompleteCount)).toBe(2)

    // Both tools should be in the event log
    const events = await getEventLog(page)
    const toolNames = [...new Set(events.map((e) => e.toolName))]
    expect(toolNames).toContain('show_notification')
    expect(toolNames).toContain('display_chart')
  })

  /**
   * Tests that rapid approval responses don't cause race conditions
   */
  test('rapid sequential approvals complete correctly', async ({ page }) => {
    await selectScenario(page, 'sequential-approvals')

    // Run the test
    await page.click('#run-test-button')

    // Wait for first approval
    await waitForApproval(page)

    // Approve as fast as possible
    await page.click('.approve-button')

    // Wait for second approval (or test to complete if it's fast enough)
    try {
      await page.waitForSelector('.approve-button', { timeout: 5000 })
      const approveButton = page.locator('.approve-button').first()
      if (await approveButton.isVisible()) {
        await approveButton.click()
      }
    } catch {
      // Second approval might have auto-processed
    }

    // Wait for completion - expect 2 approval tools
    await waitForTestComplete(page, 20000, 2)

    // Verify both approvals were processed
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.approvalGrantedCount)).toBe(2)
  })

  /**
   * Tests that parallel approvals can all be approved without blocking
   */
  test('parallel approvals can all be approved rapidly', async ({ page }) => {
    await selectScenario(page, 'parallel-approvals')

    // Run the test
    await page.click('#run-test-button')

    // Wait for approvals to appear
    await waitForApproval(page)

    // Approve both as fast as possible
    const buttons = page.locator('.approve-button')
    const count = await buttons.count()
    expect(count).toBe(2)

    // Get button IDs before clicking (since clicking removes the button from the list)
    const button1Id = await buttons.nth(0).getAttribute('id')
    const button2Id = await buttons.nth(1).getAttribute('id')

    // Click both using their specific IDs
    await page.click(`#${button1Id}`)
    await page.waitForTimeout(100) // Brief wait for React re-render
    await page.click(`#${button2Id}`)

    // Wait for completion - expect 2 approval tools
    await waitForTestComplete(page, 20000, 2)

    // Verify both were approved
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.approvalGrantedCount)).toBe(2)
  })

  /**
   * Tests that client tool execution doesn't block subsequent approval flow
   */
  test('client tool doesnt block subsequent approval', async ({ page }) => {
    await selectScenario(page, 'client-then-approval')

    // Run the test
    await page.click('#run-test-button')

    // Wait for approval to appear (after client tool auto-executes)
    await waitForApproval(page)

    // Approve
    await page.click('.approve-button')

    // Wait for completion - expect 2 tools (1 client + 1 approval)
    await waitForTestComplete(page, 20000, 2)

    // Verify flow completed
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.executionCompleteCount)).toBeGreaterThanOrEqual(1)
    expect(parseInt(metadata.approvalGrantedCount)).toBe(1)
  })

  /**
   * Tests that approval doesn't block subsequent client tool execution
   */
  test('approval doesnt block subsequent client tool', async ({ page }) => {
    await selectScenario(page, 'approval-then-client')

    // Run the test
    await page.click('#run-test-button')

    // Wait for approval
    await waitForApproval(page)

    // Approve
    await page.click('.approve-button')

    // Wait for completion - expect 2 tools (1 approval + 1 client)
    await waitForTestComplete(page, 20000, 2)

    // Verify client tool also executed
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.approvalGrantedCount)).toBe(1)
    expect(parseInt(metadata.executionCompleteCount)).toBeGreaterThanOrEqual(1)

    // Verify the notification tool executed
    const events = await getEventLog(page)
    const notificationExec = events.find(
      (e) =>
        e.toolName === 'show_notification' && e.type === 'execution-complete',
    )
    expect(notificationExec).toBeTruthy()
  })

  /**
   * Tests the triple sequence stress test
   */
  test('triple client sequence completes without blocking', async ({
    page,
  }) => {
    await selectScenario(page, 'triple-client-sequence')

    const startTime = Date.now()

    // Run the test
    await page.click('#run-test-button')

    // Wait for completion - expect 3 client tools
    await waitForTestComplete(page, 20000, 3)

    const endTime = Date.now()
    const duration = endTime - startTime

    // Verify all 3 tools executed
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.executionCompleteCount)).toBe(3)

    // Verify order: all executions should complete in sequence
    const events = await getEventLog(page)
    const completeEvents = events.filter((e) => e.type === 'execution-complete')
    expect(completeEvents.length).toBe(3)

    // If blocking occurs, this would take much longer than expected
    expect(duration).toBeLessThan(15000)
  })

  /**
   * Tests complex mixed flow: server -> client -> client
   */
  test('server then two clients flows correctly', async ({ page }) => {
    await selectScenario(page, 'server-then-two-clients')

    // Run the test
    await page.click('#run-test-button')

    // Wait for completion - expect 3 tools (1 server + 2 clients)
    await waitForTestComplete(page, 30000, 3)

    // Verify all tools completed
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.completeToolCount)).toBeGreaterThanOrEqual(3)

    // Verify both client tools executed (at least 2)
    expect(parseInt(metadata.executionCompleteCount)).toBeGreaterThanOrEqual(2)

    // Verify order in events
    const events = await getEventLog(page)
    const execOrder = events
      .filter((e) => e.type === 'execution-complete')
      .map((e) => e.toolName)

    expect(execOrder).toContain('show_notification')
    expect(execOrder).toContain('display_chart')
  })

  // Screenshot on failure
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/race-condition-failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      })

      const events = await getEventLog(page)
      const metadata = await getMetadata(page)

      console.log('Race condition test failed. Debug info:')
      console.log('Metadata:', metadata)
      console.log('Events:', JSON.stringify(events, null, 2))
    }
  })
})
