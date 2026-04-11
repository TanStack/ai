import { test, expect } from './fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getMetadata,
  getToolCalls,
} from './tools-test/helpers'

test.describe('Tool Error Handling', () => {
  test('tool that throws error produces error result and chat continues', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'tool-error', testId, aimockPort)
    await runTest(page)

    // The agentic loop should handle the tool error and continue
    // (the tool throws, error becomes the tool result, LLM responds to the error)
    await waitForTestComplete(page, 15000, 1)

    const metadata = await getMetadata(page)
    // Tool was called even though it threw
    expect(parseInt(metadata.toolCallCount)).toBeGreaterThanOrEqual(1)

    const toolCalls = await getToolCalls(page)
    const failingCall = toolCalls.find(
      (tc: { name: string }) => tc.name === 'failing_tool',
    )
    expect(failingCall).toBeDefined()
  })
})
