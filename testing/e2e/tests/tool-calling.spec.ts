import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getToolCalls,
  waitForAssistantText,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('tool-calling')) {
  test.describe(`${provider} — tool-calling`, () => {
    test('calls getGuitars and displays result', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'tool-calling', testId, aimockPort))

      await sendMessage(page, '[toolcall] what guitars do you have in stock')
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      expect(toolCalls.length).toBeGreaterThanOrEqual(1)
      expect(toolCalls[0].name).toBe('getGuitars')

      // Wait for the text response after tool execution (agentic loop's second LLM call)
      await waitForAssistantText(page, 'Fender Stratocaster')
    })
  })
}
