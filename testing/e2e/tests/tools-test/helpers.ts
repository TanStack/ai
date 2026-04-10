import type { Page } from '@playwright/test'

/**
 * Shared helpers for tools-test spec files.
 *
 * These helpers interact with the /tools-test page and the selectors it
 * exposes:
 *
 *   #scenario-select      — dropdown for choosing a test scenario
 *   #run-test-button      — button that starts the test
 *   #approval-section     — container shown when approvals are pending
 *   .approve-button       — class selector for approve buttons
 *   .deny-button          — class selector for deny buttons
 *   #approve-{id}         — specific approve button for a tool call
 *   #deny-{id}            — specific deny button for a tool call
 *   #test-metadata        — hidden div with data-* attributes used for assertions
 *   #event-log-json       — <script type="application/json"> with event array
 *   #tool-calls-json      — <script type="application/json"> with tool-call array
 *   #messages-json-content — <pre> with full messages JSON
 */

/**
 * Navigate to /tools-test and select a scenario reliably (handles React
 * hydration delays).
 */
export async function selectScenario(
  page: Page,
  scenario: string,
  testId?: string,
  aimockPort?: number,
): Promise<void> {
  const params = new URLSearchParams()
  if (testId) params.set('testId', testId)
  if (aimockPort) params.set('aimockPort', String(aimockPort))
  const qs = params.toString()
  await page.goto(`/tools-test${qs ? '?' + qs : ''}`)
  await page.waitForSelector('#run-test-button')

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
    { timeout: 10000 },
  )

  // Wait for new client to initialize
  await page.waitForTimeout(300)
}

/**
 * Click #run-test-button and wait for loading to start.
 */
export async function runTest(page: Page): Promise<void> {
  await page.click('#run-test-button')
}

/**
 * Wait for the test to complete.
 *
 * Considers the test complete when either:
 *   1. data-test-complete === "true", OR
 *   2. data-is-loading === "false" AND data-complete-tool-count >= expectedToolCount
 */
export async function waitForTestComplete(
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
 * Wait for the #approval-section element to become visible.
 */
export async function waitForApproval(
  page: Page,
  timeout = 10000,
): Promise<void> {
  await page.waitForSelector('#approval-section', { timeout })
}

/**
 * Read all data-* attributes from #test-metadata.
 */
export async function getMetadata(page: Page): Promise<Record<string, string>> {
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
      hasError: el.getAttribute('data-has-error') || '',
      errorMessage: el.getAttribute('data-error-message') || '',
    }
  })
}

/**
 * Parse the JSON event log from #event-log-json.
 */
export async function getEventLog(
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
 * Parse the JSON tool-calls list from #tool-calls-json.
 */
export async function getToolCalls(
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

/**
 * Extract tool-call parts with parsed arguments from #messages-json-content.
 */
export async function getToolCallParts(
  page: Page,
): Promise<Array<{ name: string; arguments: Record<string, unknown> }>> {
  return page.evaluate(() => {
    const el = document.getElementById('messages-json-content')
    if (!el) return []
    try {
      const messages = JSON.parse(el.textContent || '[]')
      const parts: Array<{ name: string; arguments: Record<string, unknown> }> =
        []
      for (const msg of messages) {
        for (const part of msg.parts || []) {
          if (part.type === 'tool-call') {
            parts.push({
              name: part.name,
              arguments:
                typeof part.arguments === 'string'
                  ? JSON.parse(part.arguments)
                  : part.arguments,
            })
          }
        }
      }
      return parts
    } catch {
      return []
    }
  })
}
