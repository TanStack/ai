import { test, expect, type Page } from '@playwright/test'

/**
 * Server-Client Sequence E2E Tests
 *
 * These tests verify that mixed server/client tool sequences work correctly,
 * including:
 * - Server tool followed by client tool
 * - Client tool followed by server tool
 * - Complex multi-step sequences
 * - Proper state management across tool types
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
      completeToolCount: el.getAttribute('data-complete-tool-count') || '',
      eventCount: el.getAttribute('data-event-count') || '',
      executionStartCount: el.getAttribute('data-execution-start-count') || '',
      executionCompleteCount:
        el.getAttribute('data-execution-complete-count') || '',
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
 * Helper to get tool calls
 */
async function getToolCalls(
  page: Page,
): Promise<Array<{ id: string; name: string; state: string }>> {
  return page.evaluate(() => {
    const el = document.getElementById('tool-calls-json')
    if (!el) return []
    try {
      return JSON.parse(el.textContent || '[]')
    } catch {
      return []
    }
  })
}

test.describe('Server-Client Sequence E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools-test')
    await page.waitForSelector('#run-test-button')
  })

  test('server tool followed by client tool', async ({ page }) => {
    await selectScenario(page, 'sequence-server-client')

    // Run the test
    await page.click('#run-test-button')

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')

    // Should have 2 tool calls (fetch_data server, display_chart client)
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(2)
    expect(parseInt(metadata.completeToolCount)).toBeGreaterThanOrEqual(2)

    // Verify client tool executed
    const events = await getEventLog(page)
    const chartExecution = events.find(
      (e) => e.toolName === 'display_chart' && e.type === 'execution-complete',
    )
    expect(chartExecution).toBeTruthy()
  })

  test('server then two client tools in sequence', async ({ page }) => {
    // Tests complex continuation: server -> client -> client
    await selectScenario(page, 'server-then-two-clients')

    // Run the test
    await page.click('#run-test-button')

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')

    // Should have 3 tool calls
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(3)
    expect(parseInt(metadata.completeToolCount)).toBeGreaterThanOrEqual(3)

    // Verify both client tools executed
    const events = await getEventLog(page)
    const notificationExecution = events.find(
      (e) =>
        e.toolName === 'show_notification' && e.type === 'execution-complete',
    )
    const chartExecution = events.find(
      (e) => e.toolName === 'display_chart' && e.type === 'execution-complete',
    )

    expect(notificationExecution).toBeTruthy()
    expect(chartExecution).toBeTruthy()

    // Verify order: notification should complete before chart starts
    // (they're in sequence, not parallel)
    const notificationCompleteTime = events.find(
      (e) =>
        e.toolName === 'show_notification' && e.type === 'execution-complete',
    )?.timestamp
    const chartStartTime = events.find(
      (e) => e.toolName === 'display_chart' && e.type === 'execution-start',
    )?.timestamp

    if (notificationCompleteTime && chartStartTime) {
      expect(notificationCompleteTime).toBeLessThanOrEqual(chartStartTime)
    }
  })

  test('parallel server tools complete correctly', async ({ page }) => {
    await selectScenario(page, 'parallel-tools')

    // Run the test
    await page.click('#run-test-button')

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')

    // Should have 2 tool calls (get_weather, get_time)
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(2)
    expect(parseInt(metadata.completeToolCount)).toBeGreaterThanOrEqual(2)

    // Verify both tools are in the tool calls list
    const toolCalls = await getToolCalls(page)
    const toolNames = toolCalls.map((tc) => tc.name)
    expect(toolNames).toContain('get_weather')
    expect(toolNames).toContain('get_time')
  })

  test('single server tool completes', async ({ page }) => {
    await selectScenario(page, 'server-tool-single')

    // Run the test
    await page.click('#run-test-button')

    // Wait for the test to complete
    await waitForTestComplete(page)

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')

    // Should have 1 tool call (get_weather)
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(1)
    expect(parseInt(metadata.completeToolCount)).toBeGreaterThanOrEqual(1)

    // Verify tool is in the calls list
    const toolCalls = await getToolCalls(page)
    const weatherTool = toolCalls.find((tc) => tc.name === 'get_weather')
    expect(weatherTool).toBeTruthy()
    // Server tools stay at 'input-complete' state but are tracked as complete via tool-result parts
    expect(['complete', 'input-complete', 'output-available']).toContain(
      weatherTool?.state,
    )
  })

  test('text only scenario has no tool calls', async ({ page }) => {
    await selectScenario(page, 'text-only')

    // Run the test
    await page.click('#run-test-button')

    // Wait for loading to finish
    await page.waitForFunction(
      () => {
        const metadata = document.getElementById('test-metadata')
        return metadata?.getAttribute('data-is-loading') === 'false'
      },
      { timeout: 10000 },
    )

    // Give it a moment to settle
    await page.waitForTimeout(500)

    // Verify no tool calls
    const metadata = await getMetadata(page)
    expect(parseInt(metadata.toolCallCount)).toBe(0)
  })

  // Screenshot on failure
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/sequence-failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      })

      const events = await getEventLog(page)
      const toolCalls = await getToolCalls(page)
      const metadata = await getMetadata(page)

      console.log('Test failed. Debug info:')
      console.log('Metadata:', metadata)
      console.log('Events:', events)
      console.log('Tool calls:', toolCalls)
    }
  })
})
