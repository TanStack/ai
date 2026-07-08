import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getMetadata,
  getEventLog,
  getToolCalls,
  getMessages,
} from './helpers'

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

test.describe('Server-Client Sequence E2E Tests', () => {
  test('server tool followed by client tool', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'sequence-server-client', testId, aimockPort)
    await runTest(page)

    // Wait for the test to complete
    await waitForTestComplete(page, 15000, 2)

    // Wait for client execution events to propagate
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#test-metadata')
        return (
          parseInt(el?.getAttribute('data-execution-complete-count') || '0') >=
          1
        )
      },
      { timeout: 10000 },
    )

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')

    // Should have 2 tool calls (fetch_data server, display_chart client)
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(2)

    // Verify client tool executed
    const events = await getEventLog(page)
    const chartExecution = events.find(
      (e) => e.toolName === 'display_chart' && e.type === 'execution-complete',
    )
    expect(chartExecution).toBeTruthy()
  })

  test('server and client tool results populate tool-call output and complete state', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'sequence-server-client', testId, aimockPort)
    await runTest(page)

    await waitForTestComplete(page, 15000, 2)

    await page.waitForFunction(
      () => {
        const messagesEl = document.getElementById('messages-json-content')
        const messages = JSON.parse(messagesEl?.textContent || '[]')
        const toolCalls = messages.flatMap((msg: any) =>
          (msg.parts || []).filter((part: any) => part.type === 'tool-call'),
        )

        const fetchData = toolCalls.find(
          (part: any) => part.name === 'fetch_data',
        )
        const displayChart = toolCalls.find(
          (part: any) => part.name === 'display_chart',
        )

        return (
          fetchData?.state === 'complete' &&
          fetchData.output !== undefined &&
          displayChart?.state === 'complete' &&
          displayChart.output !== undefined
        )
      },
      { timeout: 10000 },
    )

    const messages = await getMessages(page)
    const toolCalls = messages.flatMap((msg) =>
      (msg.parts || []).filter((part: any) => part.type === 'tool-call'),
    )
    const toolResults = messages.flatMap((msg) =>
      (msg.parts || []).filter((part: any) => part.type === 'tool-result'),
    )

    const fetchData = toolCalls.find((part) => part.name === 'fetch_data')
    expect(fetchData).toMatchObject({
      state: 'complete',
      output: {
        source: 'api',
        data: [1, 2, 3, 4, 5],
      },
    })

    const displayChart = toolCalls.find((part) => part.name === 'display_chart')
    expect(displayChart?.state).toBe('complete')
    expect(displayChart?.output).toMatchObject({ rendered: true })
    expect(typeof displayChart?.output?.chartId).toBe('string')

    expect(
      toolResults.some(
        (part) =>
          part.toolCallId === fetchData?.id &&
          part.state === 'complete' &&
          JSON.parse(part.content).source === 'api',
      ),
    ).toBe(true)
  })

  test('server then two client tools in sequence', async ({
    page,
    testId,
    aimockPort,
  }) => {
    // Tests complex continuation: server -> client -> client
    await selectScenario(page, 'server-then-two-clients', testId, aimockPort)
    await runTest(page)

    // Wait for the test to complete — expect 3 tools (1 server + 2 clients)
    await waitForTestComplete(page, 30000, 3)

    // Wait for client tool executions to propagate
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

    // Verify results
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')

    // Should have 3 tool calls
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(3)

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

  test('parallel server tools complete correctly', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'parallel-tools', testId, aimockPort)
    await runTest(page)

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

  test('single server tool completes', async ({ page, testId, aimockPort }) => {
    await selectScenario(page, 'server-tool-single', testId, aimockPort)
    await runTest(page)

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
    expect(weatherTool?.state).toBe('complete')
  })

  test('text only scenario has no tool calls', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'text-only', testId, aimockPort)
    await runTest(page)

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
