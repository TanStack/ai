import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getMetadata,
  getToolCalls,
} from './helpers'

/**
 * Null Tool Input E2E Tests
 *
 * Regression test for GitHub issue #265 / PR #430.
 *
 * When a model (e.g. Anthropic Claude) produces a tool_use block with no input
 * or literal null, JSON.parse('null') returns JavaScript null. Before the fix,
 * this would fail Zod schema validation and silently kill the agent loop —
 * the user would see "Let me check that..." then silence.
 *
 * The fix normalizes null/non-object parsed tool input to {} so the agent loop
 * continues and the tool executes successfully.
 *
 * This test verifies the full end-to-end flow:
 *   1. aimock returns a tool call with "null" as arguments
 *   2. The adapter + server-side chat() normalizes null → {}
 *   3. The tool executes successfully (schema has only optional fields)
 *   4. The agent loop continues to the next iteration
 *   5. The follow-up text response is received by the client
 */

test.describe('Null Tool Input E2E Tests (Regression #265)', () => {
  test('server tool with null arguments executes and agent loop continues', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'null-tool-input', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 30000)

    // Verify the test completed (agent loop didn't die)
    const metadata = await getMetadata(page)
    expect(metadata.testComplete).toBe('true')
    expect(metadata.isLoading).toBe('false')

    // Verify the tool call was made and completed
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(1)
    expect(parseInt(metadata.completeToolCount)).toBeGreaterThanOrEqual(1)

    // Verify check_status tool was called and completed
    const toolCalls = await getToolCalls(page)
    const statusTool = toolCalls.find((tc) => tc.name === 'check_status')
    expect(statusTool).toBeTruthy()
    expect(['complete', 'input-complete', 'output-available']).toContain(
      statusTool?.state,
    )

    // Verify the tool result does NOT contain a validation error
    // (proves null→{} normalization worked and the tool executed successfully)
    const messages = await page.evaluate(() => {
      const el = document.getElementById('messages-json-content')
      if (!el) return []
      try {
        return JSON.parse(el.textContent || '[]')
      } catch {
        return []
      }
    })
    const toolResults = messages.flatMap((m: any) =>
      m.parts.filter((p: any) => p.type === 'tool-result'),
    )
    expect(toolResults.length).toBeGreaterThanOrEqual(1)
    expect(toolResults[0].content).not.toContain('Input validation failed')
    expect(toolResults[0].content).toContain('"status":"ok"')

    // Verify the follow-up text was received (proves agent loop continued past
    // the null-input tool call to produce the second iteration's response)
    const assistantMessages = messages.filter(
      (m: any) => m.role === 'assistant',
    )
    expect(assistantMessages.length).toBeGreaterThanOrEqual(2)

    const lastAssistant = assistantMessages[assistantMessages.length - 1]
    const textParts = lastAssistant.parts.filter((p: any) => p.type === 'text')
    const allText = textParts.map((p: any) => p.content).join(' ')
    expect(allText).toContain('status check is complete')
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/null-tool-input-failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      })

      const toolCalls = await getToolCalls(page)
      const metadata = await getMetadata(page)

      console.log('Test failed. Debug info:')
      console.log('Metadata:', metadata)
      console.log('Tool calls:', toolCalls)
    }
  })
})
