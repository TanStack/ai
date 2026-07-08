import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getToolCalls,
  waitForAssistantText,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('agentic-structured')) {
  test.describe(`${provider} — agentic-structured`, () => {
    test('calls tools then returns structured output', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'agentic-structured', testId, aimockPort),
      )

      await sendMessage(page, '[agentic] check inventory and recommend')
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      expect(toolCalls.length).toBeGreaterThanOrEqual(1)

      // Wait for text response after tool execution
      await waitForAssistantText(page, 'Fender Stratocaster')
    })
  })
}
