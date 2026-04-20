import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getMetadata,
  getEventLog,
  getToolCalls,
  getToolCallParts,
} from './helpers'

/**
 * Continuation Re-execution — Tool Call Arguments E2E Tests
 *
 * These tests verify that tool call arguments are correctly preserved during
 * continuation re-executions. When a client tool completes and the conversation
 * continues, the server re-processes message history containing pending tool
 * calls. Without emitting TOOL_CALL_START + TOOL_CALL_ARGS before
 * TOOL_CALL_END, tool-call parts arrive at the client with empty
 * arguments {}, potentially causing infinite re-execution loops.
 */

test.describe('Continuation Re-execution — Tool Call Arguments', () => {
  test('single client tool arguments preserved after continuation', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'client-tool-single', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page)

    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(1)

    const parts = await getToolCallParts(page)
    expect(parts.length).toBeGreaterThanOrEqual(1)

    const notificationCall = parts.find((tc) => tc.name === 'show_notification')
    expect(notificationCall).toBeDefined()
    expect(notificationCall?.arguments).toEqual({
      message: 'Hello from the AI!',
      type: 'info',
    })
  })

  test('sequential client tool arguments preserved across multiple continuations', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'sequential-client-tools', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 15000, 2)

    // Wait for execution events to propagate
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#test-metadata')
        return (
          parseInt(el?.getAttribute('data-execution-complete-count') || '0') >=
          2
        )
      },
      { timeout: 10000 },
    )

    const metadata = await getMetadata(page)
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(2)

    const parts = await getToolCallParts(page)
    const notificationCalls = parts.filter(
      (tc) => tc.name === 'show_notification',
    )
    expect(notificationCalls.length).toBeGreaterThanOrEqual(2)

    // Both sets of arguments must be present (order may vary)
    const allArgs = notificationCalls.map((tc) => tc.arguments)
    expect(allArgs).toContainEqual({
      message: 'First notification',
      type: 'info',
    })
    expect(allArgs).toContainEqual({
      message: 'Second notification',
      type: 'warning',
    })

    // No tool call should have empty arguments
    expect(
      notificationCalls.every((tc) => Object.keys(tc.arguments).length > 0),
    ).toBe(true)
  })

  test('parallel client tool arguments preserved in batch continuation', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'parallel-client-tools', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 15000, 2)

    const metadata = await getMetadata(page)
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(2)

    const parts = await getToolCallParts(page)
    expect(parts.length).toBeGreaterThanOrEqual(2)

    const notificationCall = parts.find((tc) => tc.name === 'show_notification')
    const chartCall = parts.find((tc) => tc.name === 'display_chart')

    expect(notificationCall).toBeDefined()
    expect(chartCall).toBeDefined()

    expect(notificationCall?.arguments).toEqual({
      message: 'Parallel 1',
      type: 'info',
    })
    expect(chartCall?.arguments).toEqual({
      type: 'bar',
      data: [1, 2, 3],
    })
  })

  test('mixed server and client tool arguments preserved in sequence', async ({
    page,
    testId,
    aimockPort,
  }) => {
    // Server tool (fetch_data) followed by client tool (display_chart)
    await selectScenario(page, 'sequence-server-client', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 20000, 1)

    const metadata = await getMetadata(page)
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(2)

    const parts = await getToolCallParts(page)
    expect(parts.length).toBeGreaterThanOrEqual(2)

    const fetchCall = parts.find((tc) => tc.name === 'fetch_data')
    const chartCall = parts.find((tc) => tc.name === 'display_chart')

    expect(fetchCall).toBeDefined()
    expect(chartCall).toBeDefined()

    expect(fetchCall?.arguments).toEqual({ source: 'api' })
    expect(chartCall?.arguments).toEqual({ type: 'bar', data: [1, 2, 3] })
  })

  // Screenshot on failure
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/continuation-args-failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
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
