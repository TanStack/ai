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
 * Drain Re-Entrancy Guard E2E Tests
 *
 * Regression test for GitHub issue #302 / PR #429.
 *
 * When multiple client tools complete in the same round, each addToolResult()
 * queues a checkForContinuation action. Without a re-entrancy guard on
 * drainPostStreamActions(), the first action's streamResponse() → finally →
 * drainPostStreamActions() (nested) steals the remaining actions from the
 * queue, permanently stalling the conversation. The user sees tool results
 * but the model never produces its follow-up text response.
 *
 * The fix adds a re-entrancy guard to drainPostStreamActions() and a
 * shouldAutoSend() check requiring tool-call parts before triggering
 * continuation.
 *
 * This test uses the parallel-client-tools scenario (2 client tools in the
 * same turn) and verifies not just that both tools execute, but critically
 * that the **continuation fires and the follow-up text response arrives**.
 * Without the fix, the test would time out waiting for the follow-up text.
 */

test.describe('Drain Re-Entrancy Guard (Regression #302)', () => {
  test('parallel client tools complete and continuation fires with follow-up text', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'parallel-client-tools', testId, aimockPort)
    await runTest(page)

    // Wait for the test to fully complete — this includes the continuation
    // round producing the follow-up text. Without the fix, this would
    // time out because the continuation never fires.
    await waitForTestComplete(page, 20000, 2)

    // Verify both client tools executed
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(metadata.isLoading).toBe('false')

    const events = await getEventLog(page)
    const toolNames = [...new Set(events.map((e) => e.toolName))]
    expect(toolNames).toContain('show_notification')
    expect(toolNames).toContain('display_chart')

    // Verify both tools reached execution-complete state
    const completionEvents = events.filter(
      (e) => e.type === 'execution-complete',
    )
    expect(completionEvents.length).toBe(2)

    // CRITICAL ASSERTION: Verify the follow-up text from round 2 was received.
    // Without the re-entrancy fix, the conversation stalls after both tools
    // complete — the continuation request is never sent, so this text never
    // arrives.
    const messages = await page.evaluate(() => {
      const el = document.getElementById('messages-json-content')
      if (!el) return []
      try {
        return JSON.parse(el.textContent || '[]')
      } catch {
        return []
      }
    })

    const assistantMessages = messages.filter(
      (m: any) => m.role === 'assistant',
    )

    // There should be at least 2 assistant messages:
    // 1. The tool-call round (with both tool calls + results)
    // 2. The continuation round (with the follow-up text)
    expect(assistantMessages.length).toBeGreaterThanOrEqual(2)

    // The follow-up text from the continuation round should be present
    const allTextParts = assistantMessages.flatMap((m: any) =>
      m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.content),
    )
    const allText = allTextParts.join(' ')
    expect(allText).toContain('All displayed')
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/drain-reentrance-failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      })

      const toolCalls = await getToolCalls(page)
      const metadata = await getMetadata(page)
      const events = await getEventLog(page)

      console.log('Test failed. Debug info:')
      console.log('Metadata:', metadata)
      console.log('Tool calls:', toolCalls)
      console.log('Events:', events)
    }
  })
})
