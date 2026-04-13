import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getMetadata,
  getEventLog,
  getToolCalls,
} from './helpers'

/**
 * Chat Flow E2E Tests — tools-test page
 *
 * These tests verify basic text and tool-call scenarios using the /tools-test
 * page and its /api/tools-test backend.
 */

test.describe('Chat Flow Tests (tools-test page)', () => {
  test('text-only scenario completes without tool calls', async ({
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
      { timeout: 15000 },
    )

    // Give it a moment to settle
    await page.waitForTimeout(500)

    // Verify no tool calls
    const metadata = await getMetadata(page)
    expect(parseInt(metadata.toolCallCount)).toBe(0)
    expect(parseInt(metadata.completeToolCount)).toBe(0)
  })

  test('text-only scenario shows response in messages JSON', async ({
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
      { timeout: 15000 },
    )

    await page.waitForTimeout(500)

    // The messages JSON should be populated
    const messagesJson = await page
      .locator('#messages-json-content')
      .textContent()
    const messages = JSON.parse(messagesJson || '[]')

    // Should have at least one message (user + assistant)
    expect(messages.length).toBeGreaterThanOrEqual(1)
  })

  test('single server tool scenario triggers a tool call', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'server-tool-single', testId, aimockPort)
    await runTest(page)

    await waitForTestComplete(page, 15000, 1)

    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(1)
    expect(parseInt(metadata.completeToolCount)).toBeGreaterThanOrEqual(1)
  })

  test('single client tool triggers execution events', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'client-tool-single', testId, aimockPort)
    await runTest(page)

    await waitForTestComplete(page, 15000, 1)

    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(1)

    // Verify client tool execution events were recorded
    const events = await getEventLog(page)
    const startEvents = events.filter((e) => e.type === 'execution-start')
    const completeEvents = events.filter((e) => e.type === 'execution-complete')

    expect(startEvents.length).toBeGreaterThanOrEqual(1)
    expect(completeEvents.length).toBeGreaterThanOrEqual(1)
  })

  test('tool calls appear in tool-calls JSON', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'server-tool-single', testId, aimockPort)
    await runTest(page)

    await waitForTestComplete(page, 15000, 1)

    const toolCalls = await getToolCalls(page)
    expect(toolCalls.length).toBeGreaterThanOrEqual(1)
    // Each entry should have id, name, state
    expect(toolCalls[0]).toHaveProperty('id')
    expect(toolCalls[0]).toHaveProperty('name')
    expect(toolCalls[0]).toHaveProperty('state')
  })

  // Screenshot on failure
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/chat-flow-failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
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
